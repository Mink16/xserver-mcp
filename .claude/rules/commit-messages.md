---
name: Commit Messages
description: Conventional Commits に基づくコミットメッセージ規約。scope は xserver-mcp の toolset / レイヤに合わせる
---

# コミットメッセージ規約

## 形式

```
<type>(<scope>): <subject>

<body (任意)>

<footer (任意)>
```

- **subject は 50 字以内**、日本語でも英語でも良いが**プロジェクト内で統一**する (既存履歴は日本語主体なので、原則日本語)。
- 末尾にピリオド/句点を付けない。
- subject は現在形・命令形寄り (「追加する」ではなく「追加」)。既存 commit の `CLAUDE.md: エラー正規化・レート制限・HTTP env の運用ガイドを追記` スタイルを踏襲。
- body は必要に応じて 72 字で折り返し、空行で subject と分ける。「何を」ではなく**「なぜ」**を書く。

## type

| type       | 用途                                                                              |
| ---------- | --------------------------------------------------------------------------------- |
| `feat`     | 新ツール・新機能の追加                                                            |
| `fix`      | バグ修正 (挙動が変わる)                                                           |
| `refactor` | 挙動を変えない内部改善                                                            |
| `perf`     | パフォーマンス改善                                                                |
| `test`     | テストの追加・修正のみ (プロダクションコード変更なし)                             |
| `docs`     | README / CLAUDE.md / `.claude/rules/` 等ドキュメント                              |
| `chore`    | 依存更新・ビルド設定・ツール類 (`package.json` / `tsconfig` / `vitest.config` 等) |
| `build`    | ビルド生成物・スクリプト                                                          |
| `ci`       | CI 設定 (GitHub Actions 等)                                                       |
| `style`    | フォーマットのみ (挙動変更なし)。Prettier 自動整形など                            |

破壊的変更は subject 末尾に `!` を付けるか、footer に `BREAKING CHANGE: 説明` を書く。
例: `feat(tools/mail)!: create_mail_account のレスポンス形式を変更`

## scope

本プロジェクトでよく使う scope。新しい領域を追加したらここにも追記する。

- `tools/mail`, `tools/dns`, `tools/server`, `tools/domain_verification` — toolset 単位
- `tools/helpers` — `runApi` / `mapErrorToNormalizedResult` など共通
- `client` — `src/client/**` (httpClient / errors / rateLimit)
- `config` — `src/config.ts`
- `registry` — `src/tools/registry.ts`
- `domain` — `src/tools/domain.ts` (IDN 正規化)
- `tests` — テストインフラ自体の変更
- `docs` — ドキュメント (scope 省略可)
- `deps` — 依存更新 (`chore(deps): bump vitest to x.y.z`)

複数 scope にまたがる場合は scope を省略するか、最も影響が大きいものを 1 つ選ぶ。

## 避けるべきメッセージ

- 内容のない subject: `fix bug`, `update`, `WIP`, `タイポ修正` (何の?)
- 1 コミットに複数の無関係な変更を詰め込む
- `first commit` / `initial` 以外での無内容コミット

## 推奨例

```
feat(tools/mail): create_mail_account_with_verification を追加

TXT レコード未設定ドメインでの初回 API 呼び出しが 409 になる問題を
自動吸収するため、内部で DNS 登録 → TXT 伝播待機 → メールアカウント
作成を連結する複合ツールを追加する。
```

```
fix(client): 429 の Retry-After が 0 のときリトライループを防ぐ
```

```
refactor(tools/helpers): エラー正規化を mapErrorToNormalizedResult に一本化
```

```
docs: CLAUDE.md にレート制限ヘッダの運用ガイドを追記
```

## Claude Code が commit を作るとき

自動生成する際は上記に加えて、コミット末尾に以下を付ける (プロジェクト既定):

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
