import asyncio
import json
import os
import queue
import secrets
import sys
import threading
import uuid
import logging
from typing import Any, Dict, List, Optional, Union
from fastapi import FastAPI, HTTPException, Header, Cookie, Query
from fastapi.responses import StreamingResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sales_spark")

# Add current directory to path so we can import config/core
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Load main/.env BEFORE importing config.const (which reads os.getenv at import
# time). Without this, `python server.py` runs with no DATABASE_URL / Google
# creds and every DB-backed endpoint 500s. A real deployment (Cloud Run) sets
# these in the environment, where the missing .env file is simply a no-op.
try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except ImportError:
    pass

from config.const import (
    DEFAULT_SYSTEM_PROMPT,
    MODEL_NAME,
    FRONTEND_URL,
    GOOGLE_OAUTH_REDIRECT_URI,
    TTS_SERVER_URL,
)
from core.agent import Agent
from core.llm_client import OpenAICompatClient
from core.tool import ToolRegistry
from core.tool_calls import default_registry
from core.session import make_session, verify_session
from core.google_tools import build_google_tools
from core.people_tools import build_people_tools
from core.store import (
    get_chats,
    get_messages,
    save_message,
    delete_chat,
    get_notifications,
    create_notification,
    mark_notification_as_read,
    delete_notification,
    notification_exists_for_mail,
    get_all_linked_users,
    get_notification_by_id,
    get_user_profile,
    upsert_user_profile,
    find_person_by_email,
    create_full_person,
)
from core import google_oauth
from core.google_tools import build_google_tools, _service, _extract_plain_body
from core.weather_tools import build_weather_tools
from core.memory_tools import build_memory_tools
from core.web_search_tools import build_web_search_tools
from core.classifier import classify_is_addressing_ai, classify_is_conversation_ended
from core.store import (
    get_user_current_minutes,
    save_user_minutes_and_archive_old,
    search_user_skills,
)

# Local-dev login when Google OAuth isn't configured yet.
_ALLOW_MOCK_AUTH = os.getenv("ALLOW_MOCK_AUTH", "").lower() in ("1", "true", "yes")

app = FastAPI(title="Sales Spark Backend API")

# Enable CORS for frontend integration
origins = [FRONTEND_URL] if FRONTEND_URL else []
if "http://localhost:3000" in origins:
    origins.append("http://127.0.0.1:3000")
if not origins:
    origins = ["http://localhost:3000", "http://127.0.0.1:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatMessage(BaseModel):
    role: str
    content: Optional[Union[str, List[Any]]] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None
    name: Optional[str] = None

class ChatRequest(BaseModel):
    message: Union[str, List[Any]]
    chat_id: Optional[str] = None
    history: Optional[List[ChatMessage]] = None
    system_prompt: Optional[str] = None
    tool_mode: Optional[str] = "auto"
    save_to_history: Optional[bool] = True


class SummarizeRequest(BaseModel):
    history: List[Dict[str, Any]]
    title: Optional[str] = None


@app.post("/api/memory/summarize")
async def summarize_memory_endpoint(
    req: SummarizeRequest,
    authorization: Optional[str] = Header(None)
):
    """Summarize voice conversation history into meeting minutes & archive old minutes into skills."""
    uid = resolve_uid(authorization)
    if not req.history or len(req.history) == 0:
        return {"status": "ok", "message": "No history to summarize", "minutes": ""}

    logger.info(f"[summarize_memory_endpoint] Summarizing {len(req.history)} messages for uid={uid}")
    
    # Format conversation history
    lines = []
    for msg in req.history:
        role = msg.get("role", "unknown")
        speaker = "ユーザー" if role == "user" else "ジェニー(AI)"
        content = msg.get("content", "")
        if isinstance(content, list):
            content = " ".join([item.get("text", "") for item in content if isinstance(item, dict)])
        if content:
            lines.append(f"{speaker}: {content}")

    formatted_history = "\n".join(lines)

    summary_instruction = (
        "あなたは会話ログから今後の対話や業務に役立つ構造化された議事録（Markdown形式）を作成する専門AIです。\n"
        "以下のユーザーとジェニー（アシスタント）の会話内容を読み、今後の対話で参照すべき重要な記憶・議事録を簡潔にまとめてください。\n\n"
        "【議事録に含める項目】\n"
        "- 📌 主な話題・会話の要約\n"
        "- 🎯 決定事項・合意内容\n"
        "- 💡 ユーザーの好み・パーソナル情報・発言した重要事項\n"
        "- 📝 残っているTODOや次回の予定\n\n"
        "【会話履歴】\n" + formatted_history
    )

    try:
        client = OpenAICompatClient()
        ask_result = client.ask(
            user_content=summary_instruction,
            system_prompt="あなたは的確で簡潔な日本語の会話議事録・ナレッジ抽出AIです。",
            history=[],
            tool_registry=None,
            json_schema=None,
            tool_mode="off",
            stream=False,
            on_token=None,
            temperature=0.7,
            max_tokens=1024,
        )
        generated_minutes = ask_result.content.strip()
        if not generated_minutes:
            generated_minutes = "（特筆すべき決定事項なし）"

        # Archive old minutes into skills and save the new minutes
        res = save_user_minutes_and_archive_old(uid, generated_minutes, archive_title=req.title)
        logger.info(f"[summarize_memory_endpoint] Successfully saved minutes. Archived old: {res.get('archived_previous')}")

        return {
            "status": "ok",
            "minutes": generated_minutes,
            "archived_previous": res.get("archived_previous")
        }
    except Exception as e:
        logger.error(f"[summarize_memory_endpoint] Summarization failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class AddressingAiRequest(BaseModel):
    text: str
    last_ai_response: Optional[str] = None


class ConversationEndedRequest(BaseModel):
    ai_response: str


@app.post("/api/classifier/is-addressing-ai")
async def is_addressing_ai_endpoint(req: AddressingAiRequest):
    """Determine whether the user speech is addressing the AI assistant."""
    is_addressing = classify_is_addressing_ai(req.text, req.last_ai_response)
    return {"is_addressing": is_addressing}


@app.post("/api/classifier/is-conversation-ended")
async def is_conversation_ended_endpoint(req: ConversationEndedRequest):
    """Determine whether the assistant response marks the natural end of the conversation topic."""
    is_ended = classify_is_conversation_ended(req.ai_response)
    return {"is_ended": is_ended}


@app.get("/api/tts")
async def tts_proxy_endpoint(
    text: str = Query(..., description="Text to synthesize to speech"),
    steps: Optional[int] = Query(6, ge=1, le=100)
):
    """Proxy request to Irodori-TTS service running on GPU worker."""
    import urllib.request
    import urllib.parse
    import urllib.error

    clean_text = text.strip().replace("*", "").replace("`", "").replace("#", "")
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    query_params = urllib.parse.urlencode({"text": clean_text, "steps": steps or 6})
    target_url = f"{TTS_SERVER_URL}/tts?{query_params}"

    loop = asyncio.get_running_loop()

    def fetch_tts():
        req = urllib.request.Request(
            target_url,
            headers={"User-Agent": "SalesSpark-Backend/1.0"}
        )
        with urllib.request.urlopen(req, timeout=30.0) as response:
            return response.read()

    try:
        wav_data = await loop.run_in_executor(None, fetch_tts)
        return StreamingResponse(
            io.BytesIO(wav_data),
            media_type="audio/wav",
            headers={
                "Content-Disposition": "inline; filename=speech.wav",
                "Cache-Control": "no-store, no-cache, must-revalidate",
            }
        )
    except urllib.error.HTTPError as e:
        logger.error(f"TTS server returned HTTP error {e.code}: {e.reason}")
        raise HTTPException(status_code=e.code, detail=f"TTS server error: {e.reason}")
    except Exception as e:
        logger.error(f"Failed to fetch TTS from {target_url}: {e}")
        raise HTTPException(status_code=503, detail=f"TTS service unavailable: {str(e)}")


def resolve_uid(authorization: Optional[str], *, allow_anonymous: bool = True) -> str:
    """Verify the Bearer session token and return the uid (the user's Google sub).

    Raises 401 on an invalid/expired session. When `allow_anonymous` is False a
    token is mandatory (account-scoped endpoints)."""
    if authorization and authorization.startswith("Bearer "):
        claims = verify_session(authorization[7:])
        if not claims:
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        return claims["sub"]
    if not allow_anonymous:
        raise HTTPException(status_code=401, detail="Authentication required")
    return "anonymous_user"


class StreamingToolRegistry(ToolRegistry):
    def __init__(self, original_registry: ToolRegistry, event_queue: queue.Queue):
        super().__init__()
        self._tools = original_registry._tools.copy()
        self.event_queue = event_queue

    def execute(self, name: str, arguments: Dict[str, Any] | None) -> Any:
        self.event_queue.put({"type": "tool_start", "name": name, "arguments": arguments})
        try:
            result = super().execute(name, arguments)
            # A tool may return either a plain string (LLM-facing text) or a
            # dict {"llm_text": str, "diagram": {...}} to ALSO drive a custom
            # diagram visualization in the UI. When a diagram is present we push
            # it to the client as its own SSE event — sent whole, not token by
            # token — and strip it from what the LLM sees: the model only ever
            # receives llm_text, so the bulky JSON never pollutes its context.
            diagram = None
            if isinstance(result, dict) and "diagram" in result:
                diagram = result.get("diagram")
                text_result = result.get("llm_text", "")
            else:
                text_result = result if isinstance(result, str) else str(result)

            if diagram is not None:
                self.event_queue.put(
                    {"type": "custom_diagram", "name": name, "diagram": diagram}
                )
            self.event_queue.put({"type": "tool_end", "name": name, "result": text_result})
            return text_result
        except Exception as e:
            self.event_queue.put({"type": "tool_error", "name": name, "error": str(e)})
            raise e

def run_agent_thread(
    agent: Agent,
    message: Union[str, List[Any]],
    event_queue: queue.Queue,
    uid: str,
    chat_id: str,
    initial_history_len: int,
    save_to_history: bool = True,
):
    try:
        def on_token(token: str):
            event_queue.put({"type": "token", "content": token})

        final_content = agent.ask(message, on_token=on_token)
        
        # Save newly generated messages to DB only if save_to_history is True
        if save_to_history:
            new_messages = agent.memory[initial_history_len + 1:]
            for msg in new_messages:
                save_message(
                    uid=uid,
                    chat_id=chat_id,
                    role=msg["role"],
                    content=msg.get("content"),
                    tool_calls=msg.get("tool_calls"),
                    tool_call_id=msg.get("tool_call_id"),
                    name=msg.get("name"),
                )

        # Push the final state of memory (which includes assistant response and tool runs)
        event_queue.put({
            "type": "done",
            "final_content": final_content,
            "memory": agent.memory,
            "chat_id": chat_id
        })
    except Exception as e:
        event_queue.put({"type": "error", "error": str(e)})

import base64
import io
import re

def extract_text_from_file(mime_type: str, base64_data: str, file_name: str) -> str:
    try:
        decoded_bytes = base64.b64decode(base64_data)
    except Exception as e:
        return f"[エラー: ファイルデータのデコードに失敗しました: {e}]"

    # Excel の場合 (xlsx)
    if (mime_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" or 
            file_name.endswith(".xlsx")):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(decoded_bytes), read_only=True, data_only=True)
            text_parts = []
            for sheet_name in wb.sheetnames:
                sheet = wb[sheet_name]
                text_parts.append(f"--- シート: {sheet_name} ---")
                for row in sheet.iter_rows(values_only=True):
                    row_str = "\t".join([str(val) if val is not None else "" for val in row])
                    if row_str.strip():
                        text_parts.append(row_str)
            return "\n".join(text_parts)
        except Exception as e:
            return f"[エラー: Excelファイルの解析に失敗しました: {e}]"

    # CSV の場合
    elif mime_type == "text/csv" or file_name.endswith(".csv"):
        try:
            return decoded_bytes.decode("utf-8", errors="replace")
        except Exception as e:
            return f"[エラー: CSVファイルの読み込みに失敗しました: {e}]"

    # テキストファイルの場合
    elif mime_type.startswith("text/") or file_name.endswith((".txt", ".md", ".json", ".xml", ".yaml", ".yml")):
        try:
            return decoded_bytes.decode("utf-8", errors="replace")
        except Exception as e:
            return f"[エラー: テキストファイルの読み込みに失敗しました: {e}]"

    # その他
    else:
        try:
            return decoded_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return f"[未対応のファイル形式です (MIMEタイプ: {mime_type})。バイナリデータのためテキストとして抽出できません。]"

def preprocess_content(content: Any) -> Any:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return content
    
    new_content = []
    for item in content:
        if isinstance(item, dict) and item.get("type") == "image_url":
            img_url = item.get("image_url", {}).get("url", "")
            if img_url.startswith("data:"):
                match = re.match(r"^data:([^;]+);base64,(.+)$", img_url)
                if match:
                    mime_type, base64_data = match.groups()
                    if mime_type.startswith("image/"):
                        new_content.append(item)
                    else:
                        file_name = item.get("name", "添付ファイル")
                        extracted_text = extract_text_from_file(mime_type, base64_data, file_name)
                        new_content.append({
                            "type": "text",
                            "text": f"\n[添付ファイル: {file_name}]\n{extracted_text}\n[添付ファイル終わり]\n"
                        })
                else:
                    new_content.append(item)
            else:
                new_content.append(item)
        else:
            new_content.append(item)
    return new_content

@app.post("/api/chat")
async def chat_endpoint(
    req: ChatRequest,
    authorization: Optional[str] = Header(None)
):
    # Verify the session token if present, fallback to anonymous
    uid = resolve_uid(authorization)
    logger.info(f"[chat_endpoint] Invoked with uid: {uid}, save_to_history: {req.save_to_history}, has_auth: {bool(authorization)}")

    # Initialize client
    try:
        client = OpenAICompatClient()
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    event_queue = queue.Queue()
    # Base tools (file I/O, http, etc.) plus this user's Google Calendar/Gmail
    # tools, bound to their uid so the agent acts only on their account.
    base_registry = default_registry()
    google_tools = build_google_tools(uid)
    logger.info(f"[chat_endpoint] Built {len(google_tools)} Google tools for uid={uid}")
    base_registry.add_many(google_tools)
    base_registry.add_many(build_people_tools(uid))
    base_registry.add_many(build_weather_tools())
    base_registry.add_many(build_memory_tools(uid))
    base_registry.add_many(build_web_search_tools())
    wrapped_registry = StreamingToolRegistry(base_registry, event_queue)

    # Generate or use chat_id
    chat_id = req.chat_id or str(uuid.uuid4())

    # Check if we load history from Firestore or use the requested history
    memory_history = []
    if req.chat_id:
        db_messages = get_messages(uid, chat_id)
        for msg in db_messages:
            msg_dict = {"role": msg["role"]}
            if msg.get("content") is not None:
                msg_dict["content"] = preprocess_content(msg["content"])
            if msg.get("tool_calls"):
                msg_dict["tool_calls"] = msg["tool_calls"]
            if msg.get("tool_call_id"):
                msg_dict["tool_call_id"] = msg["tool_call_id"]
            if msg.get("name"):
                msg_dict["name"] = msg["name"]
            memory_history.append(msg_dict)
    elif req.history:
        for msg in req.history:
            msg_dict = {"role": msg.role}
            if msg.content is not None:
                msg_dict["content"] = preprocess_content(msg.content)
            if msg.tool_calls:
                msg_dict["tool_calls"] = msg.tool_calls
            if msg.tool_call_id:
                msg_dict["tool_call_id"] = msg.tool_call_id
            if msg.name:
                msg_dict["name"] = msg.name
            # Bug fix: previously this append was nested inside `if msg.name`,
            # so any message without a `name` (i.e. every normal user/assistant
            # turn) was dropped and the model lost all prior context.
            memory_history.append(msg_dict)

    preprocessed_message = preprocess_content(req.message)
    initial_history_len = len(memory_history)

    should_save = req.save_to_history is not False

    # Save the new user message to DB only if should_save is True
    if should_save:
        save_message(
            uid=uid,
            chat_id=chat_id,
            role="user",
            content=req.message, # save original content to DB
        )

    # Prepare effective system prompt with dynamic latest minutes
    effective_system_prompt = req.system_prompt or DEFAULT_SYSTEM_PROMPT
    current_minutes = get_user_current_minutes(uid)
    if current_minutes and current_minutes.strip():
        effective_system_prompt += f"\n\n【直近の会話議事録（前回の会話の記憶）】\n{current_minutes.strip()}"

    agent = Agent(
        client=client,
        system_prompt=effective_system_prompt,
        tools=wrapped_registry,
        tool_mode=req.tool_mode, # type: ignore
        memory=memory_history,
        stream=True,
    )

    # Start the agent running in a background thread
    t = threading.Thread(
        target=run_agent_thread,
        args=(agent, preprocessed_message, event_queue, uid, chat_id, initial_history_len, should_save),
        daemon=True
    )
    t.start()

    async def sse_generator():
        # Yield chat_info event first so client gets the chat_id immediately
        yield f"data: {json.dumps({'type': 'chat_info', 'chat_id': chat_id}, ensure_ascii=False)}\n\n"

        while True:
            try:
                event = event_queue.get_nowait()
            except queue.Empty:
                if not t.is_alive() and event_queue.empty():
                    break
                # Yield control back to the event loop so each already-queued
                # SSE chunk is physically flushed to the socket NOW. A blocking
                # queue.get() here would freeze the loop between yields, so the
                # agent's tokens get buffered and delivered in one burst at the
                # very end (the UI then shows no left-to-right streaming).
                await asyncio.sleep(0.02)
                continue

            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

            if event.get("type") in ("done", "error"):
                break

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            # Defensive: tell any intermediary (proxy/CDN) not to buffer the
            # stream. Harmless on a direct localhost connection.
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

@app.get("/api/chats")
async def list_chats_endpoint(authorization: Optional[str] = Header(None)):
    uid = resolve_uid(authorization)
    return {"chats": get_chats(uid)}

@app.get("/api/chats/{chat_id}")
async def get_chat_messages_endpoint(chat_id: str, authorization: Optional[str] = Header(None)):
    uid = resolve_uid(authorization)
    return {
        "chat_id": chat_id,
        "messages": get_messages(uid, chat_id)
    }

@app.delete("/api/chats/{chat_id}")
async def delete_chat_endpoint(chat_id: str, authorization: Optional[str] = Header(None)):
    uid = resolve_uid(authorization)
    delete_chat(uid, chat_id)
    return {"status": "ok", "message": f"Chat {chat_id} deleted."}


# --------------------------------------------------------------------------- #
# Authentication — Google login (replaces Firebase). One consent both logs the
# user in AND grants Calendar/Gmail.
# --------------------------------------------------------------------------- #
# The OAuth nonce cookie is first-party to the backend on both /api/auth/login
# and the callback. Secure only over HTTPS (so it still works on http://localhost).
_OAUTH_NONCE_COOKIE = "spark_oauth_nonce"
_COOKIE_SECURE = GOOGLE_OAUTH_REDIRECT_URI.startswith("https")


def _frontend_redirect(fragment: str) -> RedirectResponse:
    # Session token goes in the URL fragment (#) so it is never sent to servers
    # or written to access logs / Referer headers.
    return RedirectResponse(f"{FRONTEND_URL}#{fragment}")


@app.get("/api/auth/login")
async def auth_login():
    """Start login: redirect the browser to Google's consent screen."""
    if not google_oauth.is_configured():
        # Dev convenience: issue a mock session when Google isn't configured.
        if _ALLOW_MOCK_AUTH:
            session = make_session(
                "mock-user-tanaka", "tanaka.yuki@example.com", "田中 雪 (Mock)"
            )
            return _frontend_redirect(f"session={session}")
        raise HTTPException(status_code=503, detail="Google OAuth is not configured.")
    # Bind this login to the browser: a random nonce lives both in the signed
    # state and in an HttpOnly cookie; the callback requires them to match.
    nonce = secrets.token_urlsafe(24)
    try:
        url = google_oauth.build_login_url(nonce)
    except google_oauth.GoogleIntegrationError as e:
        raise HTTPException(status_code=503, detail=str(e))
    resp = RedirectResponse(url)
    resp.set_cookie(
        _OAUTH_NONCE_COOKIE,
        nonce,
        max_age=600,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite="lax",
        path="/api/auth",
    )
    return resp


@app.get("/api/auth/google/callback")
async def google_auth_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    spark_oauth_nonce: Optional[str] = Cookie(None),
):
    """OAuth redirect target. Verifies identity (and the browser-bound nonce),
    mints a session, and bounces back to the frontend with the session token in
    the URL fragment."""
    if error or not code or not state:
        return _frontend_redirect("login_error=1")
    try:
        identity = google_oauth.exchange_code_for_login(code, state, spark_oauth_nonce)
    except google_oauth.GoogleIntegrationError as e:
        print(f"Google login callback failed: {e}")
        return _frontend_redirect("login_error=1")
    session = make_session(
        identity["sub"],
        identity.get("email"),
        identity.get("name"),
        identity.get("picture"),
    )
    resp = _frontend_redirect(f"session={session}")
    resp.delete_cookie(_OAUTH_NONCE_COOKIE, path="/api/auth")
    return resp


@app.get("/api/auth/google/status")
async def google_auth_status(authorization: Optional[str] = Header(None)):
    """Whether the authenticated user has linked their Google account."""
    uid = resolve_uid(authorization, allow_anonymous=False)
    info = google_oauth.connection_info(uid)
    info["configured"] = google_oauth.is_configured()
    return info


@app.get("/api/calendar/events")
async def get_calendar_events(
    authorization: Optional[str] = Header(None),
    time_min: Optional[str] = None,
    time_max: Optional[str] = None,
):
    """Direct API endpoint to get Google Calendar events for Spark secretary view without LLM."""
    uid = resolve_uid(authorization, allow_anonymous=False)
    from core.google_tools import _calendar_list_events
    result = _calendar_list_events(uid, time_min=time_min, time_max=time_max)
    if isinstance(result, str):
        return {"connected": False, "message": result, "events": []}
    return {"connected": True, **result}


@app.delete("/api/auth/google")
async def google_auth_disconnect(authorization: Optional[str] = Header(None)):
    """Unlink the authenticated user's Google account."""
    uid = resolve_uid(authorization, allow_anonymous=False)
    google_oauth.disconnect(uid)
    return {"status": "ok"}


class AnalyzeEventRequest(BaseModel):
    event_id: str
    summary: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None


@app.get("/api/calendar/events/detail")
async def get_event_detail_meta(event_id: str, authorization: Optional[str] = Header(None)):
    """Fetch AI analysis marker and linked people for a specific calendar event."""
    uid = resolve_uid(authorization, allow_anonymous=False)
    from core.store import get_event_people_and_analysis
    return get_event_people_and_analysis(uid, event_id)


@app.post("/api/calendar/events/analyze")
async def analyze_event_with_ai(
    req: AnalyzeEventRequest,
    authorization: Optional[str] = Header(None)
):
    """Analyze event text with Gemma agent, extract names, determine if it is a meeting, update DB, and return details."""
    uid = resolve_uid(authorization, allow_anonymous=False)
    from core.store import get_or_create_person, link_event_person, mark_event_analyzed, get_event_people_and_analysis

    prompt = f"""【カレンダー予定からの人物抽出および会議判定タスク】
以下のカレンダー予定の「タイトル」および「詳細（本文・メモ）」、「開催場所」のテキストを総合解析し、
1. この予定に登場・参加・関連する人物の名前（氏名）を全て正確に抽出してください。
2. この予定が「会話や対話が発生する会議系（商談、ミーティング、打合せ、面談、面会、Discussion、Meeting、ヒアリングなど）」であるか判定してください。「移動」「TODO」「個人の作業」「休暇」などは非会議系です。

■ 予定情報:
・タイトル: {req.summary or '(なし)'}
・日程詳細: {req.description or '(なし)'}
・開催場所: {req.location or '(なし)'}

■ 回答ルール:
- 必ず以下のJSONフォーマットのみで出力してください。余計なマークダウンのコードブロック（```json）や説明テキストは一切含めないでください。

{{
  "people": ["人物名1", "人物名2"],
  "is_meeting": true
}}

※ 関連する人物がいない場合は "people" を空の配列 [] にしてください。
※ 会議系でない場合は "is_meeting" を false にしてください。"""

    is_meeting = False
    extracted_names = []
    try:
        llm = OpenAICompatClient()
        resp = llm.ask(
            user_content=prompt,
            system_prompt=DEFAULT_SYSTEM_PROMPT,
            history=[],
            tool_registry=None,
            json_schema=None
        )
        raw_res = resp.content.strip()
        
        import json
        import re
        cleaned_json = re.sub(r"^```json\s*", "", raw_res, flags=re.IGNORECASE)
        cleaned_json = re.sub(r"^```\s*", "", cleaned_json)
        cleaned_json = re.sub(r"\s*```$", "", cleaned_json).strip()
        
        parsed = json.loads(cleaned_json)
        extracted_names = parsed.get("people", [])
        is_meeting = bool(parsed.get("is_meeting", False))
    except Exception as e:
        logger.error("Failed LLM analysis: %s", e)
        # Fallback in case LLM output isn't perfect JSON
        if 'raw_res' in locals():
            if "true" in raw_res.lower() or "会議: はい" in raw_res or "is_meeting\": true" in raw_res:
                is_meeting = True
            # Try to grep names
            import re
            parts = re.split(r'[,、\n\s]+', raw_res)
            for p in parts:
                cleaned = p.strip(" -・*\"'{}[]:,")
                if cleaned and len(cleaned) < 30 and "なし" not in cleaned and "people" not in cleaned and "is_meeting" not in cleaned:
                    extracted_names.append(cleaned)

    from core.store import find_person_candidates, link_event_person, mark_event_analyzed, get_event_people_and_analysis, get_or_create_person

    pending_confirmations = []
    for name in extracted_names:
        candidates = find_person_candidates(uid, name)
        if candidates and candidates[0]["match_type"] == "exact":
            # Exact match: Automatically link existing person (No duplicate person created!)
            link_event_person(uid, req.event_id, candidates[0]["id"])
        else:
            # Fuzzy match or Completely New: Ask user for confirmation!
            pending_confirmations.append({
                "extracted_name": name,
                "candidates": candidates
            })

    mark_event_analyzed(uid, req.event_id, is_meeting)
    res_data = get_event_people_and_analysis(uid, req.event_id)
    res_data["pending_confirmations"] = pending_confirmations
    return res_data


class ConfirmPersonLinkRequest(BaseModel):
    event_id: str
    action: str  # 'link_existing' | 'create_new' | 'skip'
    extracted_name: str
    person_id: Optional[str] = None


@app.post("/api/calendar/events/confirm-person")
async def confirm_person_link(
    req: ConfirmPersonLinkRequest,
    authorization: Optional[str] = Header(None)
):
    """Confirm linking existing person or creating new person from AI calendar analysis."""
    uid = resolve_uid(authorization, allow_anonymous=False)
    from core.store import link_event_person, get_or_create_person, get_event_people_and_analysis

    if req.action == 'link_existing' and req.person_id:
        link_event_person(uid, req.event_id, req.person_id)
    elif req.action == 'create_new':
        person = get_or_create_person(uid, name=req.extracted_name)
        if person:
            link_event_person(uid, req.event_id, person["id"])

    return get_event_people_and_analysis(uid, req.event_id)


class CreateMinutesRequest(BaseModel):
    event_id: str
    transcript: str


@app.post("/api/calendar/events/minutes")
async def generate_and_save_event_minutes(
    req: CreateMinutesRequest,
    authorization: Optional[str] = Header(None)
):
    """Analyze conversation transcript with Gemma, generate markdown minutes, save to DB, and return details."""
    uid = resolve_uid(authorization, allow_anonymous=False)
    from core.store import save_event_minutes, get_event_people_and_analysis

    prompt = f"""【会議の会話ログからの議事録作成タスク】
以下の会議の会話ログ（文字起こしテキスト）を読み込んで、商談・会議の要点をまとめたMarkdown形式の綺麗な議事録を作成してください。

■ 会議の会話ログ:
{req.transcript}

■ 議事録の構成案（Markdown形式）：
- **会議概要** (日時、参加者、アジェンダなど)
- **決定事項** (合意に達した内容や決定事項)
- **主要な議論内容** (会話のポイント、顧客の関心・課題)
- **ネクストアクション / TODO** (誰が、いつまでに、何をするか)

余計な挨拶や説明は含めず、純粋なMarkdown形式の議事録のみを出力してください。"""

    try:
        llm = OpenAICompatClient()
        resp = llm.ask(
            user_content=prompt,
            system_prompt="あなたは優秀な証券会社のAIアシスタントです。会話ログから簡潔で読みやすいMarkdown形式の議事録を作成してください。",
            history=[],
            tool_registry=None,
            json_schema=None
        )
        minutes_md = resp.content.strip()
    except Exception as e:
        logger.error("Failed to generate minutes: %s", e)
        raise HTTPException(status_code=500, detail=f"議事録の自動生成に失敗しました: {str(e)}")

    save_event_minutes(uid, req.event_id, minutes_md)
    return get_event_people_and_analysis(uid, req.event_id)


class CreatePersonRequest(BaseModel):
    name: str
    company: Optional[str] = ""
    role: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    postal_code: Optional[str] = ""
    hobbies: Optional[str] = ""
    notes: Optional[str] = ""


@app.get("/api/people")
async def get_people_list(authorization: Optional[str] = Header(None)):
    """Get all digital business card / people profiles for user."""
    uid = resolve_uid(authorization, allow_anonymous=False)
    from core.store import get_all_people
    return {"people": get_all_people(uid)}


@app.post("/api/people")
async def create_person_profile(
    req: CreatePersonRequest,
    authorization: Optional[str] = Header(None)
):
    """Create or update a digital business card person profile."""
    uid = resolve_uid(authorization, allow_anonymous=False)
    from core.store import create_full_person
    person = create_full_person(uid, req.model_dump() if hasattr(req, 'model_dump') else req.dict())
    return {"status": "ok", "person": person}


@app.delete("/api/people/{person_id}")
async def delete_person_profile(
    person_id: str,
    authorization: Optional[str] = Header(None)
):
    """Delete a digital business card person profile."""
    uid = resolve_uid(authorization, allow_anonymous=False)
    from core.store import delete_person
    delete_person(uid, person_id)
    return {"status": "ok"}


@app.get("/api/people/{person_id}/events")
async def get_person_related_events(
    person_id: str,
    authorization: Optional[str] = Header(None)
):
    """Get all calendar events associated with a person profile."""
    uid = resolve_uid(authorization, allow_anonymous=False)
    from core.store import get_person_events
    from core.google_tools import _calendar_list_events

    linked_event_ids = get_person_events(uid, person_id)
    if not linked_event_ids:
        return {"events": []}

    import datetime
    time_min = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=90)).isoformat()
    cal_res = _calendar_list_events(uid, time_min=time_min, max_results=50)

    events_list = []
    if isinstance(cal_res, dict) and "diagram" in cal_res:
        all_events = cal_res["diagram"].get("events", [])
        for ev in all_events:
            if ev.get("id") in linked_event_ids:
                events_list.append(ev)

    events_list.sort(key=lambda x: x.get("start") or "")
    return {"events": events_list}


