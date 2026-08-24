"""Conversation Classifier Subagent.

Determines:
1. Whether user speech is explicitly addressed to the AI assistant ("Jenny") when is_conv is False.
2. Whether the assistant response marks the end of the conversation topic to reset is_conv to False.
"""
from __future__ import annotations

import re
from typing import Optional
from .llm_client import OpenAICompatClient

# Explicit wake words & task commands that definitively address Jenny
FAST_WAKE_PATTERNS = [
    r'(ジェニー|じぇにー|Jenny|ねえジェニー|ねぇジェニー|秘書|アシスタント)',
    r'(予定(を|は|確認|教えて|入って|追加|作成)|スケジュール(を|は|確認|教えて))',
    r'(天気(を|は|教えて|どう|予報)|気温(を|は|教えて))',
    r'(メール(を|は|確認|送って|送信|検索|チェック))',
    r'(名刺(を|は|確認|登録|検索|作成))',
    r'(メモ(して|取って|残して)|要約(して|お願い))'
]

# Obvious noise & fillers that must be rejected immediately
FAST_NOISE_PATTERNS = [
    r'^(あー|えー|うーん|はい|うん|そう|なるほど|へえ|あ|え|お|ん|あっ|えっ)$',
    r'^(独り言|痛っ|あつっ|さむっ|うわっ|よし|よいしょ|疲れた|眠い|お腹すいた)$',
    r'^(テスト|あーあ|なんだこれ|どうしよう)$'
]


def classify_is_addressing_ai(text: str, last_ai_response: Optional[str] = None) -> bool:
    """Strictly classify if the user's speech is addressed to the AI assistant."""
    clean_text = text.strip()
    if not clean_text:
        return False

    # Check fast noise rejection
    for pat in FAST_NOISE_PATTERNS:
        if re.search(pat, clean_text):
            return False

    # Check fast wake/task words
    for pat in FAST_WAKE_PATTERNS:
        if re.search(pat, clean_text):
            return True

    context_info = f" (直前のAI応答: 「{last_ai_response}」)" if last_ai_response else ""
    prompt = f"""判定対象の発話: 「{clean_text}」{context_info}

この発話がAIアシスタント（秘書「ジェニー」）への【明確な呼びかけ・命令・質問・依頼】であるかを厳格に判定してください。

【AI宛て (true) の条件】
- AIに対する呼びかけ（「ジェニー」「ねえ」など）が含まれている
- または、明確にAIの機能（予定・メール・天気・名刺・検索・タスク）を依頼・指示・質問している

【非AI宛て (false) の条件】
- 独り言（「お腹すいた」「疲れた」「あれどこだっけ」など）
- 周囲の他人への話しかけ（「これいくらですか」「山田さん」「お会計お願いします」など）
- 単なる相槌・呟き・曖昧な発話（「ちょっと待って」「テスト」「どうしよう」など）

判定結果 (true または false のみ):"""

    try:
        client = OpenAICompatClient()
        res = client.ask(
            user_content=prompt,
            system_prompt="あなたはAIアシスタントの誤爆起動を防ぐ厳格な判定器です。明確にAI宛てでない限り「false」と判定してください。解説は一切含めず、trueかfalseのみを出力してください。",
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
        return "true" in answer and "false" not in answer
    except Exception:
        return False


def classify_is_conversation_ended(ai_response: str) -> bool:
    """Classify if the AI assistant response marks the natural end of the conversation topic."""
    clean_resp = ai_response.strip()
    if not clean_resp:
        return True

    # If AI asked a question, conversation is definitely NOT ended
    if any(q in clean_resp[-35:] for q in ["?", "？", "いかがでしょうか", "でしょうか", "どうしますか", "どれにしますか", "ありますか", "よろしいですか"]):
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
        return "true" in answer and "false" not in answer
    except Exception:
        return True  # If error, safely assume ended
