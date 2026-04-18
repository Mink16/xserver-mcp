---
name: Pull Requests
description: PR 作成・レビュー・マージ手順。作成前チェックリストと xserver-mcp 固有のレビュー観点を含む
---

# プルリクエスト運用ルール

## 作成前チェックリスト

PR を開く前に**すべて** pass していること。どれか 1 つでも落ちているなら PR を開かない。

- [ ] `npm run typecheck` がグリーン
- [ ] `npm test` がグリーン (新ツール追加時は対応テストが存在すること)
- [ ] `npm run build` が成功
- [ ] TDD 手順を踏んでいる (CLAUDE.md「新ツール追加の定型手順」参照)
- [ ] 破壊的操作ツール (`delete_*`) を追加した場合は `confirm: z.literal(true)` ガードがある
- [ ] エラーハンドリングは `runApi` (= `mapErrorToNormalizedResult`) 経由になっている
- [ ] IDN 入力を受けるツールは `toPunycodeDomain` / `normalizeMailAddress` を通している
- [ ] `docs/xserver-openapi.json` を更新していない (公式仕様更新時以外は触らない)
- [ ] `.env` / 実運用 credentials がコミットに含まれていない
- [ ] **user-facing な変更** (新ツール / 入出力変更 / バグ修正 / 破壊的変更) なら `CHANGELOG.md` の `## [Unreleased]` に 1 行追記した (`docs` / `test` / 内部 `refactor` / `chore(deps)` のみの PR なら不要)。これにより `release` skill の Step 2 がほぼ無作業になる (詳細: `github-flow.md#release-への接続`)

## PR タイトル

Conventional Commits と同形式。`commit-messages.md` の type / scope を流用する。

```
feat(tools/dns): add_dns_record に TTL 省略時のデフォルト値を追加
```

タイトルは 72 字以内を目安に、それを超える詳細は本文に書く。

## PR 本文テンプレート

```markdown
## 概要

<1〜3 行で何を変えたか>

## 動機 / 背景

<なぜこの変更が必要か。関連 Issue があれば `Fixes #123` で閉じる>

## 変更内容

- <箇条書きで主要な変更点>
- <追加/変更/削除したファイルや関数>

## テスト

- [ ] 正常系テスト追加
- [ ] 入力検証テスト追加
- [ ] API エラーテスト追加
- <手動確認した場合はその手順>

## CHANGELOG

- [ ] `CHANGELOG.md` の `## [Unreleased]` に追記済
- [ ] 追記不要 (`docs` / `test` / 内部 `refactor` / `chore(deps)` のみ)

## 動作確認

<実際に `npm run build && node build/index.js` で動かしたログや MCP クライアント
からの呼び出し結果があれば貼る。機密情報はマスクする>

## 影響範囲 / 破壊的変更

<既存ツールの I/O 変更や env 追加があれば明記。なければ「なし」>
```

`gh pr create` で作るときは本文を HEREDOC で渡す (CLAUDE 標準手順)。

## レビュー観点

レビュワー (自分でセルフレビューする場合も含む) が必ず確認する項目:

### レビューの委譲 (既定運用)

セルフレビューは read-only の `reviewer` エージェント (`.claude/agents/reviewer.md`) に委譲するのが既定。リポジトリ固有ルール (IDN 正規化・`runApi` 経由のエラー正規化・registry 登録漏れ・破壊的操作ガード・公式エラー code マッピング・レート制限挙動など) を CLAUDE.md と本ファイルの条文に照らして Blocker/Major/Minor/Nit の Severity 付き verdict を機械的に返す。

- **呼び出し方**: `Agent({ subagent_type: "reviewer", prompt: "..." })`。プロンプトで対象 diff (`git diff main...HEAD` や `gh pr diff <N>`) と重点観点を明示する。
- **Agent Team モード**: `implementer` の GREEN+REFACTOR 完了後に 3 人目の teammate として起動し、`SendMessage` で lead (メインセッション) に verdict を送る。Blocker は `[BLOCKER]` サブジェクトで即エスカレーションされる。
- **境界**: `reviewer` は**指摘のみ行い、修正・コミット・ブランチ操作は一切行わない** (Edit/Write 非搭載の設計)。Blocker/Major の修正は `tdd-developer` / `test-writer` / `implementer` に差し戻す (テスト起因は `test-writer`、実装起因は `implementer`)。
- **スキップしてよいケース**: ドキュメント・依存更新・タイポ修正など (`tdd-workflow.md` の「委譲しなくてよいタスク」に該当する場合)。

以下のチェックは `reviewer` 委譲時も人間 (lead) が最終確認する責任を負う。verdict を鵜呑みにせず、Blocker / Major は修正後に再レビューする。

### コード品質

- 新規ツールは `ToolDefinition` を export し、`src/tools/<domain>/index.ts` と `src/tools/registry.ts` 両方に登録されているか
- `z.object(...)` の input schema が OpenAPI 仕様 (`docs/xserver-openapi.json`) と整合しているか
- 型推論に任せられるところで余計な型注釈を書いていないか

### エラー処理

- API 呼び出しは `runApi` 経由。独自 try/catch で `{ error, code, detail }` を組み立てていないか
- 特別扱いが必要な 409 は `err instanceof XserverOperationError` で判定しているか (status === 409 で判定しない)
- それ以外のステータス分岐は `err.code` で行っているか (新しい派生クラスを増やしていないか)

### セキュリティ

- Bearer トークン (`XSERVER_API_KEY`) をログに出していないか
- エラーレスポンスの `detail.body` に credentials が混入していないか
- `mail_address` など `@` を含む URL パスは `encodeMailAccount` を通しているか

### テスト

- RED → GREEN の順で追加されているか (テストが無いのに実装があるのはダメ)
- `tests/tools/<domain>/<name>.test.ts` の命名規則に従っているか
- モックサーバ (MSW 等) のフィクスチャが実 API の形式と一致しているか

## マージ手順

1. CI (GitHub Actions) がグリーンになったことを確認
2. セルフレビュー + (可能なら) 他者レビュー
3. マージ戦略を選ぶ (`github-flow.md` 参照)
4. GitHub 上で Merge → ローカルで `git switch main && git pull --ff-only`
5. feature ブランチを削除 (ローカル + リモート)

## マージしてはいけない場合

- CI が落ちている / skip されている
- `--no-verify` でフックをバイパスしたコミットが含まれている
- レビューで指摘された懸念が未解決
- PR タイトル/本文が空または上記テンプレートから大きく逸脱している
- `main` が PR 作成後に大きく進んでいて conflict している (解消してから再 push)

## Draft PR の活用

作業途中でも早期にフィードバックが欲しい場合は `gh pr create --draft` で下書き PR を作ってよい。Ready for review に切り替える時点で上記チェックリストを満たすこと。