class OCRBusinessCardRequest(BaseModel):
    image_base64: str
    mime_type: Optional[str] = "image/jpeg"


@app.post("/api/people/ocr")
async def ocr_business_card_with_gemma(
    req: OCRBusinessCardRequest,
    authorization: Optional[str] = Header(None)
):
    """Analyze business card image using Gemma Vision LLM and extract structured profile JSON."""
    uid = resolve_uid(authorization, allow_anonymous=False)

    base64_data = req.image_base64
    if "," in base64_data:
        base64_data = base64_data.split(",", 1)[1]

    mime = req.mime_type or "image/jpeg"
    data_url = f"data:{mime};base64,{base64_data}"

    user_content = [
        {
            "type": "text",
            "text": """添付された名刺の画像から以下の情報を抽出し、必ず有効なJSONフォーマットのみで出力してください。

JSONキー仕様:
- "name": 名前 (漢字/ローマ字)
- "company": 会社名 / 組織名
- "role": 役職 / 部署名
- "email": メールアドレス
- "phone": 電話番号
- "postal_code": 郵便番号 (例: 100-0005 または 〒100-0005)
- "address": 会社住所 / 所在地
- "hobbies": 趣味や特筆事項
- "notes": その他の特記事項・備考

注意事項:
- 見つからない項目は空文字 "" にしてください。
- 余計な説明テキストやマークダウンコードブロック（```json）は含めず、純粋なJSON文字列のみを出力してください。"""
        },
        {
            "type": "image_url",
            "image_url": {
                "url": data_url
            }
        }
    ]

    try:
        llm = OpenAICompatClient()
        resp = llm.ask(
            user_content=user_content,
            system_prompt=DEFAULT_SYSTEM_PROMPT,
            history=[],
            tool_registry=None,
            json_schema=None
        )
        raw_res = resp.content.strip()
    except Exception as e:
        logger.error("Failed Gemma OCR analysis: %s", e)
        return {"status": "error", "message": str(e), "data": {}}

    import re
    cleaned_json = re.sub(r"^```json\s*", "", raw_res, flags=re.IGNORECASE)
    cleaned_json = re.sub(r"^```\s*", "", cleaned_json)
    cleaned_json = re.sub(r"\s*```$", "", cleaned_json).strip()

    parsed = {}
    try:
        parsed = json.loads(cleaned_json)
    except Exception as e:
        logger.warning("Failed to parse LLM JSON output (%s): %s", e, raw_res)
        parsed = {
            "name": "",
            "company": "",
            "role": "",
            "email": "",
            "phone": "",
            "address": "",
            "postal_code": "",
            "hobbies": "",
            "notes": raw_res
        }

    return {"status": "ok", "data": parsed}


