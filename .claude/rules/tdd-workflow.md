# TDD ワークフロー運用ルール

## 原則

- **テストを書かずに実装を追加しない**。サイクルは厳密に RED → GREEN → REFACTOR。
- `npm run test:watch` を常時起動して作業する。
- 最終ゲートは `npm run typecheck && npm test && npm run build` の 3 点セット。どれか 1 つでも落ちている状態で「完了」を宣言しない。
- 1 コミット = 1 論理単位。RED / GREEN / REFACTOR は通常それぞれ別コミットにする (`commit-messages.md` 参照)。

## エージェントの使い分け

本リポジトリの TDD は 3 つの実装系エージェント + 1 つの read-only レビュー系エージェントで運用する。`.claude/agents/` 配下に定義。

| エージェント    | 担当フェーズ                                  | 編集範囲                | model  | 主な使い所                                                                                                                         |
| --------------- | --------------------------------------------- | ----------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `tdd-developer` | RED→GREEN→REFACTOR を 1 人で一気通貫          | `src/` と `tests/` 両方 | opus   | 小〜中規模の単発タスク。Agent Team 機能が無効な環境の既定                                                                          |
| `test-writer`   | RED 専任 (失敗するテスト作成)                 | **`tests/` のみ**       | sonnet | Agent Team の teammate role / 回帰テスト追加のみのタスク                                                                           |
| `implementer`   | GREEN + REFACTOR 専任                         | **`src/` のみ**         | opus   | Agent Team の teammate role / 既存 RED テストのグリーン化・挙動を変えない refactor                                                 |
| `reviewer`      | PR セルフレビュー・マージ前ゲート (read-only) | **無 (読むだけ)**       | opus   | GREEN+REFACTOR 完了後に PR diff を CLAUDE.md / `.claude/rules/` で採点し Blocker/Major/Minor/Nit の verdict を返す。修正は行わない |

`test-writer` と `implementer` は**編集範囲がフォルダ境界で完全に分離**されているため、同時並行で走っても衝突しない。`implementer` はテストを書かない/直さない — これにより「テストを緩めて通す」誘惑を構造的に排除する。`reviewer` は**編集権限自体を持たない** (Edit/Write 非搭載) ため、Blocker を握りつぶして merge を通すことも構造的に不可能。指摘のみ行い、修正は必ず `tdd-developer` / `test-writer` / `implementer` に差し戻す。

### 委譲すべきタスク

| タスク種別                          | ソロ型                  | Team 型                                               |
| ----------------------------------- | ----------------------- | ----------------------------------------------------- |
| 新ツール追加 (`feat`)               | `tdd-developer`         | `test-writer` → `implementer` → `reviewer`            |
| 挙動を変えるバグ修正 (`fix`)        | `tdd-developer`         | `test-writer` (回帰 RED) → `implementer` → `reviewer` |
| 挙動を変えない内部改善 (`refactor`) | `tdd-developer`         | `implementer` → `reviewer` (テストは既に緑)           |
| テスト追加のみ (`test`)             | —                       | `test-writer` 単独                                    |
| PR セルフレビュー / マージ前ゲート  | `reviewer` (standalone) | `reviewer` (teammate、`implementer` 完了後)           |

ソロ型でも PR を開く前に `reviewer` を standalone で呼んでマージ前ゲートに通すのが既定運用。

### 委譲しなくてよいタスク

- ドキュメント更新 (`docs`) — CLAUDE.md / README / `.claude/rules/`
- 依存更新 (`chore(deps)`) / ビルド設定 (`tsconfig` / `vitest.config`)
- 1〜2 行の typo 修正 (意味論に影響しないもの)
- `.env.example` などサンプル設定のみ

## 単独 subagent として起動する場合

Agent ツールで `subagent_type` を指定する。プロンプトには最低限以下を含める:

- 意図と背景 (なぜその変更が必要か)
- 対象ファイル / ツール名 / toolset
- 参考になる既存実装 (類似ツールのパス)
- 入出力契約 (該当する OpenAPI の endpoint)
- 期待する完了条件

例 (ソロ型):

```
Agent({
  subagent_type: "tdd-developer",
  description: "DNS TXT 一括削除ツール追加",
  prompt: "tools/dns に delete_dns_records_bulk を追加したい。
           既存の delete_dns_record.ts を参考に、confirm: z.literal(true) ガード
           付きで、複数 record_id を受け取って逐次削除する。..."
})
```

例 (RED のみ):

```
Agent({
  subagent_type: "test-writer",
  description: "429 Retry-After=0 の回帰テスト",
  prompt: "httpClient で Retry-After=0 秒のときリトライループになる回帰を
           固定するテストを tests/client/rateLimit.test.ts に追加。
           実装は別途 implementer で対応するので RED 確認まででよい。"
})
```

例 (レビュー):

```
Agent({
  subagent_type: "reviewer",
  description: "delete_dns_records_bulk の PR レビュー",
  prompt: "feat/dns-bulk-delete ブランチの PR をマージ前にレビュー。
           `git diff main...HEAD` を対象に CLAUDE.md と
           .claude/rules/pull-requests.md の条文で blockers / major /
           minor / nit に分類して verdict を返して。修正は不要、指摘のみ。"
})
```

## Agent Team モード (`test-writer` + `implementer`)

