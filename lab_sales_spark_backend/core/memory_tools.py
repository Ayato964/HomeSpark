"""Per-user memory & skills retrieval tools for Sales Spark.

Allows Gemma to query past conversation minutes and skills (long-term memory archive)
when users ask questions like "そういえば1年前のさ～" or "昔話した内容覚えてる？".
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from .store import search_user_skills
from .tool import Tool


def _search_memories(uid: str, query: str = "") -> str:
    """Search user's past memories/skills."""
    try:
        results = search_user_skills(uid, query=query, limit=5)
        if not results:
            return "【過去の記憶・スキル検索結果】\n該当する過去の会話議事録や記憶は見つかりませんでした。"

        lines = [f"【過去の記憶・スキル検索結果 ({len(results)}件)】"]
        for idx, item in enumerate(results, 1):
            created = item.get("created_at") or ""
            date_str = created[:10] if len(created) >= 10 else "日時不明"
            title = item.get("title", "過去の記憶")
            content = item.get("content", "").strip()
            lines.append(f"\n--- 記憶 {idx} [{date_str}] {title} ---")
            lines.append(content)

        return "\n".join(lines)
    except Exception as e:
        return f"[error] 過去記憶の検索に失敗しました: {e}"


def build_memory_tools(uid: str) -> List[Tool]:
    """Return past memory/skills search tools bound to user's uid."""
    return [
        Tool(
            name="search_past_memories",
            description="ユーザーとの過去の会話議事録・長期記憶（スキル）から関連する情報を検索・取得します。「1年前に話した〇〇」「昔話した打ち合わせ内容」「以前話した旅行や趣味の話」など、過去のコンテキストを参照したい際に呼び出してください。",
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "検索キーワード（例: '旅行', '打ち合わせ', '1年前', 'LPデザイン' など）。空欄の場合は直近の過去記憶一覧を返します。",
                    },
                },
                "required": [],
                "additionalProperties": False,
            },
            func=lambda query="": _search_memories(uid, query),
        )
    ]
