## 概要

<!-- 1〜3 行で何を変えたか -->

## 動機 / 背景

<!-- なぜこの変更が必要か。関連 Issue があれば `Fixes #123` で閉じる -->

## 変更内容

- <!-- 箇条書きで主要な変更点 -->

## テスト

- [ ] 正常系テスト追加
- [ ] 入力検証テスト追加
- [ ] API エラーテスト追加
<!-- 手動確認した場合はその手順 -->

## 動作確認

<!-- 実際に `npm run build && node build/index.js` で動かしたログや MCP クライアント
からの呼び出し結果があれば貼る。機密情報はマスクする -->

## 影響範囲 / 破壊的変更

<!-- 既存ツールの I/O 変更や env 追加があれば明記。なければ「なし」 -->

## チェックリスト

- [ ] `npm run typecheck` / `npm test` / `npm run build` がローカルでグリーン
- [ ] TDD サイクル (RED → GREEN → REFACTOR) を踏んでいる
- [ ] 破壊的操作ツール (`delete_*`) は `confirm: z.literal(true)` ガード済
- [ ] エラーハンドリングは `runApi` (= `mapErrorToNormalizedResult`) 経由
- [ ] IDN 入力を受けるツールは `toPunycodeDomain` / `normalizeMailAddress` を通している
- [ ] `.env` / credentials をコミットに含めていない

詳細な観点は [`.claude/rules/pull-requests.md`](../.claude/rules/pull-requests.md) を参照。
