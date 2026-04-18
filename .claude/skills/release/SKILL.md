---
name: release
description: xserver-mcp のリリースサイクル (SemVer bump → CHANGELOG → full gate → commit + annotated tag → GitHub Release → release.yml 経由の OIDC npm publish → npm 側 verification) を 1 本のフローで完遂する。単なる version bump ではなく `npm view` で新版が取得できるところまでが完了条件。0.x 期は breaking → minor / それ以外 → patch の SemVer 規則。
when_to_use: ユーザーが「リリースして」「v0.1.2 出して」「バージョン上げて」「リリース切って」「新しいバージョン公開」「次の release」「patch 出して」「minor 出して」「release」「cut a release」「publish to npm」「npm に公開」等に少しでも言及した時点で必ず起動する。`[Unreleased]` に未リリース項目が溜まっている、依存更新 PR をまとめて世に出したい、hotfix を本番に流したい、といった文脈も該当。引数 `$ARGUMENTS` で `patch` / `minor` / `major` / `vX.Y.Z` を受けられる。タグを切らない merge や npm publish を回避したいケースでは使わない。
allowed-tools: Bash(git *) Bash(gh *) Bash(npm *) Bash(awk *) Bash(sed *) Bash(cat *) Bash(rm *)
argument-hint: "[patch|minor|major|vX.Y.Z]"
effort: high
---

# Release workflow for xserver-mcp

ultrathink してから実行する。リリースは **push / tag / GitHub Release / npm publish / provenance 署名 / CHANGELOG / comparison link** を同時に整合させる必要があり、1 個ズレると生態系 (npm 上 dependents / GitHub release 一覧 / compare link) に長期のノイズを残す。npm は同じ version を再 publish できないので、取り返しのつかないポイント (tag push 以降) を最初に特定しておく。

引数 `$ARGUMENTS` があれば version bump 入力として解釈する (`patch` / `minor` / `major` / `v0.2.0` 等)。空なら Gate 1 でユーザーに確認する。

## When to use / When NOT to use

**Use**: `[Unreleased]` に未リリース項目が溜まって新 npm バージョンを生み出したい / 依存更新をまとめて出したい / hotfix を本番に流したい。

**Skip**: タグを切らない merge / CHANGELOG だけ更新したい / 別リポジトリ / npm publish 回避 / ベースブランチ変更・メジャーアーキテクチャ移行 (先にユーザーと方針決定)。

## Prerequisites (repo 固有の契約)

整っていない状態で強行すると OIDC publish が落ちる。壊れているなら skill で直さずユーザーに差し戻す。

- `.github/workflows/release.yml` が `release: published` + `workflow_dispatch` で起動し、`npm publish --provenance --access public` を走らせる
- npmjs.com で GitHub Actions が trusted publisher として登録済 (NPM_TOKEN 不要)
- `main` に branch protection (required checks + PR 必須) が設定済で admin bypass で push 可能 (solo maintainer 運用)
- `CHANGELOG.md` が Keep a Changelog 形式 + 末尾に `[x.y.z]: <compare url>` の comparison link を持つ
- `package.json` の `version` が CHANGELOG の直近タグと一致している

## Inputs (ユーザーから集める)

1. **Version bump**: `$ARGUMENTS` で `patch` / `minor` / `major` / `v0.2.0` いずれか。未指定なら `git log <last-tag>..HEAD --oneline` を読んで conventional commits から提案する:
   - **0.x 期**: `BREAKING` / `feat!:` → **minor**、それ以外 (`feat` / `fix` / `perf` / `docs` / `chore` 等) → **patch**
   - **1.0 以降**: SemVer 通常 (breaking → major、feat → minor、それ以外 → patch)
2. **Release notes 粒度**: `[Unreleased]` が既に埋まっているなら表記・順序の整形提案のみ。空なら `git log --oneline <last-tag>..HEAD` を conventional commits 種別でグループ化して下書きする。

## User approval gates (3 箇所だけ確認)

