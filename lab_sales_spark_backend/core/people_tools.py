"""Per-user Digital Business Cards / People profiling tools for AI Agent.

`build_people_tools(uid)` returns a list of `Tool`s whose functions are closed
over the caller's uid. Each tool performs DB queries against spark_people and returns
formatted results for the LLM to reason over or update.
"""
from __future__ import annotations

import json
from .tool import Tool
from .store import (
    get_all_people,
    create_full_person,
    delete_person,
)


def _list_cards(uid: str):
    people = get_all_people(uid)
    if not people:
        return "登録されているデジタル名刺・人物プロファイルはありません。"
    
    lines = []
    for p in people:
        info = f"- [{p['name']}]"
        if p.get('company') or p.get('role'):
            info += f" {p.get('company', '')} {p.get('role', '')}"
        if p.get('email'):
            info += f" / Email: {p['email']}"
        if p.get('phone'):
            info += f" / Phone: {p['phone']}"
        if p.get('postal_code') or p.get('address'):
            info += f" / 住所: 〒{p.get('postal_code', '')} {p.get('address', '')}"
        if p.get('hobbies'):
            info += f" / 趣味: {p['hobbies']}"
        if p.get('notes'):
            info += f" / メモ: {p['notes']}"
        info += f" (ID: {p['id']})"
        lines.append(info)
    
    return f"【デジタル名刺・人物プロファイル一覧 ({len(people)}件)】\n" + "\n".join(lines)


def _search_cards(uid: str, query: str):
    people = get_all_people(uid)
    if not people:
        return "登録されているデジタル名刺・人物プロファイルはありません。"

    q = query.lower().strip()
    matched = []
    for p in people:
        text = f"{p.get('name', '')} {p.get('company', '')} {p.get('role', '')} {p.get('email', '')} {p.get('phone', '')} {p.get('address', '')} {p.get('postal_code', '')} {p.get('hobbies', '')} {p.get('notes', '')}".lower()
        if q in text:
            matched.append(p)

    if not matched:
        return f"検索キーワード「{query}」に一致するデジタル名刺は見つかりませんでした。"

    lines = []
    for p in matched:
        info = f"- [{p['name']}]"
        if p.get('company') or p.get('role'):
            info += f" {p.get('company', '')} {p.get('role', '')}"
        if p.get('email'):
            info += f" / Email: {p['email']}"
        if p.get('phone'):
            info += f" / Phone: {p['phone']}"
        if p.get('postal_code') or p.get('address'):
            info += f" / 住所: 〒{p.get('postal_code', '')} {p.get('address', '')}"
        if p.get('hobbies'):
            info += f" / 趣味: {p['hobbies']}"
        if p.get('notes'):
            info += f" / メモ: {p['notes']}"
        info += f" (ID: {p['id']})"
        lines.append(info)

    return f"【名刺検索結果 ({len(matched)}件)】\n" + "\n".join(lines)


def _create_or_update_card(
    uid: str,
    name: str,
    company: str = None,
    role: str = None,
    email: str = None,
    phone: str = None,
    address: str = None,
    postal_code: str = None,
    hobbies: str = None,
    notes: str = None,
):
    data = {
        "name": name,
        "company": company,
        "role": role,
        "email": email,
        "phone": phone,
        "address": address,
        "postal_code": postal_code,
        "hobbies": hobbies,
        "notes": notes,
    }
    try:
        person = create_full_person(uid, data)
        return (
            f"デジタル名刺プロファイルを保存・更新しました。\n"
            f"名前: {person['name']}\n"
            f"会社名: {person.get('company', '')}\n"
            f"役職: {person.get('role', '')}\n"
            f"メール: {person.get('email', '')}\n"
            f"電話: {person.get('phone', '')}\n"
            f"住所: 〒{person.get('postal_code', '')} {person.get('address', '')}\n"
            f"趣味: {person.get('hobbies', '')}\n"
            f"営業メモ: {person.get('notes', '')}\n"
            f"(ID: {person['id']})"
        )
    except Exception as e:
        return f"[error] 名刺プロファイルの保存に失敗しました: {e}"


def _delete_card(uid: str, person_id: str):
    try:
        delete_person(uid, person_id)
        return f"デジタル名刺 (ID: {person_id}) を正常に削除しました。"
    except Exception as e:
        return f"[error] 名刺プロファイルの削除に失敗しました: {e}"


def build_people_tools(uid: str) -> list[Tool]:
    """Build bound Tools for Digital Business Cards for user `uid`."""

    def bind(fn):
        def wrapper(*args, **kwargs):
            return fn(uid, *args, **kwargs)

        return wrapper

    return [
        Tool(
            name="get_digital_business_cards",
            description="ユーザーが登録したデジタル名刺・人物プロファイルの一覧を取得します。",
            parameters={
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
            func=bind(_list_cards),
        ),
        Tool(
            name="search_digital_business_cards",
            description="名前、会社名、役職、住所、郵便番号、趣味、営業メモなどからデジタル名刺・人物プロファイルを検索します。",
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "検索キーワード (名前、会社名、キーワードなど)",
                    },
                },
                "required": ["query"],
                "additionalProperties": False,
            },
            func=bind(_search_cards),
        ),
        Tool(
            name="create_digital_business_card",
            description="新しいデジタル名刺・人物プロファイルを登録、または既存のプロファイルを更新・保存します。",
            parameters={
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "人物の名前 (必須)"},
                    "company": {"type": "string", "description": "会社名"},
                    "role": {"type": "string", "description": "役職 / 部署"},
                    "email": {"type": "string", "description": "メールアドレス"},
                    "phone": {"type": "string", "description": "電話番号"},
                    "postal_code": {"type": "string", "description": "郵便番号 (例: 100-0005)"},
                    "address": {"type": "string", "description": "会社住所 / 所在地"},
                    "hobbies": {"type": "string", "description": "趣味 / 特筆事項"},
                    "notes": {"type": "string", "description": "営業メモ / 特徴 / 商談のポイント"},
                },
                "required": ["name"],
                "additionalProperties": False,
            },
            func=bind(_create_or_update_card),
        ),
        Tool(
            name="delete_digital_business_card",
            description="指定した person_id のデジタル名刺プロファイルを削除します。",
            parameters={
                "type": "object",
                "properties": {
                    "person_id": {"type": "string", "description": "削除する名刺プロファイルのID"},
                },
                "required": ["person_id"],
                "additionalProperties": False,
            },
            func=bind(_delete_card),
        ),
    ]
