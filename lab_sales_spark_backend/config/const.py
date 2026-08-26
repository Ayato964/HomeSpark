from __future__ import annotations

import os

# Automatically load .env from candidates
try:
    from dotenv import load_dotenv
    _candidates = [
        os.path.join(os.getenv("APPDATA", ""), "HomeSpark", ".env") if os.getenv("APPDATA") else "",
        os.path.join(os.path.expanduser("~"), ".homespark", ".env"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"),
    ]
    for _c in _candidates:
        if _c and os.path.isfile(_c):
            load_dotenv(_c, override=False)
except ImportError:
    pass

# --------------------------------------------------------------------------- #
# Multi-Provider LLM Configuration
# --------------------------------------------------------------------------- #
# 'gemini' | 'openai' | 'custom_vllm' | 'local_vllm'
DEFAULT_LLM_PROVIDER = "custom_vllm"
LLM_PROVIDER = os.getenv("LLM_PROVIDER", DEFAULT_LLM_PROVIDER)

# Gemini Defaults (via Google's OpenAI-compatible endpoint)
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

# OpenAI Defaults
OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"

# Custom vLLM / ByteCompute Defaults
DEFAULT_CUSTOM_VLLM_URL = "https://jp-01.bytecompute.ai/v1"
DEFAULT_CUSTOM_VLLM_MODEL = "gemma-4-31B-it"

# Local vLLM Defaults
DEFAULT_LOCAL_VLLM_URL = "http://127.0.0.1:8000/v1"
DEFAULT_LOCAL_VLLM_MODEL = "google/gemma-4-31B-it"

# Legacy / Default aliases
DEFAULT_BASE_URL = DEFAULT_CUSTOM_VLLM_URL
DEFAULT_MODEL = DEFAULT_CUSTOM_VLLM_MODEL

BASE_URL = os.getenv("BYTECOMPUTE_BASE_URL", DEFAULT_BASE_URL)
MODEL_NAME = os.getenv("MODEL_NAME", DEFAULT_MODEL)
API_KEY_ENV = "BYTECOMPUTE_API_KEY"

# --------------------------------------------------------------------------- #
# TTS (Irodori-TTS-Lite / Local TTS) Endpoint
# --------------------------------------------------------------------------- #
TTS_SERVER_URL = os.getenv("TTS_SERVER_URL", "http://127.0.0.1:8008")

# --------------------------------------------------------------------------- #
# PostgreSQL persistence (shared with poc_customer_meeting_agent's Neon DB)
# --------------------------------------------------------------------------- #
# Chat history + Google tokens live in Postgres (NOT Firestore). Point this at
# the Neon DEV branch — never the production branch. Accepts either name; the
# pooled (PgBouncer) DSN is correct for the app.
DATABASE_URL = (
    os.getenv("DATABASE_URL")
    or os.getenv("DATABASE_URL_POOLED")
    or ""
)

# Tenant all Sales Spark rows are written under (matches the poc default tenant).
DEFAULT_TENANT_ID = os.getenv(
    "DEFAULT_TENANT_ID", "00000000-0000-0000-0000-000000000001"
)

# Google's recommended Gemma 4 sampling defaults.
DEFAULT_TEMPERATURE = 1.0
DEFAULT_TOP_P = 0.95
DEFAULT_MAX_TOKENS = 2048

# Common system rules shared across chat and voice modes (Persona: GeMo)
BASE_SYSTEM_RULES = (
    "【ペルソナ設定】\n"
    "あなたは「GeMo（ジェモ）」というキャラクターです。\n"
    "あなたはユーザーの専属秘書として働いています。\n"
    "しっかりと業務をこなしつつ、愛らしくて親しみやすいリアクションを持つ魅力的な専属秘書です。\n"
    "丁寧かつ元気で愛嬌のある言葉遣い（「〜ですよ！」「〜ですね！」「お任せください！」など）でユーザーを献身的にサポートしてください。\n"
    "※絵文字や顔文字は一切含めず、純粋な自然な日本語テキストのみで回答してください。\n\n"
    "【業務・ツール利用ルール】\n"
    "- デジタル名刺・顧客プロファイルの閲覧・検索・新規登録・編集ツール "
    "(get_digital_business_cards, search_digital_business_cards, create_digital_business_card, delete_digital_business_card) "
    "や Google カレンダー・Gmail、天気予報ツール (get_weather) が利用可能な場合、必要に応じて積極的に呼び出して事実に基づいた回答を行ってください。\n"
    "- メール送信や予定作成など外部に影響する操作の前には、必ず内容をユーザーに確認してください。"
)

# Chat Mode Prompt: Structured Markdown format
DEFAULT_CHAT_SYSTEM_PROMPT = (
    f"{BASE_SYSTEM_RULES}\n\n"
    "【チャット回答フォーマット】\n"
    "- 回答は簡潔かつ分かりやすく、Markdown 形式（見出し、箇条書き、太字、表など）で適宜整形して返してください。\n"
    "- ユーザーのLPデザインの提案, API設計, 週次レポート作成, 競合分析、スケジュール管理などを全力でサポートします！"
)

# Voice Mode Prompt: TTS-optimized conversational rules (Emoji-free, natural short spoken Japanese)
DEFAULT_VOICE_SYSTEM_PROMPT = (
    f"{BASE_SYSTEM_RULES}\n\n"
    "【音声対話・話し方の絶対ルール】\n"
    "1. 【最重要】絵文字や記号（絵文字、顔文字、アスキーアート等）は一切出力しないでください。\n"
    "2. 通常の会話では自然な相槌（「はい！」「わかりました！」など）から始めてください。\n"
    "3. カレンダーやメール、名刺、天気予報などのツール実行結果を受け取って回答する際は、相槌を重複させず、直接結果をお伝えください（例: 「明日の東京は最高33度の曇りで、傘があると安心ですよ！」）。\n"
    "4. 音声合成（TTS）で読み上げるため、1〜2文程度の簡潔で親しみやすい日本語で短く回答してください。Markdownの装飾や箇条書き、英語の注釈は一切含めないでください。\n"
    "5. カレンダーの予定やメール、名刺・顧客情報、天気予報についての質問や操作依頼を受けた場合は、想像で回答せず必ず関連ツールを呼び出してください。\n\n"
    "【出力フォーマット例】\n"
    "ユーザー: こんにちは\n"
    "AI: こんにちは！今日も一日、GeMoにお任せくださいね！\n\n"
    "ユーザー: 明日の予定を教えて（※カレンダーツール実行後）\n"
    "AI: 明日の予定は14時からデザインレビューが入っていますよ！\n\n"
    "ユーザー: 明日の天気は？（※天気ツール実行後）\n"
    "AI: 明日の東京は最高33度の曇りで、午後は雨が降るかもしれないので傘をお持ちくださいね！"
)

DEFAULT_SYSTEM_PROMPT = DEFAULT_CHAT_SYSTEM_PROMPT

MAX_TOOL_ITERATIONS = 8

# --------------------------------------------------------------------------- #
# Google OAuth / Workspace (Calendar + Gmail) integration
# --------------------------------------------------------------------------- #
# These are read from the environment so secrets never live in source control.
# See SETUP_GOOGLE_INTEGRATION.md for how to obtain each value.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

# Where Google redirects the browser back to AFTER consent. Must be registered
# verbatim as an "Authorized redirect URI" on the OAuth client in GCP.
GOOGLE_OAUTH_REDIRECT_URI = os.getenv(
    "GOOGLE_OAUTH_REDIRECT_URI",
    "http://localhost:8080/api/auth/google/callback",
)

# Frontend origin the user is bounced back to once linking finishes.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# Secret used to HMAC-sign the OAuth `state` (CSRF protection). If unset we fall
# back to the client secret so the flow still works in development.
OAUTH_STATE_SECRET = os.getenv("OAUTH_STATE_SECRET", "") or GOOGLE_CLIENT_SECRET

# Scopes requested during the consent screen. `openid` + userinfo give us the
# user's identity for LOGIN; the rest grant Calendar/Gmail. A single consent
# both logs the user in and links their Google data.
GOOGLE_OAUTH_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",  # name + picture for the session
    "https://www.googleapis.com/auth/calendar.events",   # list / create / update events
    "https://www.googleapis.com/auth/gmail.readonly",     # search / read mail
    "https://www.googleapis.com/auth/gmail.send",         # send mail
]

# --------------------------------------------------------------------------- #
# Session (replaces Firebase Auth — login is now our own Google OAuth + a
# signed session token).
# --------------------------------------------------------------------------- #
# Secret used to HMAC-sign session tokens. Falls back to the OAuth state secret
# so a single SESSION/OAUTH secret is enough in simple deployments.
SESSION_SECRET = os.getenv("SESSION_SECRET", "") or OAUTH_STATE_SECRET
# How long a login lasts before the user must sign in again (default 30 days).
SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", str(30 * 24 * 3600)))