@app.get("/api/tts")
def proxy_tts(text: str, steps: int = 6):
    """Proxy request to the local TTS server to avoid CORS issues in frontend."""
    import urllib.request
    import urllib.parse
    base_tts_url = os.getenv("TTS_URL", "http://127.0.0.1:8090").rstrip('/')
    encoded_text = urllib.parse.quote(text)
    tts_url = f"{base_tts_url}/tts?text={encoded_text}&steps={steps}"
    try:
        req = urllib.request.Request(tts_url)
        with urllib.request.urlopen(req, timeout=15) as response:
            data = response.read()
            content_type = response.info().get_content_type()
            from fastapi.responses import Response
            return Response(content=data, media_type=content_type)
    except Exception as e:
        logger.error(f"Failed to proxy TTS request: {e}")
        raise HTTPException(status_code=500, detail=f"TTS server error: {str(e)}")


@app.get("/api/notifications")
def api_get_notifications(authorization: Optional[str] = Header(None)):
    uid = resolve_uid(authorization, allow_anonymous=False)
    try:
        res = get_notifications(uid)
        return {"status": "ok", "data": res}
    except Exception as e:
        logger.error("Failed to get notifications: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/notifications/{notification_id}/read")
def api_mark_notification_as_read(notification_id: str, authorization: Optional[str] = Header(None)):
    uid = resolve_uid(authorization, allow_anonymous=False)
    try:
        mark_notification_as_read(uid, notification_id)
        return {"status": "ok"}
    except Exception as e:
        logger.error("Failed to mark notification as read: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/notifications/{notification_id}")
