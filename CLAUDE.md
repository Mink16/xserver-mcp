# xserver-mcp

Xserver 公式の [サーバーパネル REST API](https://developer.xserver.ne.jp/api/server/) (`https://api.xserver.ne.jp`) をラップする MCP サーバー。

## 運用ルール (`.claude/rules/`)

リポジトリ運用の詳細ルールは `.claude/rules/` 以下に分割している。各ファイルは CLAUDE.md と同様にセッション開始時のコンテキストへ読み込まれる。

- `tdd-workflow.md` — **TDD 必須**ポリシーとエージェント (`tdd-developer` / `test-writer` / `implementer` / `reviewer`) の使い分け基準。`src/` / `tests/` のコード変更は原則これらに委譲する。
- `github-flow.md` — ブランチ命名・マージ戦略・禁止事項。
- `commit-messages.md` — Conventional Commits の type/scope と本プロジェクトの既定フッタ。
- `pull-requests.md` — PR テンプレート・セルフレビュー観点・マージ条件。セルフレビューは read-only の `reviewer` エージェント (`.claude/agents/reviewer.md`) に委譲し、IDN 正規化・`runApi`・registry 登録・破壊的操作ガードなどの固有観点を Blocker/Major/Minor/Nit の verdict で機械的に受け取るのが既定運用。

## Xserver API の癖

- **日本語ドメイン (IDN) は MCP が自動変換**: 全ツールの `domain` 入力と `mail_address` の domain 部は `src/tools/domain.ts` の `toPunycodeDomain` / `normalizeMailAddress` で ASCII (Punycode) に正規化してから XServer に送る。ユーザーや上位エージェントは `日本.jp` / `user@日本.jp` をそのまま渡してよい。書き込み系ツールのレスポンスには `resolved_domain` (および `resolved_mail_address`) が含まれ、実際に送信された ASCII 値を確認できる。**DNS レコードの `host` / `content` はラベル・任意文字列なので変換しない**。
- **公式エラーレスポンス形式**: XServer は `{ "error": { "code", "message", "errors": [...] } }` を返す。`src/client/errors.ts` の `errorFromResponse` がこれをパースし、旧 `{ "message": "..." }` 形式にもフォールバック対応する。抽出された `code` / `errors[]` は `XserverApiError.code` / `XserverApiError.errors` に格納され、ツール応答の `code` / `detail.errors` として LLM に届く。
- **HTTP ステータス → エラークラス / code 正規化**: マッピングの真の情報源は `src/client/errors.ts` の `STATUS_TO_CODE` / `STATUS_CLASS`。TXT 認証失敗など 409 の特別扱いが必要な場合は `err instanceof XserverOperationError` で判定する (`createMailAccountWithVerification.ts` 参照)。それ以外のステータス分岐は `err.code` で行うこと (派生クラスを増やさない)。
- **レート制限ヘッダ**: `httpClient` はレスポンスから `X-RateLimit-Limit` / `-Remaining` / `-Reset` / `-Concurrent-Limit` / `-Concurrent-Remaining` と `Retry-After` を抽出 (`src/client/rateLimit.ts`)。429 発生時は `XserverRateLimitError.rateLimit` と `.retryAfterSeconds` に格納され、ツール応答の `detail.rate_limit` / `detail.retry_after_seconds` として LLM に届く。成功時のヘッダは破棄している (MVP)。
- **429 の自動リトライ**: `httpClient` は 429 のうち「`Retry-After` が `XSERVER_HTTP_RETRY_MAX_WAIT_SEC` 以下」かつ「`X-RateLimit-Concurrent-Remaining !== 0`」のケースのみ、`XSERVER_HTTP_RETRY_MAX_ATTEMPTS` 回まで自動待機 & 再送する。同時接続由来の 429 は他の in-flight が捌けるまで解消しないのでリトライ対象外。それ以外の status はリトライせず LLM に即返す。無効化は `XSERVER_HTTP_RETRY_MAX_ATTEMPTS=1`。
- **同時接続セマフォ**: `createHttpClient` は `config.concurrency` (既定 3) の軽量セマフォで `fetch` を直列化する。XServer プラン別上限 (スタンダード 5 / プレミアム 10 / ビジネス 20) に対して保守的に振る舞う。無効化したい場合は `XSERVER_HTTP_CONCURRENCY=100` などで十分大きな値を与える。
- **422 バリデーション**: `err.errors[]` に詳細メッセージが配列で入る。ツール出力では `detail.errors` として LLM に渡す。
- **204 No Content**: DELETE などで返る場合あり。`httpClient` は `null` を返す。
- **`mail_address` の URL エンコード**: `@` を含むため必ず `encodeMailAccount` (= `encodeURIComponent`) を通すこと (IDN 正規化後に適用)。
- **ドメイン所有権確認 (TXT)**: `POST /mail` は毎回 `_xserver-verify.{domain}` TXT レコードで所有権検証を行う。サーバーパネル経由で作成済みのドメインは TXT 未登録のことが多く、初回 API 作成は `409 OPERATION_ERROR「TXTレコードによるドメイン認証に失敗しました。」` になる。`create_mail_account_with_verification` はこれを内部で吸収する (API 内部リゾルバへの TXT 反映は 30–90 秒遅延)。

## ツール層のエラー正規化

`src/tools/helpers.ts` の `mapErrorToNormalizedResult` が単一の変換点。`runApi` はこれを内部で呼ぶ。ツールを新設する際は原則 `runApi(() => client.request(...))` を使うだけで、以下の整った応答になる。

```json
{
  "error": "XserverValidationError: 入力が不正です",
  "code": "VALIDATION_ERROR",
  "detail": {
    "status": 422,
    "body": { /* 生レスポンス */ },
    "errors": ["mail_address は必須です"],
    "retry_after_seconds": 3,              // 429 のみ
    "rate_limit": { "remaining": 0, ... }  // 429 のみ
  }
}
```

`DomainValidationError` は自動で `VALIDATION_ERROR` にマップされる。高レベル複合ツール固有の code (`DOMAIN_VERIFICATION_TIMEOUT`, `ALREADY_EXISTS`) は呼び出し側で `normalizedErrorResult` を直接使う。

## 設計方針

- **stdio トランスポートのみ** (初期版)。`--transport http` は将来のタスク。
- **toolset**: `mail` / `server` / `dns` / `domain_verification` の 4 つ。`ENABLE_TOOLSETS` env でカンマ区切りで個別有効化可能 (例: `ENABLE_TOOLSETS=mail,domain_verification`)。未指定時は全有効。
- **破壊的操作**: `delete_mail_account` / `delete_dns_record` は `confirm: z.literal(true)` ガードで誤呼び出しを防ぐ。他の破壊的ツールを追加する際も同パターンを使う。
- **エラー**: ネットワーク/API エラーは例外ではなく `{ isError: true, content: [...] }` で LLM に伝える (MCP 規約)。全ツールは `runApi` (= `mapErrorToNormalizedResult`) 経由で `{ error, code, detail }` 形式に統一する。
- **高レベル複合ツール**: `domain_verification` toolset はプリミティブ (`server` / `dns` / `mail`) を内部で呼び出して 1 呼び出しで完結するエージェント向け API。固有の失敗 code (`DOMAIN_VERIFICATION_TIMEOUT`, `ALREADY_EXISTS`) に加え、下位 API エラーは上記の公式 code マッピング (`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `OPERATION_ERROR`, `RATE_LIMIT_EXCEEDED`, ...) がそのまま返る。

## 環境変数

| 変数                              | 既定                        | 用途                                             |
| --------------------------------- | --------------------------- | ------------------------------------------------ |
| `XSERVER_API_KEY`                 | (必須)                      | Bearer トークン                                  |
| `XSERVER_SERVERNAME`              | (必須)                      | `svXXXXX.xserver.jp` など                        |
| `XSERVER_BASE_URL`                | `https://api.xserver.ne.jp` | テスト時の差し替え                               |
| `XSERVER_HTTP_CONCURRENCY`        | `3`                         | 同時接続上限 (クライアント側セマフォ)            |
| `XSERVER_HTTP_RETRY_MAX_ATTEMPTS` | `2`                         | 429 の総試行回数。`1` でリトライ無効             |
| `XSERVER_HTTP_RETRY_MAX_WAIT_SEC` | `10`                        | `Retry-After` がこの秒数超ならリトライせず即返す |
| `ENABLE_TOOLSETS`                 | (全有効)                    | `mail,dns` のようにカンマ区切り                  |

## 触ってはいけないもの

- `docs/xserver-openapi.json` — Xserver 公式 API 仕様 (© XServer Inc.) の参照用コピー。**再配布許諾が明示されていないため `.gitignore` 済で公開しない**。開発時のリファレンスとして [公式ドキュメント](https://developer.xserver.ne.jp/api/server/) から各自取得して `docs/` に配置する。改変しない。
- `.env` — 実運用 credentials。コミット厳禁 (`.gitignore` 済)。
