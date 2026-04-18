# Changelog

本プロジェクトの全ての注目すべき変更は本ファイルに記録します。

フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠し、バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に従います。

ただし **`0.x` の期間中は互換性を保証しません**。minor バージョンでも破壊的変更が入る可能性があります。`1.0.0` リリース以降に完全な SemVer に移行します。

## [Unreleased]

## [0.1.1] - 2026-04-18

### Added

- npm registry 公開: `npm install xserver-mcp-server` / `npx xserver-mcp-server` で導入可能になった。
- `.github/workflows/release.yml`: GitHub Release 公開 / workflow_dispatch で OIDC provenance publish を自動化。NPM_TOKEN 不要。
- README / README.en.md に npm 経由の導入手順と npm version badge を追加。

### Changed

- CodeQL workflow に `workflow_dispatch` trigger を追加 (手動起動 / タグからの検証用)。

## [0.1.0] - 2026-04-18

### Added

- 初回公開。
- toolset `mail`: `list_mail_accounts` / `create_mail_account` / `get_mail_account` / `update_mail_account` / `delete_mail_account` / `get_mail_forwarding` / `update_mail_forwarding`
- toolset `server`: `get_server_info` / `get_server_usage`
- toolset `dns`: `list_dns_records` / `create_dns_record` / `update_dns_record` / `delete_dns_record`
- toolset `domain_verification` (複合ツール): `ensure_domain_verified` / `create_mail_account_with_verification`
- IDN (日本語ドメイン) を Punycode に自動正規化するユーティリティ (`src/tools/domain.ts`)
- 公式エラーレスポンス (`{ error: { code, message, errors } }`) のパースと `{ error, code, detail }` 形式への正規化 (`src/tools/helpers.ts`)
- レート制限ヘッダ (`X-RateLimit-*` / `Retry-After`) の解釈と 429 自動リトライ (`src/client/httpClient.ts`)
- 同時接続セマフォ (既定 3)
- 破壊的操作ガード (`delete_*` ツールは `confirm: z.literal(true)` 必須)
- `ENABLE_TOOLSETS` による toolset 個別有効化

### Requirements

- **Node.js 24 以上** (Active LTS)。Node 20/22 はサポート対象外。

[Unreleased]: https://github.com/Mink16/xserver-mcp/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/Mink16/xserver-mcp/releases/tag/v0.1.1
[0.1.0]: https://github.com/Mink16/xserver-mcp/releases/tag/v0.1.0