def api_delete_notification(notification_id: str, authorization: Optional[str] = Header(None)):
    uid = resolve_uid(authorization, allow_anonymous=False)
    try:
        delete_notification(uid, notification_id)
        return {"status": "ok"}
    except Exception as e:
        logger.error("Failed to delete notification: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/notifications/{notification_id}/rollback")
def api_rollback_notification(notification_id: str, authorization: Optional[str] = Header(None)):
    uid = resolve_uid(authorization, allow_anonymous=False)
    try:
        notif = get_notification_by_id(uid, notification_id)
        if not notif:
            raise HTTPException(status_code=404, detail="Notification not found")
        
        rollback_action = None
        for act in notif.get("actions", []):
            if act.get("type") == "rollback_calendar":
                rollback_action = act
                break
        
        if not rollback_action:
            raise HTTPException(status_code=400, detail="No rollback action found for this notification")
        
        meta = rollback_action.get("metadata", {})
        action_type = meta.get("action_type")
        event_id = meta.get("event_id")
        
        if not event_id:
            raise HTTPException(status_code=400, detail="Missing event_id in rollback metadata")
            
        svc = _service(uid, "calendar", "v3")
        if svc is None:
            raise HTTPException(status_code=503, detail="Google Account is not linked")
            
        if action_type == "create":
            svc.events().delete(calendarId="primary", eventId=event_id).execute()
            logger.info("Rolled back: Deleted event %s for user %s", event_id, uid)
        elif action_type == "update":
            old_data = meta.get("old_data", {})
            body = {
                "summary": old_data.get("summary", ""),
                "start": {"dateTime": old_data.get("start"), "timeZone": "Asia/Tokyo"},
                "end": {"dateTime": old_data.get("end"), "timeZone": "Asia/Tokyo"},
                "description": old_data.get("description", "")
            }
            svc.events().update(calendarId="primary", eventId=event_id, body=body).execute()
            logger.info("Rolled back: Restored event %s to old state for user %s", event_id, uid)
            
        mark_notification_as_read(uid, notification_id)
        delete_notification(uid, notification_id)
        return {"status": "ok"}
    except Exception as e:
        logger.error("Failed to rollback notification: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
class ReviseDraftRequest(BaseModel):
    instruction: str
    current_draft: str
    original_mail_body: str
    to: str
    subject: str


class SendDraftRequest(BaseModel):
    to: str
    subject: str
    body: str


class UserProfileUpdateRequest(BaseModel):
    name: str
    company: Optional[str] = ""
    role: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    postal_code: Optional[str] = ""
    hobbies: Optional[str] = ""
    notes: Optional[str] = ""


@app.get("/api/user/profile")
def api_get_user_profile(authorization: Optional[str] = Header(None)):
    uid = resolve_uid(authorization, allow_anonymous=False)
    try:
        profile = get_user_profile(uid)
        return {"status": "ok", "profile": profile}
    except Exception as e:
        logger.error("Failed to get user profile: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/user/profile")
def api_update_user_profile(req: UserProfileUpdateRequest, authorization: Optional[str] = Header(None)):
    uid = resolve_uid(authorization, allow_anonymous=False)
    try:
        profile = upsert_user_profile(uid, req.model_dump())
        return {"status": "ok", "profile": profile}
    except Exception as e:
        logger.error("Failed to update user profile: %s", e)
        raise HTTPException(status_code=500, detail=str(e))



@app.post("/api/notifications/{notification_id}/reply-draft/revise")
def api_revise_reply_draft(notification_id: str, req: ReviseDraftRequest, authorization: Optional[str] = Header(None)):
    uid = resolve_uid(authorization, allow_anonymous=False)
    system_prompt = (
        "あなたは優秀な証券会社のAI秘書です。現在の返信メールのドラフトを、ユーザーの修正指示に従って書き換えてください。\n"
        "余計な挨拶や説明は一切含めず、修正後のメール本文のみを直接出力してください。"
    )
    user_content = (
        f"元の受信メール:\n{req.original_mail_body}\n\n"
        f"現在の返信ドラフト:\n{req.current_draft}\n\n"
        f"ユーザーの修正指示: {req.instruction}"
    )
    client = OpenAICompatClient()
    try:
        res = client.ask(
            user_content=user_content,
            system_prompt=system_prompt,
            history=[],
            tool_registry=None,
            json_schema=None,
            tool_mode="off"
        )
        revised_draft = res.content.strip()
        import re
        revised_draft = re.sub(r"^```json\s*", "", revised_draft, flags=re.IGNORECASE)
        revised_draft = re.sub(r"^```\s*", "", revised_draft)
        revised_draft = re.sub(r"\s*```$", "", revised_draft).strip()
        return {"status": "ok", "draft_text": revised_draft}
    except Exception as e:
        logger.error("Failed to revise draft: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/notifications/{notification_id}/reply-draft/send")
def api_send_reply_draft(notification_id: str, req: SendDraftRequest, authorization: Optional[str] = Header(None)):
    uid = resolve_uid(authorization, allow_anonymous=False)
    from core.google_tools import _gmail_send
    try:
        res = _gmail_send(uid, req.to, req.subject, req.body)
        if "[error]" in res:
            raise HTTPException(status_code=500, detail=res)
            
        mark_notification_as_read(uid, notification_id)
        delete_notification(uid, notification_id)
        return {"status": "ok", "message": res}
    except Exception as e:
        logger.error("Failed to send draft email: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


 # Gemma email analyzer configuration
EMAIL_ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "category": {
            "type": "string",
            "enum": ["notification", "decision"]
        },
        "title": {
            "type": "string"
        },
        "content": {
            "type": "string"
        },
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": { "type": "string" },
                    "type": { "type": "string", "enum": ["reply_draft", "calendar_add", "snooze"] },
                    "metadata": {
                        "type": "object",
                        "properties": {
                            "to": { "type": "string" },
                            "subject": { "type": "string" },
                            "original_body": { "type": "string" },
                            "summary": { "type": "string" },
                            "start": { "type": "string" },
                            "end": { "type": "string" }
                        }
                    }
                },
                "required": ["label", "type"]
            }
        }
    },
    "required": ["category", "title", "content"]
}

