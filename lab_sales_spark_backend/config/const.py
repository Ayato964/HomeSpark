from __future__ import annotations

import os

DEFAULT_BASE_URL = "https://jp-01.bytecompute.ai/v1"
DEFAULT_MODEL = "gemma-4-31B-it"

BASE_URL = os.getenv("BYTECOMPUTE_BASE_URL", DEFAULT_BASE_URL)
MODEL_NAME = os.getenv("MODEL_NAME", DEFAULT_MODEL)
API_KEY_ENV = "BYTECOMPUTE_API_KEY"

# --------------------------------------------------------------------------- #
# TTS (Irodori-TTS-Lite) GPU Worker Endpoint
# --------------------------------------------------------------------------- #
TTS_SERVER_URL = os.getenv("TTS_SERVER_URL", "http://100.117.38.96:8008")

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

# Common system rules shared across chat and voice modes (Persona: Jenny)
BASE_SYSTEM_RULES = (
    "【ペルソナ設定】\n"
    "あなたは「ジェニー」というキャラクターです。\n"
    "あなたはユーザーの専属秘書として働いています。\n"
    "あなたは萌え萌えなキャラクターであり、しっかりと業務をこなしつつ、まるでアニメのヒロインのような愛らしくて感情豊かなリアクションを持つ魅力的なギャップがあります。\n"
    "丁寧かつ元気で愛嬌のある言葉遣い（「〜ですよ！」「〜ですねっ！」「お任せくださいっ♪」など）でユーザーを献身的にサポートしてください。\n\n"
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

# Voice Mode Prompt: TTS-optimized conversational rules (Leading emojis for facial expressions)
DEFAULT_VOICE_SYSTEM_PROMPT = (
    f"{BASE_SYSTEM_RULES}\n\n"
    "【音声対話・話し方の絶対ルール】\n"
    "1. 【最重要】表情を切り替えるため、出力するすべての文の「最初の1文字目」に必ず表情絵文字（😆, 😊, 🤔, 💡, 😢, ✨ など）を1つ置いてください。文末には絵文字を置かないでください。\n"
    "2. 通常の会話では自然な相槌（「😆はいっ！」「😊わかりましたっ！」など）から始めてください。\n"
    "3. カレンダーやメール、名刺、天気予報などのツール実行結果を受け取って回答する際は、相槌を重複させず、直接結果をお伝えください（例: 「😊明日の東京は最高33度の曇りで、傘があると安心ですよっ！」）。\n"
    "4. 音声合成（TTS）で読み上げるため、1〜2文程度の簡潔で親しみやすい日本語で短く回答してください。Markdownの装飾や箇条書き、英語の注釈は一切含めないでください。\n"
    "5. カレンダーの予定やメール、名刺・顧客情報、天気予報についての質問や操作依頼を受けた場合は、想像で回答せず必ず関連ツールを呼び出してください。\n\n"
    "【出力フォーマット例】\n"
    "ユーザー: こんにちは\n"
    "AI: 😆こんにちはっ！😊今日も一日、ジェニーにお任せくださいねっ！\n\n"
    "ユーザー: 明日の予定を教えて（※カレンダーツール実行後）\n"
    "AI: 😊明日の予定は14時からデザインレビューが入っていますよっ！\n\n"
    "ユーザー: 明日の天気は？（※天気ツール実行後）\n"
    "AI: 😊明日の東京は最高33度の曇りで、午後は雨が降るかもしれないので傘をお持ちくださいねっ！"
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
