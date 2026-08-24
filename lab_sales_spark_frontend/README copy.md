# Gemma 4 CLI (bytecompute.ai)

`gemma-4-31B-it` を OpenAI 互換 API (bytecompute.ai) 経由で利用する CLI 会話ツール。
[FoundationAgent](https://github.com/Ayato964/FoundationAgent) の `Agent` / `BaseLLMClient` / `ToolRegistry` 構造を踏襲し、Gemma 4 の特性に合わせて以下を追加・改良しています。

- **SSE ストリーミング** 既定で有効
- **ツール呼び出し** はネイティブ (`tools` 引数) とプロンプト誘導 JSON の双方をサポート (`--tool-mode` で切替)
- **JSON 構造化出力** はサーバ側 `response_format` を試し、失敗時はプロンプト誘導 + 自前検証へフォールバック
- ツールループに **最大反復ガード** (`MAX_TOOL_ITERATIONS=8`)
- 会話の **save / load**、スラッシュコマンドによる対話的操作

---

## セットアップ

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# .env を編集して BYTECOMPUTE_API_KEY を設定
```

`.env` の主要変数:

| 変数 | 既定値 | 説明 |
|---|---|---|
| `BYTECOMPUTE_API_KEY` | (必須) | bytecompute の API キー |
| `BYTECOMPUTE_BASE_URL` | `https://jp-01.bytecompute.ai/v1` | エンドポイント (リージョン変更時のみ) |
| `MODEL_NAME` | `gemma-4-31B-it` | 利用モデル |

---

## 使い方

### インタラクティブ REPL

```powershell
python chat.py
```

### ワンショット

```powershell
python chat.py -p "こんにちは。今日の日付は?"
```

### JSON 出力モード

既定スキーマ (`{thinking, answer}`):

```powershell
python chat.py --json -p "FizzBuzz を 5 まで生成して"
```

任意の JSON Schema を指定:

```powershell
python chat.py --json-schema my_schema.json -p "..."
```

### ツール呼び出しモード

```powershell
# 既定 (auto): プロンプト誘導 JSON ツールコール (Gemma 4 の安全側)
python chat.py

# ネイティブ tools API を試す (サーバ側対応が必要)
python chat.py --tool-mode native

# ツール無効
python chat.py --no-tools
```

---

## スラッシュコマンド

| コマンド | 動作 |
|---|---|
| `/help` | ヘルプ表示 |
| `/exit` / `/quit` | 終了 |
| `/reset` | 会話履歴をクリア |
| `/history` | 履歴を JSON 表示 |
| `/tools` | 登録ツール一覧 |
| `/toolmode <mode>` | `auto` / `native` / `prompted` / `off` |
| `/json on [path]` | JSON 出力 ON (Schema ファイル指定可) |
| `/json off` | JSON 出力 OFF |
| `/sys <prompt>` / `/sys show` | システムプロンプト設定/表示 |
| `/stream on\|off` | ストリーミング切替 |
| `/save <name>` / `/load <name>` | `sessions/<name>.json` で会話を保存/復元 |
| `/model` | モデル名表示 |

複数行入力は行末の `\` で継続。

---

## 設計メモ

### Gemma 4 31B の特性 (調査結果より)

- 256K コンテキスト, 262K 語彙, ネイティブ `system` ロール対応 (Gemma 2/3 からの変更点)
- 推奨サンプリング: `temperature=1.0`, `top_p=0.95`, `top_k=64`
- 日本語は標準対応 (35+ 言語ティア)
- 知識カットオフ: 2025-01
- ネイティブ tool calling は **トークンベースの独自スキーマ** (OpenAI 形式ではない)。
  bytecompute の OpenAI 互換層が変換してくれるかは未検証 → 既定で `prompted` を採用。

### ツール呼び出しの 2 モード

- **native**: `tools` 引数で OpenAI 互換 `tool_calls` を期待。サーバ側が対応していれば
  `id` / `tool_call_id` で結果を返す標準ラウンドトリップ。`BadRequestError` で
  サイレントに `prompted` 相当へ降格しないので、対応サーバ向け。
- **prompted**: `<<<TOOL_CALL>>>{"tool":"name","arguments":{...}}<<<END_TOOL_CALL>>>`
  を sentinel として正規表現で抽出。検出されたら `ToolRegistry.execute` し、結果を
  `user` ターンとして再投入。
- **auto**: 現状は `prompted` に解決。サーバ側で native が確認できれば
  `core/llm_client.py:_resolve_tool_mode` で `"native"` に変更可。

### JSON 出力とエラーフォールバック機構

さまざまな OpenAI 互換 API や vLLM サーバのパラメータ解釈の差異に自動で対応するため、以下の多段階フォールバック設計を実装しています。

- **JSON 構造化出力のフォールバック**:
  1. OpenAI 標準の `response_format` (`type: "json_schema"`) を有効にしてリクエストを試行。
  2. `BadRequestError` を検知した場合、自動的に vLLM/Outlines 向けパラメータである `guided_json` にスキーマを指定してリトライ。
  3. それでも失敗した場合は、スキーマ指定パラメータを除外し、プロンプト指示＋後処理による抽出へ自動的に切り替えます。
- **System ロールの自動マージ**:
  - 使用するチャットテンプレートによって `system` メッセージでエラーが発生した場合、自動的に最初の `system` メッセージを最初の `user` メッセージの先頭へマージしてリトライします。
- **機能除外フォールバック**:
  - 上記がすべて失敗した場合、最終安全策として `tools` や JSON 指定パラメータを除外して最小構成でリクエストを行います。

### マルチモーダル対応

FastAPI サーバのエンドポイント (`POST /api/chat`) は、テキストだけでなく画像やファイルなどを合わせたマルチモーダル入力に対応しています。

- `message` や会話履歴の `content` に `Union[str, List[Any]]` を許容します。
- クライアント側から OpenAI 互換の画像 URL または base64 形式オブジェクト（`{"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}`）を配列で送信することで、Gemma 4 の視覚・文書解析機能を直接利用できます。

### 拡張

新しいツールは `core/tool_calls.py` に `@tool` で追加し、`default_registry()` に登録するだけ。

```python
from core.tool import tool

@tool(
    name="say_hello",
    description="挨拶を返す",
    parameters={
        "type": "object",
        "properties": {"name": {"type": "string"}},
        "required": ["name"],
        "additionalProperties": False,
    },
)
def say_hello(name: str) -> str:
    return f"Hello, {name}!"
```

`parameters` を省略すると関数シグネチャから自動推論されます。

---

## ファイル構成

```
sales_spark/main/
├── chat.py                # CLI エントリ
├── requirements.txt
├── .env.example
├── config/
│   └── const.py           # base URL / モデル名 / 既定値
└── core/
    ├── agent.py           # 会話状態 + メモリ + save/load
    ├── llm_client.py      # OpenAI 互換クライアント + ツールループ
    ├── prompts.py         # プロンプト誘導テンプレート
    ├── tool.py            # @tool / ToolRegistry
    └── tool_calls.py      # 同梱ツール (時刻/ファイル/HTTP/JSON)
```
