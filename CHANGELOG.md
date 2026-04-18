# Changelog

本プロジェクトの全ての注目すべき変更は本ファイルに記録します。

フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠し、バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に従います。

ただし **`0.x` の期間中は互換性を保証しません**。minor バージョンでも破壊的変更が入る可能性があります。`1.0.0` リリース以降に完全な SemVer に移行します。

## [Unreleased]

## [0.1.3] - 2026-04-18

### Changed

- `.claude/hooks/completion-gate.sh` を追加 (Phase 3)。`Stop` + `SubagentStop` (matcher `tdd-developer|implementer|test-writer`) で `src/` / `tests/` に変更がある状態の終了時に `npm run typecheck && npm test` を自動実行し、fail なら `decision: block` で agent に差し戻す。30 秒以内の再走はキャッシュ (`.claude/.hints/gate-last.stamp`) で skip、`stop_hook_active=true` で無限ループ防止、`XSERVER_MCP_SKIP_GATE=1` で bypass。`reviewer` / `reviewer-architect` は read-only のため matcher から除外。
- `.claude/hooks/guard-main-branch.sh` を追加 (Phase 3)。`PreToolUse` (`Write` / `Edit` / `MultiEdit`) で main ブランチ直での `src/` / `tests/` 編集を deny し、`.claude/rules/github-flow.md` の「main への直接コミット禁止」を機械的に担保する。`XSERVER_MCP_ALLOW_MAIN_EDIT=1` で bypass。`package.json` / `tsconfig.json` / `CHANGELOG.md` / `docs/` / `.claude/` は対象外 (release skill の `chore(release)` 編集と docs typo 修正を阻害しないため)。
- 本バージョンで Claude Code hooks の段階導入 (Phase 1 → 2 → 3) を完了。全 10 本の hook (`session-context` / `release-hint` / `guard-bash` / `guard-paths` / `guard-main-branch` / `format-changed` / `check-tdd-pair` / `check-registry` / `check-runapi` / `completion-gate`) が CLAUDE.md と `.claude/rules/` の不変条件を機械的に検査する。`.claude/` 配下のみのため npm package (`xserver-mcp-server`) への影響はなし。

## [0.1.2] - 2026-04-18

### Changed

- `.claude/hooks/` に Claude Code hooks を 8 本導入 (Phase 1: `guard-bash` / `guard-paths` / `format-changed` / `session-context`、Phase 2: `check-tdd-pair` / `check-registry` / `check-runapi` / `release-hint`)。`.claude/settings.json` の `SessionStart` / `PreToolUse` / `PostToolUse` / `UserPromptSubmit` に登録し、CLAUDE.md と `.claude/rules/` の不変条件 (破壊的操作遮断・保護ファイル保全・TDD 規律・registry 登録漏れ検知・`runApi` 経由の正規化徹底・リリース導線案内) を機械的に検査する。`.claude/` 配下のみのため npm package (`xserver-mcp-server`) への影響はなく、セッション内の運用自動化にとどまる。

### Documentation

- `release` skill を `.claude/skills/release/SKILL.md` に新設し公式ベストプラクティスに沿って改訂。user approval gate を 3 箇所 (bump 承認 / commit diff 合意 / tag push 直前) に明示。`github-flow.md` と `[Unreleased]` セクションで PR マージ → リリース起点を接続する運用フローを整理。

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

[Unreleased]: https://github.com/Mink16/xserver-mcp/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/Mink16/xserver-mcp/releases/tag/v0.1.3
[0.1.2]: https://github.com/Mink16/xserver-mcp/releases/tag/v0.1.2
[0.1.1]: https://github.com/Mink16/xserver-mcp/releases/tag/v0.1.1
[0.1.0]: https://github.com/Mink16/xserver-mcp/releases/tag/v0.1.0
