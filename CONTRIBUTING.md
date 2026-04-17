# Contributing to xserver-mcp

このプロジェクトへの貢献に興味を持っていただきありがとうございます。以下の開発フローに沿って PR を送ってください。

## 必要な環境

- Node.js 20 以上 (`package.json` の `engines` 準拠)
- npm
- Xserver サーバーパネルの API キー (ローカルで実 API を叩く場合のみ。ユニットテストは不要)

## セットアップ

```bash
git clone https://github.com/Mink16/xserver-mcp.git
cd xserver-mcp
npm install
cp .env.example .env  # 実 API を叩く場合のみ値を入れる
```

## 開発フロー

本プロジェクトは **TDD (Test-Driven Development)** を必須としています。

```
RED (失敗するテストを書く)
  ↓
GREEN (最小の実装でテストを通す)
  ↓
REFACTOR (テストを緑に保ったまま整理)
```

詳細なルールは以下に分かれています:

- [`.claude/rules/tdd-workflow.md`](./.claude/rules/tdd-workflow.md) — TDD サイクルと完了ゲート
- [`.claude/rules/github-flow.md`](./.claude/rules/github-flow.md) — ブランチ命名・マージ戦略
- [`.claude/rules/commit-messages.md`](./.claude/rules/commit-messages.md) — Conventional Commits 規約
- [`.claude/rules/pull-requests.md`](./.claude/rules/pull-requests.md) — PR テンプレートとレビュー観点

## PR 提出前のチェック

以下がすべてグリーンになっていることを必ずローカルで確認してください:

```bash
npm run typecheck
npm test
npm run build
```

`.github/pull_request_template.md` のチェックリストに従って PR 本文を埋めてください。

## 新しいツールを追加する

1. `tests/tools/<domain>/<name>.test.ts` に失敗テスト (正常系 + 入力検証 + API エラー) を書いて RED を確認
2. `src/tools/<domain>/<name>.ts` を作成し `ToolDefinition` を export して GREEN にする
3. `src/tools/<domain>/index.ts` と `src/tools/registry.ts` に登録
4. `.claude/rules/tdd-workflow.md` の「完了ゲート」を一通りパスする

IDN 正規化・`runApi` 経由のエラー処理・`confirm: z.literal(true)` ガード・公式エラーコードのマッピングなど、このリポジトリ固有の観点は [`CLAUDE.md`](./CLAUDE.md) に全てまとまっています。迷ったらまず CLAUDE.md を読んでください。

## バグ報告・機能要望

[GitHub Issues](https://github.com/Mink16/xserver-mcp/issues) でお願いします。再現手順と期待動作・実際の動作を明記してください。

## 行動規範

本プロジェクトは [Contributor Covenant v2.1](./CODE_OF_CONDUCT.md) に準拠しています。Issue / PR / Discussion いずれの場面でも行動規範に従ってください。

## ライセンスと CLA について

貢献いただいたコードは [MIT License](./LICENSE) の下で配布されます。

本プロジェクトは CLA (Contributor License Agreement) / DCO (Developer Certificate of Origin) のいずれも**採用していません**。Pull Request を送信した時点で、貢献者は当該変更を MIT License の下で配布することに同意したものとみなします。

第三者の著作物を含むコード (他 OSS からのコピー等) を混入させないでください。もし混入させる場合は PR 本文に出典とライセンスを明記し、MIT 互換であることを確認してください。
