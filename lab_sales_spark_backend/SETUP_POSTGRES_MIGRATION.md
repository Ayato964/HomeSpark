# SETUP: Postgres 移行ランブック (Firestore → Neon Postgres)

Sales Spark バックエンドの永続化層を、Firestore から **Neon Postgres の DEV ブランチ**に
切り替えるための手順です。チャット履歴と Google OAuth トークンが Postgres の `spark_*`
テーブルに移りました。**ログインは引き続き Firebase**（identity のみ）で、データだけが移動します。

データは `poc_customer_meeting_agent` と同じ Neon データベースに同居します。新しいテーブルは
`tenants(tenant_id)` を FK 参照するため、適用先 DB に必ず `tenants` 行が存在している必要があります。

参照コード:
- `config/const.py` — `DATABASE_URL`（= pooled DSN）/ `DEFAULT_TENANT_ID`
- `core/store.py` — psycopg3 同期プール。pooled DSN 前提で `prepare_threshold=None`、`spark_*` テーブル、`(tenant_id, user_ref)` スコープ
- `../poc_customer_meeting_agent/db/schema_patch_sales_spark.sql` — 追加するテーブル定義

---

## 0. 前提 (Prerequisites)

- 既存の Neon プロジェクト（`poc_customer_meeting_agent` の本番 / main ブランチ）にアクセスできること
- ローカルに `psql` がインストール済みであること
- Firebase のサービスアカウント JSON と Google OAuth クライアントを既に保有していること

---

## 1. Neon DEV ブランチを作成 (Create a Neon DEV branch)

1. Neon Console → 対象プロジェクト → **Branches** → **Create branch**。
2. 親に `main` / `production` を選び、名前を例えば `dev-sales-spark` にして作成。
3. ブランチは **copy-on-write クローン**なので、作成直後から親の poc スキーマ一式と
   `tenants` 行をそのまま含みます。新テーブルが `tenants(tenant_id)` を FK 参照するため、
   この「`tenants` が既に存在する」点が重要です（空 DB を作った場合との違い。step 2 の注記参照）。
4. ブランチの接続文字列を **POOLED** と **DIRECT** の両方取得します
   （Console の "Connection Details" で Pooled connection のチェックを切り替えると両方見えます）。

```
# POOLED（アプリ用 / PgBouncer 経由）— main/.env の DATABASE_URL に使う
postgresql://neondb_owner:PASSWORD@ep-dev-branch-1234-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

# DIRECT（マイグレーション・psql 管理用）— -pooler が付かないホスト
postgresql://neondb_owner:PASSWORD@ep-dev-branch-1234.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

> Pooled は host に `-pooler` が付き、Direct は付きません。`sslmode=require` は両方に必須です。

---

## 2. 拡張スキーマを適用 (Apply the extension schema)

マイグレーションは必ず **DIRECT（非 pooled）DSN** で実行します（PgBouncer transaction mode は
DDL/トランザクション運用に不向きなため）。

```bash
psql "<DIRECT_DSN>" -f ../poc_customer_meeting_agent/db/schema_patch_sales_spark.sql
```

`main/` から実行する場合のパス例:

```bash
psql "postgresql://neondb_owner:PASSWORD@ep-dev-branch-1234.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require" \
  -f ../poc_customer_meeting_agent/db/schema_patch_sales_spark.sql
```

これで `spark_chat_sessions` / `spark_chat_messages` / `spark_google_tokens` が作成されます
（スクリプトは `IF NOT EXISTS` で冪等。複数回流しても安全）。

> **注記:** ブランチではなく**空の DB を新規作成**した場合は `tenants` が無いため
> 上記 FK 作成が失敗します。その場合は先にベーススキーマとシードを流してください:
> ```bash
> psql "<DIRECT_DSN>" -f ../poc_customer_meeting_agent/db/schema.sql
> psql "<DIRECT_DSN>" -f ../poc_customer_meeting_agent/db/seed.sql
> ```
> DEV ブランチを使っていればこの手順は不要です（既に揃っています）。

---

## 3. 正しい DEFAULT_TENANT_ID を確認 (Find the tenant_id)

```bash
psql "<DIRECT_DSN>" -c "SELECT tenant_id, tenant_code FROM tenants;"
```

```
              tenant_id               | tenant_code