# Calendar adjustment subagent schema
CALENDAR_ADJUSTMENT_SCHEMA = {
    "type": "object",
    "properties": {
        "action": {
            "type": "string",
            "enum": ["create", "update", "none"]
        },
        "target_event_id": {
            "type": "string"
        },
        "event_details": {
            "type": "object",
            "properties": {
                "summary": { "type": "string" },
                "start": { "type": "string", "description": "RFC3339 formatted ISO string (e.g. 2026-08-06T15:00:00+09:00)" },
                "end": { "type": "string", "description": "RFC3339 formatted ISO string" },
                "description": { "type": "string" }
            },
            "required": ["summary", "start", "end"]
        }
    },
    "required": ["action"]
}


def fetch_recent_calendar_events(uid: str) -> list[dict]:
    import datetime
    svc = _service(uid, "calendar", "v3")
    if svc is None:
        return []
    try:
        now = datetime.datetime.now(datetime.timezone.utc)
        time_min = (now - datetime.timedelta(days=7)).isoformat()
        time_max = (now + datetime.timedelta(days=7)).isoformat()
        items = svc.events().list(
            calendarId="primary",
            timeMin=time_min,
            timeMax=time_max,
            singleEvents=True,
            orderBy="startTime"
        ).execute().get("items", [])
        events = []
        for ev in items:
            events.append({
                "id": ev.get("id"),
                "summary": ev.get("summary", "(無題)"),
                "start": ev.get("start", {}).get("dateTime") or ev.get("start", {}).get("date") or "",
                "end": ev.get("end", {}).get("dateTime") or ev.get("end", {}).get("date") or "",
                "description": ev.get("description", "")
            })
        return events
    except Exception as e:
        logger.error("Failed to fetch recent events for user %s: %s", uid, e)
        return []


