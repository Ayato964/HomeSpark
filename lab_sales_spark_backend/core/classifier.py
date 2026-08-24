"""Conversation Classifier Subagent.

Determines:
1. Whether user speech is addressed to the AI assistant ("Jenny") when is_conv is False.
2. Whether the assistant response marks the end of the conversation topic to reset is_conv to False.
"""
from __future__ import annotations

import re
from typing import Optional
from .llm_client import OpenAICompatClient

# Fast-path patterns that definitively address the AI
FAST_WAKE_PATTERNS = [
    r'(ジェニー|じぇにー|Jenny|ねえジェニー|ねぇジェニー)',
    r'^(こんにちは|おはよう|こんばんは|お疲れ様|おねがい|お願い)'
]

FAST_NOISE_PATTERNS = [
    r'^(あー|えー|うーん|はい|うん|そう|なるほど|へえ|あ|え|お)$',
    r'^(独り言|痛っ|あつっ|さむっ|うわっ|よし|よいしょ)$'
]


def classify_is_addressing_ai(text: str, last_ai_response: Optional[str] = None) -> bool:
    """Classify if the user's speech is addressed to the AI assistant."""
    clean_text = text.strip()
    if not clean_text:
        return False

    # Check fast noise rejection
    for pat in FAST_NOISE_PATTERNS:
        if re.search(pat, clean_text):
            return False

    # Check fast wake words
    for pat in FAST_WAKE_PATTERNS:
        if re.search(pat, clean_text):
            return True

    context_info = f" (直前のAI応答: 「{last_ai_response}」)" if last_ai_response else ""
    prompt = f"""判定対象の発話: 「{clean_text}」{context_info}

この発話がAIアシスタント（ジェニー）への呼びかけ・質問・依頼・指示である場合は「true」、
独り言（「お腹すいた」「疲れた」など）や他人への話しかけ（「これいくらですか」「山田さん」など）や雑音の場合は「false」と答えてください。

判定結果 (true または false のみ):"""

    try:
        client = OpenAICompatClient()
        res = client.ask(
            user_content=prompt,
            system_prompt="あなたは発話がAI宛てかどうかを「true」か「false」の1単語のみで答える厳格な判定AIです。解説は一切含めず、trueかfalseのみを出力してください。",
            history=[],
            tool_registry=None,
            json_schema=None,
            tool_mode="off",
            stream=False,
            on_token=None,
            temperature=0.0,
            max_tokens=10
        )
        answer = res.content.strip().lower()
        return "true" in answer
    except Exception:
        return True


def classify_is_conversation_ended(ai_response: str) -> bool:
    """Classify if the AI assistant response marks the natural end of the conversation topic."""
    clean_resp = ai_response.strip()
    if not clean_resp:
        return True

    # If AI asked a question, conversation is definitely NOT ended
    if any(q in clean_resp[-30:] for q in ["?", "？", "いかがでしょうか", "でしょうか", "どうしますか", "どれにしますか", "ありますか"]):
        return False

    prompt = f"""AIアシスタントの返答: 「{clean_resp}」

このAIの返答が一連の会話や用件の終了（締めくくり、挨拶、完了報告など）である場合は「true」、
ユーザーへの質問や確認など続きの返答を求めている場合は「false」と答えてください。

判定結果 (true または false のみ):"""

    try:
        client = OpenAICompatClient()
        res = client.ask(
            user_content=prompt,
            system_prompt="あなたは会話の終端判定器です。解説は一切含めず、trueかfalseのみを出力してください。",
            history=[],
            tool_registry=None,
            json_schema=None,
            tool_mode="off",
            stream=False,
            on_token=None,
            temperature=0.0,
            max_tokens=10
        )
        answer = res.content.strip().lower()
        return "true" in answer
    except Exception:
        return False
