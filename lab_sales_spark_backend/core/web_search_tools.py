"""Internet Web Search tool for Sales Spark.

Enables Gemma to query the live internet for up-to-date facts, news, companies,
people, technical documentation, and general web knowledge via DuckDuckGo and fallback APIs.
"""
from __future__ import annotations

import json
import logging
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional
from .tool import Tool

logger = logging.getLogger("sales_spark")


def _perform_web_search(query: str, max_results: int = 5) -> str:
    """Search the web for the given query and return formatted results."""
    clean_query = query.strip()
    if not clean_query:
        return "【ウェブ検索結果】\n検索キーワードが指定されていません。"

    results_list = []

    # 1. Primary Search: DuckDuckGo Search via DDGS
    try:
        from duckduckgo_search import DDGS
        ddgs = DDGS()
        ddg_results = list(ddgs.text(clean_query, max_results=max_results, region="jp-jp"))
        for item in ddg_results:
            title = item.get("title") or "タイトルなし"
            body = item.get("body") or ""
            href = item.get("href") or ""
            if title and body:
                results_list.append({
                    "title": title,
                    "snippet": body,
                    "url": href
                })
    except Exception as e:
        logger.warning(f"[web_search] DDGS search failed, trying fallback: {e}")

    # 2. Fallback: DuckDuckGo Instant Answer API / Wikipedia API if results are empty
    if not results_list:
        try:
            encoded = urllib.parse.quote(clean_query)
            wiki_url = f"https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch={encoded}&format=json&utf8=1"
            req = urllib.request.Request(wiki_url, headers={"User-Agent": "SalesSpark-WebSearch/1.0"})
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                search_items = data.get("query", {}).get("search", [])
                for item in search_items[:max_results]:
                    title = item.get("title", "")
                    snippet = item.get("snippet", "").replace('<span class="searchmatch">', '').replace('</span>', '')
                    results_list.append({
                        "title": f"Wikipedia: {title}",
                        "snippet": snippet,
                        "url": f"https://ja.wikipedia.org/wiki/{urllib.parse.quote(title)}"
                    })
        except Exception as e:
            logger.error(f"[web_search] Wikipedia fallback failed: {e}")

    if not results_list:
        return f"【ウェブ検索結果】\n「{clean_query}」に関する検索結果は見つかりませんでした。"

    # Format output for Gemma
    output_lines = [f"【インターネット検索結果: 「{clean_query}」 ({len(results_list)}件)】\n"]
    for idx, r in enumerate(results_list, 1):
        output_lines.append(f"### {idx}. {r['title']}")
        output_lines.append(f"- 要約・スニペット: {r['snippet']}")
        if r.get('url'):
            output_lines.append(f"- URL: {r['url']}")
        output_lines.append("")

    return "\n".join(output_lines)


def build_web_search_tools() -> List[Tool]:
    """Return web search tool for general internet information retrieval."""
    return [
        Tool(
            name="search_web",
            description="インターネットで最新の情報・時事ニュース・トレンド・企業情報・商品・専門用語・人物・場所などを検索・調査します。「〜について調べて」「最新の〜って何？」「〜の情報を検索して」など、リアルタイムな外部知識が必要な際に呼び出してください。",
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "検索キーワードや検索フレーズ（例: 'Gemma 4 最新情報', 'Google Cloud 料金体系', '東京駅 周辺 おすすめ ランチ' など）",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "取得する検索結果の件数（デフォルト: 5、最大: 10）",
                    },
                },
                "required": ["query"],
                "additionalProperties": False,
            },
            func=lambda query, max_results=5: _perform_web_search(query, max_results),
        )
    ]