def adjust_calendar_schedule(uid: str, mail_body: str, from_addr: str, subject: str) -> tuple[bool, dict | None]:
    events = fetch_recent_calendar_events(uid)
    
    system_prompt = (
        "あなたはユーザーのカレンダーのスケジュール調整を行う優秀なエージェントです。\n"
        "受信したメールの内容と、現在のカレンダーの既存の予定一覧を比較し、メールで提案された日時・内容に基づいてスケジュールを自動で追加または変更（置換）するための指示を出力してください。\n\n"
        "ルール：\n"
        "- メールに書かれた打ち合わせや期日について、カレンダーの既存予定に類似の予定（例：同じ差出人との打ち合わせや、同じ時間帯の予定など）がある場合は 'update' と判定し、target_event_id にその既存イベントIDを指定してください。また、event_details に変更後の新しいタイトル・開始・終了日時を設定してください。\n"
        "- 既存カレンダーに関連する予定が見つからず、新規にカレンダーへ登録すべき内容である場合は 'create' と判定し、event_details に新規作成用のタイトル・開始・終了日時を設定してください。\n"
        "- カレンダーに登録すべきスケジュール情報（日時など）が含まれていない場合は 'none' と判定してください。\n\n"
        "出力は必ず指定されたJSONスキーマに完全に従った有効なJSONオブジェクトのみにしてください。"
    )
    
    user_content = f"送信者: {from_addr}\n件名: {subject}\nメール本文:\n{mail_body}\n\n既存カレンダー予定一覧:\n{json.dumps(events, ensure_ascii=False, indent=2)}"
    
    client = OpenAICompatClient()
    try:
        res = client.ask(
            user_content=user_content,
            system_prompt=system_prompt,
            history=[],
            tool_registry=None,
            json_schema=CALENDAR_ADJUSTMENT_SCHEMA,
            tool_mode="off"
        )
        raw_res = res.content.strip()
    except Exception as e:
        logger.error("Failed to run calendar adjustment sub-agent for user %s: %s", uid, e)
        return False, None

    import re
    cleaned_json = re.sub(r"^```json\s*", "", raw_res, flags=re.IGNORECASE)
    cleaned_json = re.sub(r"^```\s*", "", cleaned_json)
    cleaned_json = re.sub(r"\s*```$", "", cleaned_json).strip()

    try:
        parsed = json.loads(cleaned_json)
        action = parsed.get("action", "none")
        if action == "none":
            return False, None
            
        svc = _service(uid, "calendar", "v3")
        if svc is None:
            return False, None
            
        details = parsed.get("event_details", {})
        summary = details.get("summary")
        start = details.get("start")
        end = details.get("end")
        desc = details.get("description", "")
        
        if action == "create":
            body = {
                "summary": summary,
                "start": {"dateTime": start, "timeZone": "Asia/Tokyo"},
                "end": {"dateTime": end, "timeZone": "Asia/Tokyo"},
                "description": desc
            }
            created = svc.events().insert(calendarId="primary", body=body).execute()
            created_id = created.get("id")
            
            rollback_meta = {
                "action_type": "create",
                "event_id": created_id,
                "old_data": {}
            }
            change_desc = f"新規予定「{summary}」（開始: {start}）をカレンダーへ自動登録しました。"
            return True, {"meta": rollback_meta, "desc": change_desc, "title": f"【自動登録】予定「{summary}」を追加しました"}
            
        elif action == "update":
            target_id = parsed.get("target_event_id")
            if not target_id:
                body = {
                    "summary": summary,
                    "start": {"dateTime": start, "timeZone": "Asia/Tokyo"},
                    "end": {"dateTime": end, "timeZone": "Asia/Tokyo"},
                    "description": desc
                }
                created = svc.events().insert(calendarId="primary", body=body).execute()
                created_id = created.get("id")
                rollback_meta = {
                    "action_type": "create",
                    "event_id": created_id,
                    "old_data": {}
                }
                change_desc = f"関連予定が見つからなかったため、新規予定「{summary}」（開始: {start}）を自動登録しました。"
                return True, {"meta": rollback_meta, "desc": change_desc, "title": f"【自動登録】予定「{summary}」を追加しました"}
            
            try:
                old_event = svc.events().get(calendarId="primary", eventId=target_id).execute()
                old_data = {
                    "summary": old_event.get("summary", ""),
                    "start": old_event.get("start", {}).get("dateTime") or old_event.get("start", {}).get("date") or "",
                    "end": old_event.get("end", {}).get("dateTime") or old_event.get("end", {}).get("date") or "",
                    "description": old_event.get("description", "")
                }
            except Exception as e:
                logger.error("Failed to retrieve old event %s: %s", target_id, e)
                old_data = {}
                
            body = {
                "summary": summary,
                "start": {"dateTime": start, "timeZone": "Asia/Tokyo"},
                "end": {"dateTime": end, "timeZone": "Asia/Tokyo"},
                "description": desc
            }
            svc.events().update(calendarId="primary", eventId=target_id, body=body).execute()
            
            rollback_meta = {
                "action_type": "update",
                "event_id": target_id,
                "old_data": old_data
            }
            change_desc = (
                f"{from_addr} からのメールに基づき、カレンダー予定を変更しました。\n\n"
                f"■ 変更前: 「{old_data.get('summary')}」（開始: {old_data.get('start')}）\n"
                f"■ 変更後: 「{summary}」（開始: {start}）"
            )
            return True, {"meta": rollback_meta, "desc": change_desc, "title": f"【自動変更】予定「{summary}」を調整しました"}
            
    except Exception as e:
        logger.error("Failed in adjust_calendar_schedule executions: %s", e)
        
    return False, None


DIGITAL_CARD_EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "name": { "type": "string" },
        "company": { "type": "string" },
        "role": { "type": "string" },
        "phone": { "type": "string" },
        "address": { "type": "string" },
        "postal_code": { "type": "string" },
        "hobbies": { "type": "string" },
        "notes": { "type": "string" }
    },
    "required": ["name"]
}