自動化が目的なので毎ステップ確認しない。「意味のある意思決定点」と「point of no return」の **3 箇所だけ** user approval を待ち、他は粛々と進める。Gate 3 以降は Step 10 まで自動完走させる。

| Gate | タイミング                  | 確認内容                                                 | NG 時のリカバリ          |
| :--: | --------------------------- | -------------------------------------------------------- | ------------------------ |
| 🛑 1 | Step 1 直前                 | 「v\<NEW\> で進めます。よいですか?」(根拠 1–3 行添える)  | 修正版を提示 or 停止     |
| 🛑 2 | Step 4 直前                 | `git diff CHANGELOG.md package.json` を見せて合意        | CHANGELOG を直して再提示 |
| 🛑 3 | Step 6 の tag push **直前** | 「以降 irreversible。次の patch でしか revert できない」 | tag 削除して停止         |

Gate 3 以降に失敗したら即 stop して recovery に移る (→ [references/troubleshooting.md](references/troubleshooting.md))。

## Preflight checks (1 つでも NG なら絶対に進めない)

```bash
git status --porcelain                                                  # 1. 作業ツリー empty
git rev-parse --abbrev-ref HEAD                                         # 2. "main"
git fetch origin && git rev-list --count HEAD..origin/main              # 3. 0 (origin と同期)
gh run list --branch main --workflow ci.yml --limit 1 \
  --json conclusion --jq '.[0].conclusion'                              # 4. "success"
npm view xserver-mcp-server@<TARGET_VERSION>                            # 5. 404 Not Found (未公開)
```

特に (4) "CI red での release" と (2)/(3) "main から外れた状態" は構造的にリリースを壊すのでユーザー押し切り NG。停止して原因を伝える。

## Execution steps (順番厳守、途中 failure で即停止)

### 1. Version bump

🛑 **Gate 1**。OK なら:

```bash
npm version <patch|minor|major> --no-git-tag-version
# または明示版:
npm version <x.y.z> --no-git-tag-version
```

`--no-git-tag-version` は commit と tag を明示制御するため。`package.json` + `package-lock.json` が書き換わる。同一 version 指定は `npm version` が既定でエラーにするので preflight 5 の二重防御になる。

### 2. Update CHANGELOG.md

Edit ツールで以下を反映:

1. `## [Unreleased]` の**下**に新セクションを挿入し ISO 日付を書く:

   ```markdown
   ## [Unreleased]

   ## [<NEW_VERSION>] - YYYY-MM-DD

   ### Added

   - ...
   ```

2. `[Unreleased]` 内容があれば新セクションへ移動
3. 空なら `git log v<OLD>..HEAD --oneline` を次で分類:
   - `feat(…)` → **Added**
   - `fix(…)` → **Fixed**
   - `refactor(…)` / `chore(deps)` → **Changed**
   - `docs(…)` → **Documentation** (keep-a-changelog 非標準だが本プロジェクトでは許容)
   - `chore!:` / `BREAKING CHANGE:` → **Changed** 冒頭に `**BREAKING**:` 明示
4. 末尾 comparison link を更新:
   ```
   [Unreleased]: https://github.com/Mink16/xserver-mcp/compare/v<NEW>...HEAD
   [<NEW>]: https://github.com/Mink16/xserver-mcp/releases/tag/v<NEW>
   [<OLD>]: ...(既存、そのまま残す)
   ```

### 3. Full gate (ローカル)

```bash
npm run format && npm run typecheck && npm run lint && npm test && npm run build
```

1 つでも落ちたら release 中止。**CI に任せず local で必ず通す**。release.yml 内の test もここと同等だが、手元で落ちる方が 20 秒早く気付ける。

### 4. Commit

🛑 **Gate 2**。OK なら:

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "$(cat <<'EOF'
chore(release): v<NEW_VERSION>

See CHANGELOG for details.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