Kent Beck 流の「テストを書く役割と実装する役割を分ける」心理的独立性を LLM 上で再現する運用モード。複数の機能追加を並列で進めたい、もしくはテスト設計と実装設計を明確に分離したいときに有効。

### 前提

- 実験的機能 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` を `~/.claude/settings.json` もしくは環境変数で有効化していること
- Claude Code v2.1.32+ であること
- 公式仕様 (`https://code.claude.com/docs/en/agent-teams`) 上、subagent 定義 (`.claude/agents/*.md`) は teammate role としてそのまま再利用できる。body は teammate の system prompt に**追記**され、`tools` allowlist と `model` は尊重される
- **Team lead はメインセッション (= ユーザーと会話している Claude) が務める**。サブエージェントは nested team を作れない (公式仕様) ため、ソロ型の `tdd-developer` を起動した状態からは Team を組めない

### 起動

ユーザーが自然言語で lead (= メインセッション) に指示する:

```
tools/mail/delete_mail_account_bulk の追加を、test-writer と implementer の
2 人で agent team を組んで分担して進めて。RED → GREEN → REFACTOR の順。
```

Lead は `.claude/agents/test-writer.md` と `.claude/agents/implementer.md` の定義を読み取って 2 人の teammate を spawn する。teammate 間のメッセージングは `SendMessage`、共有タスクリストで進捗を管理。

### 運用ルール

- **順序と依存**: lead は RED タスクと GREEN タスクをタスクリストに分けて立て、GREEN タスクには RED タスクへの依存を付ける。`implementer` は依存が完了するまで GREEN を claim できない。
- **テスト修正の禁止**: `implementer` は `tests/` を**絶対に編集しない**。仕様として間違っていると思ったら `SendMessage` で `test-writer` に投げ返す (lead 経由でも可)。`test-writer` がテストを修正する責務を持つ。
- **実装編集の禁止**: `test-writer` は `src/` を**絶対に編集しない**。必要なら `implementer` に依頼する。
- **メインセッション (lead) の責任**:
  - 最終ゲート (`npm run typecheck && npm test && npm run build`) は lead が直接実行して確認する (teammate の報告を鵜呑みにしない)
  - コミット作成は lead が行う。teammate に git 操作を委譲しない
  - 各 teammate の報告を受けて整合性を検証し、矛盾があれば差し戻す
- **ファイル衝突**: `tests/` と `src/` で境界が切れているので基本的に発生しない。万一 `src/tools/<domain>/index.ts` のような両者が触りうる集約ファイルが出たら、`implementer` に一本化する (テスト側は新規テストファイル作成のみで済むはず)。

### Team を使わない方が良いケース

- 単一ツールの追加で、RED と GREEN が直列で数分で済む規模 → `tdd-developer` ソロが速い
- `refactor` で既存テストが全て緑の状態から動かない → `implementer` 単独 or `tdd-developer` ソロで十分
- Agent Teams が無効化されているクライアント → `tdd-developer` ソロ一択
- タイポ修正・ドキュメント更新 → エージェント自体不要

## 直接実行する場合の新ツール追加手順

何らかの理由でエージェントに委譲せず自分で実装するときは、以下の順を厳守する。これは 3 つのエージェントの内部ルールと**同一**であり、更新時は全箇所を同期させること。

1. `tests/tools/<domain>/<name>.test.ts` を作成 (正常系 + 入力検証 + API エラーの 3 種が目安)。実行して RED を**目視確認**する (テストが正しい理由で失敗していること)。
2. `src/tools/<domain>/<name>.ts` を作成し `ToolDefinition` を export。GREEN にするための最小実装に留める。
3. `src/tools/<domain>/index.ts` の集約配列に追加。
4. 新 toolset を追加する場合は `src/tools/registry.ts` の `toolsetNames` と `builders` 両方を更新。
5. `npm run typecheck && npm test && npm run build` で全体確認。

## 完了ゲート (共通)

以下がすべて満たされるまで「完了」を宣言しない。エージェントに委譲した場合もここで最終確認する。

- [ ] RED → GREEN → REFACTOR のサイクルを踏んだ (テストが先に存在する)
- [ ] `npm run typecheck` がグリーン
- [ ] `npm test` がグリーン
- [ ] `npm run build` が成功
- [ ] API 呼び出しは `runApi` (= `mapErrorToNormalizedResult`) 経由
- [ ] 409 は `err instanceof XserverOperationError` で判定、他ステータスは `err.code` で分岐 (派生クラスを増やしていない)
- [ ] IDN 入力を受けるツールは `toPunycodeDomain` / `normalizeMailAddress` を通している
- [ ] 書き込み系ツールのレスポンスに `resolved_domain` / `resolved_mail_address` を含めた
- [ ] 破壊的操作 (`delete_*` など) は `confirm: z.literal(true)` ガード
- [ ] `mail_address` は IDN 正規化後に `encodeMailAccount` を通した
- [ ] `docs/xserver-openapi.json` を改変していない
- [ ] `.env` / credentials をコミットに含めていない

## 関連ルール

- ブランチ運用・マージ戦略: `github-flow.md`
- コミット粒度・メッセージ: `commit-messages.md`
- PR 作成・レビュー観点: `pull-requests.md`