def extract_digital_card_info(mail_body: str, from_addr: str, subject: str) -> dict:
    """Extract sender's contact information from email headers and body to create business card."""
    system_prompt = (
        "あなたは受信したメール本文とヘッダー情報を解析し、送信者の名刺情報（デジタル連絡先プロファイル）を抽出する優秀なアシスタントです。\n"
        "メールアドレス、メール本文内の署名欄、挨拶文、トピックなどから、以下の項目を特定してJSON形式で抽出してください。\n\n"
        "【抽出項目】\n"
        "- name: 送信者の個人名（日本語表記。不明な場合はメールの差出人名やFromヘッダーから抽出）\n"
        "- company: 送信者の所属会社・組織名\n"
        "- role: 送信者の役職、肩書き、または所属部署\n"
        "- phone: 本文や署名に含まれる電話番号\n"
        "- address: 住所\n"
        "- postal_code: 郵便番号（例: 100-0001）\n"
        "- hobbies: 趣味（もしメール本文にゴルフや旅行などの趣味の記載があれば、なければ空）\n"
        "- notes: 自己紹介、署名の要約、または差出人の簡単な概要\n\n"
        "出力は必ず指定されたJSONスキーマに完全に従った有効なJSONオブジェクトのみにしてください。"
    )
    user_content = f"From: {from_addr}\nSubject: {subject}\nBody:\n{mail_body}"
    client = OpenAICompatClient()
    try:
        res = client.ask(
            user_content=user_content,
            system_prompt=system_prompt,
            history=[],
            tool_registry=None,
            json_schema=DIGITAL_CARD_EXTRACTION_SCHEMA,
            tool_mode="off"
        )
        raw_res = res.content.strip()
        import re
        cleaned_json = re.sub(r"^```json\s*", "", raw_res, flags=re.IGNORECASE)
        cleaned_json = re.sub(r"^```\s*", "", cleaned_json)
        cleaned_json = re.sub(r"\s*```$", "", cleaned_json).strip()
        parsed = json.loads(cleaned_json)
        
        # Make sure name is fallback-populated
        if not parsed.get("name"):
            # Extract name before '<' or '@'
            name_part = from_addr.split('<')[0].strip()
            if not name_part or '@' in name_part:
                name_part = from_addr.split('@')[0].strip()
            parsed["name"] = name_part or "送信者"
        return parsed
    except Exception as e:
        logger.error("Failed to extract digital card info: %s", e)
        # Fallback minimal card
        name_part = from_addr.split('<')[0].strip()
        if not name_part or '@' in name_part:
            name_part = from_addr.split('@')[0].strip()
        return {
            "name": name_part or "送信者",
            "company": "",
            "role": "",
            "phone": "",
            "address": "",
            "postal_code": "",
            "hobbies": "",
            "notes": f"自動登録 ({from_addr})"
        }


def fetch_past_conversations(uid: str, email_addr: str) -> str:
    """Fetch past email snippet history for a specific sender to use in draft context."""
    import re
    match = re.search(r'[\w\.-]+@[\w\.-]+', email_addr)
    if not match:
        return ""
    clean_email = match.group(0).lower()
    
    # Search for emails involving the clean_email address
    from core.google_tools import _gmail_search
    try:
        res = _gmail_search(uid, query=clean_email, max_results=3)
        if isinstance(res, dict) and "llm_text" in res:
            return res["llm_text"]
        elif isinstance(res, str):
            return res
    except Exception as e:
        logger.error("Failed to fetch past conversations for %s: %s", clean_email, e)
    return ""


def generate_reply_draft(uid: str, mail_body: str, from_addr: str, subject: str) -> str:
    # 1. Fetch user's own profile
    user_prof = get_user_profile(uid)
    user_info = "未設定"
    if user_prof:
        user_info = (
            f"名前: {user_prof.get('name')}\n"
            f"会社: {user_prof.get('company', '')}\n"
            f"役職: {user_prof.get('role', '')}\n"
            f"メール: {user_prof.get('email', '')}\n"
            f"趣味・関心: {user_prof.get('hobbies', '')}\n"
            f"自己紹介/メモ: {user_prof.get('notes', '')}"
        )

    # 2. Fetch recipient's digital business card (person)
    person = find_person_by_email(uid, from_addr)
    recipient_info = "デジタル名刺未登録（新規連絡先）"
    if person:
        recipient_info = (
            f"名前: {person.get('name')}\n"
            f"会社: {person.get('company', '')}\n"
            f"役職: {person.get('role', '')}\n"
            f"メール: {person.get('email', '')}\n"
            f"趣味・関心: {person.get('hobbies', '')}\n"
            f"メモ/備考: {person.get('notes', '')}"
        )

    # 3. Fetch past mail history
    past_history = fetch_past_conversations(uid, from_addr)

    system_prompt = (
        "あなたは優秀な証券会社のAI秘書です。受信したメールに対して、丁寧でビジネスとして完璧な返信メールのドラフトを作成してください。\n"
        "【作成時の考慮事項】\n"
        "- 差出人である「自分自身のプロフィール」と、宛先である「相手先のデジタル名刺情報」、および「過去のメール送受信履歴」が提供されている場合は、これらを考慮して文脈に合った返信内容（相手の役職、会社名、過去のトピックへの言及など）にしてください。\n"
        "余計な挨拶や説明（「こちらが返信ドラフトです」等）は一切含めず、メール本文（挨拶や署名を含む本文全体）のみを直接出力してください。"
    )
    
    user_content = (
        f"--- 自分自身（差出人）のプロフィール ---\n{user_info}\n\n"
        f"--- 相手先（受信相手）のデジタル名刺情報 ---\n{recipient_info}\n\n"
        f"--- 過去のメール履歴（最大3件） ---\n{past_history or '履歴なし'}\n\n"
        f"--- 今回受信したメール ---\n"
        f"送信者: {from_addr}\n件名: {subject}\nメール本文:\n{mail_body}"
    )
    
    client = OpenAICompatClient()
    try:
        res = client.ask(
            user_content=user_content,
            system_prompt=system_prompt,
            history=[],
            tool_registry=None,
            json_schema=None,
            tool_mode="off"
        )
        return res.content.strip()
    except Exception as e:
        logger.error("Failed to generate reply draft: %s", e)
        return ""
        
    except Exception as e:
        logger.error("Failed in adjust_calendar_schedule executions: %s", e)
        
    return False, None


def analyze_email_and_create_notification(uid: str, mail_id: str, from_addr: str, subject: str, body: str):
    logger.info(f"Analyzing email from {from_addr} with subject: {subject} for user {uid}")
    
    # 1. Try calendar adjustment subagent first
    adjusted, adj_data = adjust_calendar_schedule(uid, body, from_addr, subject)
    if adjusted and adj_data:
        meta = adj_data["meta"]
        desc = adj_data["desc"]
        title = adj_data["title"]
        
        # Create notification with rollback calendar option
        actions = [
            {
                "label": "元に戻す",
                "type": "rollback_calendar",
                "metadata": meta
            }
        ]
        create_notification(uid, "decision", title, desc, actions, mail_id)
        logger.info(f"Successfully adjusted schedule and created rollback notification for user {uid}")
        return

    # 2. Fallback to normal email summary analysis
    system_prompt = (
        "あなたは受信したメールを解析し、重要なお知らせやToDoを自動分類する優秀なアシスタントです。\n"
        "メール本文を読み、要約し、それが単なる「通知(notification)」か、何か行動を起こすべき「判断(decision)」かを判定し、指定されたJSONスキーマに従って出力してください。\n\n"
        "もし「判断(decision)」の場合、具体的なアクションの候補をactions配列に含めてください。\n"
        "アクションのタイプと構成：\n"
        "- 'reply_draft': メールの返信が必要な場合。metadataに \"to\" (宛先), \"subject\" (件名, 元の件名にRe:等を付与したもの), \"original_body\" (元の本文) を含めてください。\n"
        "- 'calendar_add': 打ち合わせの提案や締め切りなどの日程情報が含まれている場合。metadataに \"summary\" (カレンダー予定名), \"start\" (開始日時, RFC3339形式 例: 2026-08-06T15:00:00+09:00), \"end\" (終了日時, RFC3339形式) を含めてください。現在時刻を考慮して日時を推測してください。\n"
        "- 'snooze': 「後で通知する」ための汎用アクション。ラベルは「後で通知する」にしてください。\n\n"
        "出力は必ず指定されたJSONスキーマに完全に従った有効なJSONオブジェクトのみにしてください。"
    )

    user_content = f"送信者: {from_addr}\n件名: {subject}\n本文:\n{body}"

    client = OpenAICompatClient()
    try:
        res = client.ask(
            user_content=user_content,
            system_prompt=system_prompt,
            history=[],
            tool_registry=None,
            json_schema=EMAIL_ANALYSIS_SCHEMA,
            tool_mode="off"
        )
        raw_res = res.content.strip()
    except Exception as e:
        logger.error(f"Gemma email analysis failed for user {uid}, mail {mail_id}: {e}")
        return

    import re
    cleaned_json = re.sub(r"^```json\s*", "", raw_res, flags=re.IGNORECASE)
    cleaned_json = re.sub(r"^```\s*", "", cleaned_json)
    cleaned_json = re.sub(r"\s*```$", "", cleaned_json).strip()