subject は `chore(release): v<X.Y.Z>` が慣例。`Co-Authored-By` はプロジェクト規約 (`.claude/rules/commit-messages.md`)。

### 5. Push main (admin bypass)

```bash
git push origin main
```

`remote: - N of N required status checks are expected.` の warning は admin bypass の正常応答。push そのものが reject されていなければ OK。reject されたら別要因 (non-admin / 別保護ルール) なので調査する。

### 6. Tag 作成 → Gate 3 → tag push

```bash
git tag -a v<NEW_VERSION> -m "v<NEW_VERSION>"
```

🛑 **Gate 3**。「次の tag push + `gh release create` は revert には next patch 新規リリースが必要な irreversible flow。進めてよい?」。OK なら:

```bash
git push origin v<NEW_VERSION>
```

`-a` で annotated tag を作る (lightweight tag は使わない)。Release にメタ情報を残すため。

### 7. Release notes を抽出

```bash
awk '/^## \[<NEW_VERSION>\]/{flag=1;next} /^## \[/{flag=0} /^\[[^]]+\]:/{flag=0} flag' \
  CHANGELOG.md > /tmp/release-<NEW_VERSION>.md
sed -i '/./,$!d' /tmp/release-<NEW_VERSION>.md
cat >> /tmp/release-<NEW_VERSION>.md <<EOF

---

**npm**: https://www.npmjs.com/package/xserver-mcp-server/v/<NEW_VERSION>
**Full CHANGELOG**: [CHANGELOG.md](./CHANGELOG.md)
EOF
```

生成後に `/tmp/release-<NEW_VERSION>.md` が空でないことを確認する (awk pattern ずれで空ファイルになる事故を防ぐ)。

### 8. GitHub Release 作成 (release.yml 起動 trigger)

```bash
gh release create v<NEW_VERSION> \
  --title "v<NEW_VERSION>" \
  --notes-file /tmp/release-<NEW_VERSION>.md
```

これで Release が publish 状態になり、`release.yml` が `release: published` イベントで起動する。

### 9. release.yml の完走を待つ

```bash
RUN_ID=$(gh run list --workflow=release.yml --limit 1 \
  --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

通常 20 秒前後で完了。`--exit-status` で失敗時 non-zero exit。

### 10. npm 側に存在することを検証

```bash
npm view xserver-mcp-server@<NEW_VERSION>
npm view xserver-mcp-server versions   # 新版が末尾にあること
```

`maintainers` / `.unpackedSize` / `.tarball` が前バージョンと大きくズレていないか目視。provenance 付き publish は npm web UI でバッジが出るので併せて確認する。

### 11. ユーザーに最終報告 & cleanup

以下を 1 メッセージにまとめてユーザーに渡す:

- GitHub Release: `https://github.com/Mink16/xserver-mcp/releases/tag/v<NEW>`
- npm: `https://www.npmjs.com/package/xserver-mcp-server/v/<NEW>`
- `npm view xserver-mcp-server versions` の出力

tmpfile を掃除:

```bash
rm -f /tmp/release-<NEW_VERSION>.md
```

## Recovery / Troubleshooting

失敗パターン別の復旧手順は [references/troubleshooting.md](references/troubleshooting.md) に分離してある。よく起きる 9 ケース (CI red / full gate fail / main behind / admin bypass 不可 / tag 誤設定 / OIDC auth error / Node 差異 fail / release.yml 未起動 / 同 version 衝突) をカバー。失敗したら**必ず stop してそこから読む**。

## Why this skill exists

リリースは「`npm publish` を打つだけ」ではなく、**コミット履歴 / タグ / GitHub Release / npm / provenance 署名 / CHANGELOG / comparison link の整合性**を同時に満たす必要がある。1 個でも食い違うと生態系 (npm 上の dependents / GitHub の release 一覧 / provenance 検証 / compare link) が壊れる。このスキルは「抜けてはいけない step」と「起きがちな落とし穴」を 1 つの手順に圧縮し、ヒューマンエラーを構造的に排除する。
