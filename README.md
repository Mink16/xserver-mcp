# XServer MCP Server

[![CI](https://github.com/Mink16/xserver-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Mink16/xserver-mcp/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Mink16/xserver-mcp/actions/workflows/codeql.yml/badge.svg)](https://github.com/Mink16/xserver-mcp/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/xserver-mcp-server)](./package.json)

> **English summary**: Unofficial Model Context Protocol (MCP) server that exposes the [Xserver server-panel REST API](https://developer.xserver.ne.jp/api/server/) (mail accounts, DNS records, server info, high-level domain verification) as MCP tools. Stdio transport only. Node.js 24+. Not affiliated with or endorsed by XServer Inc. Japanese documentation below.

Xserver 公式の [サーバーパネル REST API](https://developer.xserver.ne.jp/api/server/) (`https://api.xserver.ne.jp`) を MCP ツールとして公開する Node.js サーバー。

現状の対象 tag は `メールアカウント` / `サーバー情報` / `DNSレコード` および複合ツール (`domain_verification`)。

## ロードマップ

対応を予定している公式 API タグ (優先順位順・未確定):

- `WordPress簡単インストール` — `list` / `install` / `update` / `delete`
- `Cron設定` — `list` / `create` / `update` / `delete`
- `メール振り分け` — `list` / `create` / `delete`
- `FTPアカウント` — `list` / `create` / `update` / `delete`
- `サブドメイン` / `ドメイン設定` — `list` / `create` / `delete` (破壊的なため `confirm` ガード必須)
- `MySQL` / `PHPバージョン` / `SSL設定` など残りのタグ

機能要望は [Issue](https://github.com/Mink16/xserver-mcp/issues/new?template=feature_request.yml) から受け付けます。

> **⚠ 非公式プロジェクトです**
> 本プロジェクトは XServer / エックスサーバー (エックスサーバー株式会社 / XServer Inc.) が公式に提供・監修・承認するものではありません。XServer 社とは資本・契約関係のない個人有志による非公式 (unofficial) な OSS クライアントです。
> "XServer" / "エックスサーバー" は XServer Inc. の商標・サービス名であり、本 README での言及は同社サービスに対応した API クライアントであることを説明する目的 (nominative use) に限られます。XServer Inc. のロゴ・ブランドリソースは使用していません。
> 本ソフトウェアの利用によって XServer アカウント・ドメイン・サーバー上のデータに生じたいかなる損害についても、著作者は責任を負いません (MIT License 参照)。`XSERVER_API_KEY` はユーザー自身が発行・管理するものであり、本プロジェクトが第三者に送信・収集することはありません。

## 提供ツール

全ツールは日本語ドメイン (IDN) をそのまま受け付け、MCP 側で Punycode に自動正規化する (`src/tools/domain.ts`)。書き込み系ツールのレスポンスには実際に送信された `resolved_domain` / `resolved_mail_address` が含まれる。**DNS レコードの `host` / `content` はラベル・任意文字列なので変換しない**。

### toolset: `mail`

| ツール                   | メソッド | パス                                                      |
| ------------------------ | -------- | --------------------------------------------------------- |
| `list_mail_accounts`     | GET      | `/v1/server/{sv}/mail`                                    |
| `create_mail_account`    | POST     | `/v1/server/{sv}/mail`                                    |
| `get_mail_account`       | GET      | `/v1/server/{sv}/mail/{mail_account}`                     |
| `update_mail_account`    | PUT      | `/v1/server/{sv}/mail/{mail_account}`                     |
| `delete_mail_account`    | DELETE   | `/v1/server/{sv}/mail/{mail_account}` (confirm=true 必須) |
| `get_mail_forwarding`    | GET      | `/v1/server/{sv}/mail/{mail_account}/forwarding`          |
| `update_mail_forwarding` | PUT      | `/v1/server/{sv}/mail/{mail_account}/forwarding`          |

### toolset: `server`

| ツール             | メソッド | パス                                |
| ------------------ | -------- | ----------------------------------- |
| `get_server_info`  | GET      | `/v1/server/{sv}/server-info`       |
| `get_server_usage` | GET      | `/v1/server/{sv}/server-info/usage` |

`get_server_info` のレスポンスに含まれる `domain_validation_token` は、新規ドメインの TXT 認証 (`_xserver-verify.{domain}` に `xserver-verify={token}`) に利用する。

### toolset: `dns`

| ツール              | メソッド | パス                                               |
| ------------------- | -------- | -------------------------------------------------- |
| `list_dns_records`  | GET      | `/v1/server/{sv}/dns`                              |
| `create_dns_record` | POST     | `/v1/server/{sv}/dns`                              |
| `update_dns_record` | PUT      | `/v1/server/{sv}/dns/{dns_id}`                     |
| `delete_dns_record` | DELETE   | `/v1/server/{sv}/dns/{dns_id}` (confirm=true 必須) |

### toolset: `domain_verification` (複合ツール)

| ツール                                  | 概要                                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ensure_domain_verified`                | `_xserver-verify.{domain}` TXT レコードを現在の `domain_validation_token` と一致する状態に揃える。既に一致するレコードがあれば何もしない。                    |
| `create_mail_account_with_verification` | 既存確認 → ensure_domain_verified → `POST /mail` (最大 `verification_wait_ms` ぶんリトライ) を 1 呼び出しで完遂する mail-address-creator 向け高レベルツール。 |

`servername` (`{sv}`) は `.env` の `XSERVER_SERVERNAME` で固定され、各ツールの引数には含まれない。

### エラー応答形式

全ツールは失敗時に以下の正規化された形式を返す (MCP の `isError: true` 付き):

```json
{
  "error": "XserverValidationError: 入力が不正です",
  "code": "VALIDATION_ERROR",
  "detail": {
    "status": 422,
    "body": { "error": { "code": "VALIDATION_ERROR", "message": "...", "errors": [...] } },
    "errors": ["mail_address は必須です"],
    "retry_after_seconds": 3,              // 429 のみ
    "rate_limit": { "remaining": 0 }       // 429 のみ
  }
}
```

`code` は公式仕様の `BAD_REQUEST` / `UNAUTHORIZED` / `FORBIDDEN` / `NOT_FOUND` / `OPERATION_ERROR` / `VALIDATION_ERROR` / `RATE_LIMIT_EXCEEDED` / `INTERNAL_ERROR` / `BACKEND_ERROR` / `API_ERROR` のいずれか。`domain_verification` の高レベルツールはこれに加えて `DOMAIN_VERIFICATION_TIMEOUT` / `ALREADY_EXISTS` を返すことがある。

## 前提条件

- Node.js **24 以上** (`package.json` の `engines` 準拠)
- Xserver サーバーパネルで発行した **API キー**
  - 発行手順: [Xserver マニュアル「APIキー」](https://www.xserver.ne.jp/manual/man_tool_api.php) (同内容: [サポートサイト版](https://support.xserver.ne.jp/manual/man_tool_api.php))

## セットアップ

```bash
cp .env.example .env
# .env の XSERVER_API_KEY と XSERVER_SERVERNAME を実値に書き換える

npm install
npm run build
```

### 環境変数

| 変数                              | 必須 | 既定                        | 用途                                                                                       |
| --------------------------------- | ---- | --------------------------- | ------------------------------------------------------------------------------------------ |
| `XSERVER_API_KEY`                 | ✅   | —                           | Xserver API の Bearer トークン (サーバーパネル → API で発行)                               |
| `XSERVER_SERVERNAME`              | ✅   | —                           | サーバー名 (例: `sv12345.xserver.jp`)                                                      |
| `XSERVER_BASE_URL`                |      | `https://api.xserver.ne.jp` | API ベース URL (テスト差し替え用)                                                          |
| `XSERVER_HTTP_CONCURRENCY`        |      | `3`                         | 同時接続上限。プラン別上限 (スタンダード 5 / プレミアム 10 / ビジネス 20) より保守的に設定 |
| `XSERVER_HTTP_RETRY_MAX_ATTEMPTS` |      | `2`                         | 429 の総試行回数。`1` でリトライ無効                                                       |
| `XSERVER_HTTP_RETRY_MAX_WAIT_SEC` |      | `10`                        | `Retry-After` がこの秒数を超えたらリトライせず即返す                                       |
| `ENABLE_TOOLSETS`                 |      | (全有効)                    | 有効化する toolset をカンマ区切りで指定。`mail` / `server` / `dns` / `domain_verification` |

## Claude Code / Claude Desktop での使用

プロジェクト側の `.mcp.json` もしくは `claude_desktop_config.json` に以下を追記:

```json
{
  "mcpServers": {
    "xserver": {
      "command": "node",
      "args": ["/絶対パス/to/xserver-mcp/build/index.js"]
    }
  }
}
```

別の MCP サーバーから子プロセスとして呼ぶ場合も同様に `node <path>/build/index.js` で起動する。相対パス指定時は呼び出し側の CWD を基準とする。

## 開発

```bash
npm run test:watch    # TDD
npm run typecheck     # tsc --noEmit
npm run dev           # tsx 直接実行 (build 不要)
```

### OpenAPI 仕様 (開発者向けリファレンス)

Xserver 公式 API の OpenAPI 仕様 (`docs/xserver-openapi.json`) は著作権の都合上リポジトリに含めていない (`.gitignore` 済)。開発時に参照したい場合は [公式ドキュメント](https://developer.xserver.ne.jp/api/server/) から取得して `docs/xserver-openapi.json` として配置する。ビルド・テストには不要。

### MCP Inspector で動作確認

```bash
npm run build
npx @modelcontextprotocol/inspector node build/index.js
```

ブラウザが開くので `Tools` タブから各ツールを実行できる。

## テスト

- Vitest。`npm test` で全テスト、`npm run test:coverage` でカバレッジ。
- `global.fetch` を `tests/helpers/mockFetch.ts` でモックし、HTTP 呼び出しの URL / method / body / ヘッダ を検証。
- 各ツールにつき 正常系 + 入力スキーマ検証 + API エラーを網羅。

## コントリビュート

TDD (RED → GREEN → REFACTOR) サイクルを厳守する。手順・エージェントの使い分け・完了ゲートは [`.claude/rules/tdd-workflow.md`](./.claude/rules/tdd-workflow.md) を参照。PR 前のチェックリストは [`.claude/rules/pull-requests.md`](./.claude/rules/pull-requests.md)。

`CLAUDE.md` と `.claude/` 配下 (`rules/` / `agents/` / `skills/`) は Claude Code などの LLM エージェントがこのリポジトリのコンテキストとして読み込むためのファイルで、人間の読み物としても本リポジトリの設計判断・運用ポリシーを知るのに役立つ。

## バージョニング方針

変更履歴は [`CHANGELOG.md`](./CHANGELOG.md) に [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) 形式で記録します。

本プロジェクトは将来的に [Semantic Versioning](https://semver.org/lang/ja/) に準拠しますが、**`0.x` の期間中は互換性を保証しません**。minor バージョン間でも破壊的変更 (ツール名・入出力スキーマ・エラー code の変更等) が入る可能性があります。安定化後に `1.0.0` をリリースします。

## 行動規範

本プロジェクトの Issue / PR / Discussion での振る舞いは [Contributor Covenant v2.1](./CODE_OF_CONDUCT.md) に従います。

セキュリティ脆弱性は公開 Issue ではなく [`SECURITY.md`](./SECURITY.md) の手順で非公開報告してください。

## ライセンス

[MIT](./LICENSE)