def generate_reply_draft(uid: str, mail_body: str, from_addr: str, subject: str) -> str:
    system_prompt = (
        "あなたは優秀な証券会社のAI秘書です。受信したメールに対して、丁寧でビジネスとして完璧な返信メールのドラフトを作成してください。\n"
        "余計な挨拶や説明（「こちらが返信ドラフトです」等）は一切含めず、メール本文（件名や宛先を除く、拝啓や挨拶から始まる本文全体）のみを直接出力してください。"
    )
    user_content = f"送信者: {from_addr}\n件名: {subject}\nメール本文:\n{mail_body}"
    client = OpenAICompatClient()
    try:
        res = client.ask(
            user_content=user_content,
            system_prompt=system_prompt,
            history=[],
            tool_registry=None,
            json_schema=None,
            tool_mode="off"
        )
        return res.content.strip()
    except Exception as e:
        logger.error("Failed to generate reply draft: %s", e)
        return ""


def analyze_email_and_create_notification(uid: str, mail_id: str, from_addr: str, subject: str, body: str):
    logger.info(f"Analyzing email from {from_addr} with subject: {subject} for user {uid}")
    
    # 1. Try calendar adjustment subagent first
    adjusted, adj_data = adjust_calendar_schedule(uid, body, from_addr, subject)
    if adjusted and adj_data:
        meta = adj_data["meta"]
        desc = adj_data["desc"]
        title = adj_data["title"]
        
        # Create notification with rollback calendar option
        actions = [
            {
                "label": "元に戻す",
                "type": "rollback_calendar",
                "metadata": meta
            }
        ]
        create_notification(uid, "decision", title, desc, actions, mail_id)
        logger.info(f"Successfully adjusted schedule and created rollback notification for user {uid}")
        return

    # 2. Fallback to normal email summary analysis
    system_prompt = (
        "あなたは受信したメールを解析し、重要なお知らせやToDoを自動分類する優秀なアシスタントです。\n"
        "メール本文を読み、要約し、それが単なる「通知(notification)」か、何か行動を起こすべき「判断(decision)」かを判定し、指定されたJSONスキーマに従って出力してください。\n\n"
        "もし「判断(decision)」の場合、具体的なアクションの候補をactions配列に含めてください。\n"
        "アクションのタイプと構成：\n"
        "- 'reply_draft': メールの返信が必要な場合。metadataに \"to\" (宛先), \"subject\" (件名, 元の件名にRe:等を付与したもの), \"original_body\" (元の本文) を含めてください。\n"
        "- 'calendar_add': 打ち合わせの提案や締め切りなどの日程情報が含まれている場合。metadataに \"summary\" (カレンダー予定名), \"start\" (開始日時, RFC3339形式 例: 2026-08-06T15:00:00+09:00), \"end\" (終了日時, RFC3339形式) を含めてください。現在時刻を考慮して日時を推測してください。\n"
        "- 'snooze': 「後で通知する」ための汎用アクション。ラベルは「後で通知する」にしてください。\n\n"
        "出力は必ず指定されたJSONスキーマに完全に従った有効なJSONオブジェクトのみにしてください。"
    )

    user_content = f"送信者: {from_addr}\n件名: {subject}\n本文:\n{body}"

    client = OpenAICompatClient()
    try:
        res = client.ask(
            user_content=user_content,
            system_prompt=system_prompt,
            history=[],
            tool_registry=None,
            json_schema=EMAIL_ANALYSIS_SCHEMA,
            tool_mode="off"
        )
        raw_res = res.content.strip()
    except Exception as e:
        logger.error(f"Gemma email analysis failed for user {uid}, mail {mail_id}: {e}")
        return

    import re
    cleaned_json = re.sub(r"^```json\s*", "", raw_res, flags=re.IGNORECASE)
    cleaned_json = re.sub(r"^```\s*", "", cleaned_json)
    cleaned_json = re.sub(r"\s*```$", "", cleaned_json).strip()

    try:
        parsed = json.loads(cleaned_json)
        category = parsed.get("category", "notification")
        title = parsed.get("title", f"メール受信: {subject}")
        content = parsed.get("content", body[:200])
        actions = parsed.get("actions", [])
        
        # Generate reply draft if reply_draft action is requested
        # Check if the sender has a digital business card. If not, auto-create one.
        sender_person = find_person_by_email(uid, from_addr)
        if not sender_person:
            logger.info(f"Sender {from_addr} not found in digital business cards. Auto-creating business card...")
            try:
                card_data = extract_digital_card_info(body, from_addr, subject)
                
                # Extract clean email address
                import re
                email_match = re.search(r'[\w\.-]+@[\w\.-]+', from_addr)
                clean_email = email_match.group(0).lower() if email_match else from_addr.strip()
                card_data["email"] = clean_email
                card_data["notes"] = f"{card_data.get('notes', '')}\n[システム自動登録] メール「{subject}」受信により自動作成されました。"
                
                # Insert into DB
                sender_person = create_full_person(uid, card_data)
                logger.info(f"Successfully auto-created digital business card for {card_data.get('name')} ({clean_email})")
            except Exception as e:
                logger.error("Failed to auto-create digital business card: %s", e)
        
        for act in actions:
            if act.get("type") == "reply_draft":
                meta = act.get("metadata", {})
                draft = generate_reply_draft(uid, body, from_addr, subject)
                meta["draft_text"] = draft
                if sender_person:
                    meta["person_id"] = sender_person["id"]
                    meta["person_name"] = sender_person["name"]
                act["metadata"] = meta
        
        # Save to DB
        create_notification(uid, category, title, content, actions, mail_id)
        logger.info(f"Successfully created notification for email: {title} for user {uid}")
    except Exception as e:
        logger.error(f"Failed to parse or save notification JSON: {e}, raw: {raw_res}")




def check_emails_for_all_users():
    logger.info("Starting email check batch for all linked users...")
    try:
        uids = get_all_linked_users()
    except Exception as e:
        logger.error(f"Failed to fetch linked users: {e}")
        return

    for uid in uids:
        try:
            svc = _service(uid, "gmail", "v1")
            if svc is None:
                continue

            listing = (
                svc.users()
                .messages()
                .list(
                    userId="me",
                    q="newer_than:1h",
                    maxResults=10,
                )
                .execute()
            )
            msgs = listing.get("messages", [])
            if not msgs:
                continue

            for m in msgs:
                mail_id = m["id"]
                if notification_exists_for_mail(uid, mail_id):
                    continue

                full = (
                    svc.users()
                    .messages()
                    .get(userId="me", id=mail_id, format="full")
                    .execute()
                )
                payload = full.get("payload", {})
                headers = {h["name"]: h["value"] for h in payload.get("headers", [])}
                from_addr = headers.get("From", "?")
                subject = headers.get("Subject", "(件名なし)")
                body_text = _extract_plain_body(payload) or full.get("snippet", "")

                analyze_email_and_create_notification(uid, mail_id, from_addr, subject, body_text)

        except Exception as e:
            logger.error(f"Error checking emails for user {uid}: {e}")


def run_email_check_batch_loop():
    import time
    logger.info("Email check batch thread started.")
    time.sleep(15)
    while True:
        try:
            check_emails_for_all_users()
        except Exception as e:
            logger.error(f"Error in run_email_check_batch_loop: {e}")
        time.sleep(3600)


@app.on_event("startup")
def start_notification_batch_scheduler():
    thread = threading.Thread(target=run_email_check_batch_loop, daemon=True)
    thread.start()


@app.get("/api/health")
def health():
    return {"status": "ok", "model": MODEL_NAME}


if __name__ == "__main__":
    import uvicorn
    # Read port from environment variable for deployment compatibility
    port = int(os.getenv("PORT", 8080))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)