--------------------------------------+----------------
 00000000-0000-0000-0000-000000000001 | akatsuki-demo
```

poc のデフォルトは `tenant_code = 'akatsuki-demo'`。その行の `tenant_id` をコピーして
次の step で `DEFAULT_TENANT_ID` に設定します。Sales Spark の全行はこの tenant 配下に書き込まれます。

---

## 4. main/.env を設定 (Configure main/.env)

`main/.env`（無ければ `.env.example` を複製）に以下を設定:

```bash
# --- PostgreSQL (chat history + Google tokens; shared Neon DB) ---
# POOLED ブランチ DSN を使う（-pooler 付き）。本番ブランチは絶対に指さない。
DATABASE_URL=postgresql://neondb_owner:PASSWORD@ep-dev-branch-1234-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
# step 3 で確認した tenant_id
DEFAULT_TENANT_ID=00000000-0000-0000-0000-000000000001
```

既存の Firebase / Google OAuth 変数はそのまま残します（ログインは Firebase のまま、データだけ移動）:

```bash
FIREBASE_CREDENTIALS=firebase-service-account.json
GOOGLE_CLIENT_ID=your-oauth-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-oauth-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8080/api/auth/google/callback
FRONTEND_URL=http://localhost:3000
OAUTH_STATE_SECRET=your-random-state-secret
```

> `config/const.py` は `DATABASE_URL` が空なら `DATABASE_URL_POOLED` にもフォールバックします。
> アプリ（`core/store.py` のプール）は **pooled** DSN を前提に `prepare_threshold=None` で動きます。

---

## 5. 依存をインストール (Install deps)

```bash
pip install -r requirements.txt
```

`requirements.txt` には `psycopg[binary,pool]` が含まれます（psycopg3 + 同期プール）。

---

## 6. スモークテスト (Smoke test)

```bash
python scripts/test_pg_store.py
```

このスクリプトはチャットを 1 往復書き込み、`seq` による順序とユーザー間の分離
（`user_ref` スコープ）を検証します。**実行前に `DATABASE_URL` が設定されている**こと
（`.env` 読み込み or 環境変数）が前提です。未設定だと `core/store.py` が明示的に
`RuntimeError("DATABASE_URL is not set ...")` を投げます。

---

## 7. バックエンド起動とエンドツーエンド確認 (Start & verify E2E)

```bash
python server.py
```

確認手順:
1. フロントから **Firebase の Google ログイン**でサインイン。
2. チャットを送信して応答を得る。
3. ページを**リロード**して履歴が残っていることを確認（Firestore ではなく Postgres から読まれる）。
4. DB に行が入っているか直接確認:

```bash
psql "<DIRECT_DSN>" -c "SELECT role, left(content::text,40) FROM spark_chat_messages ORDER BY seq;"
```

`user` / `assistant` の行が `seq` 昇順で並べば成功です。

---

## 8. 本番運用メモ (Production)

- 環境ごとに**専用の Neon ブランチ / DB** を用意する（dev / staging / prod を分離）。
- DSN は **Secret Manager** に格納し、ソースや `.env` に平文で置かない
  （`poc_customer_meeting_agent/api/.env.example` にも「本番: シークレットマネージャから取得すること」と明記）。
- **dev から本番ブランチを絶対に指さない**。`DATABASE_URL` の指す先を常に確認すること。

---

## 9. Firestore から何が変わったか (What changed vs. Firestore)

- **Firebase は identity 専用**になりました（ID トークン検証のみ）。データは持ちません。
- チャット履歴とトークンは Postgres の以下に保存:
  - `spark_chat_sessions` — チャットセッション（タイトル / 更新時刻）
  - `spark_chat_messages` — メッセージ本体（`seq` で順序付け、tool_call も保持）
  - `spark_google_tokens` — ユーザーごとの Google OAuth トークン
- 全行は **`(tenant_id, user_ref)`** でスコープされ、`user_ref` は **Firebase の uid**
  （未ログイン時は `anonymous_user`）。これによりテナント分離とユーザー分離が両立します。
- `core/store.py` の公開関数シグネチャは旧 Firestore 層と同一に保たれているため、
  バックエンドの他コードは変更不要です。
