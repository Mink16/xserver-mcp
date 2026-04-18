---
name: release
description: xserver-mcp のリリースサイクル全体 (SemVer version bump → CHANGELOG 更新 → full gate (typecheck / lint / format / test / build) → commit → main push → annotated tag → GitHub Release 作成で release.yml を起動し OIDC provenance npm publish まで) を 1 回のやり取りで完遂させるスキル。ユーザーが「リリースして」「v0.1.2 出して」「バージョン上げて」「新しいバージョン公開」「リリース切って」「次の release」「release」「cut a release」「publish to npm」「npm に公開」「patch 出して」等に少しでも言及したら必ず起動する。preflight (未コミット変更なし / main ブランチ / origin 同期 / 最新 CI が success / npm に target version が未公開) を最初に確認し、1 つでも失敗したら絶対に進めない。CHANGELOG の `[Unreleased]` を新バージョン日付付きに昇格させ、git log から差分を埋めて、ユーザーに diff を見せて確認してから tag + GitHub Release を作り、release.yml の npm publish --provenance 完了まで見届けて npm 側に実在することを検証する。0.x 期は breaking → minor / それ以外 → patch の SemVer 規則。単なる version bump ではなく OIDC publish の完了を含む end-to-end を担う。
---

# Release workflow for xserver-mcp

`package.json` の version を上げるだけでなく、**OIDC trusted publisher 経由で npm に公開されたバージョンが実在することを検証するまで**を 1 本のフローで完遂させるスキル。失敗するタイミングは早ければ早いほど良いので、preflight で落とせるものは絶対にここで落とす。

## When to use

次のどれかに該当する場面では必ず起動する:

- ユーザーが「リリースして」「v0.1.2 出して」「新しいバージョン出して」「patch 出して」「minor 出して」「release」「cut a release」「publish to npm」等に言及した
- `CHANGELOG.md` の `[Unreleased]` に項目が溜まっていて、そろそろタグを切るべきタイミング
- 依存更新 PR をまとめて公開したいとき
- Hotfix を本番に流したいとき

## When NOT to use

- コミットするだけ / タグを**切らない** PR マージ → release.yml は起動しない
- **パッケージ公開自体を見送る**意思決定があるとき (`release: published` なしで CHANGELOG だけ更新したい等)
- ベースブランチ変更・メジャーアーキテクチャ移行 (先にユーザーと方針決定)
- 他リポジトリ / 異なる publish 手段 (別 skill が必要)

## Prerequisites (repo 固有の契約)

次のインフラが整っていることが前提。壊れていたら release skill 単独では直せないのでユーザーに差し戻す。

- `.github/workflows/release.yml` が `release: published` と `workflow_dispatch` で起動し、`npm publish --provenance --access public` を実行する構成になっている
- npmjs.com 側で GitHub Actions が trusted publisher として登録済み (NPM_TOKEN 不要)
- `main` ブランチに branch protection が設定され、admin bypass で push 可能 (solo maintainer 運用)
- `CHANGELOG.md` が Keep a Changelog 形式 + 末尾 comparison link で管理されている
- `package.json` の `version` が CHANGELOG の直近タグと一致している

## Inputs to collect from the user

リリース実行前に最低限これだけ明確化する。ユーザーが既に渡していたら聞き直さない:

1. **Version bump** — `patch` / `minor` / `major` のいずれか、または明示的な `v0.2.0` 形式
   - 指定なしなら `git log <last-tag>..HEAD` を読んで提案する
   - **0.x 期の SemVer**: BREAKING や `feat!:` → minor、それ以外 (`feat` / `fix` / `perf` / `docs` / `chore` 等) → patch
   - 1.0 以降: 通常の SemVer (breaking → major、feat → minor、その他 → patch)
2. **リリースノートの粒度** — `[Unreleased]` に項目が既にあるかどうか確認する
   - 空なら `git log --oneline <last-tag>..HEAD` を conventional commits 種別でグループ化して下書きを提示
   - 既にあるなら順序・表現を整える提案のみ

**diff をユーザーに見せて明示的に確認を取ってから commit する**。勝手にリリースを進めない。

## User approval gates (3 箇所でのみユーザー承認を待つ)

リリースは**自動化**が目的なので、毎ステップで質問するのは NG。代わりに「意味のある意思決定点」と「point of no return」の合計 **3 箇所**でだけ user approval を取る。それ以外の mechanical step はユーザーに確認せず粛々と進める。

- 🛑 **Gate 1 — version 決定後 (Step 1 の直前)**: 「v<NEW> で進めます。よいですか?」と確認し、ユーザーの GO / CANCEL を待つ。根拠 (git log の conventional commits 分析) を 1-3 行で添える。
- 🛑 **Gate 2 — CHANGELOG diff 完成後 (Step 4 の直前)**: CHANGELOG の diff (`git diff CHANGELOG.md`) をユーザーに見せて「この内容で commit します。よいですか?」と確認。表記・順序・抜けを直せる最後のチャンス。
- 🛑 **Gate 3 — tag push 直前 (Step 6 の `git push origin v<NEW>` の直前)**: 「これ以降は tag push + GitHub Release 作成 → release.yml が npm publish を走らせる **irreversible な flow** です。よいですか?」と最終確認。ここで OK なら以降 Step 10 までは自動で完走させる (個別にユーザーを煩わせない)。

Gate 3 以降で失敗が起きたら stop してユーザーに現状を報告し、recovery 手順 (`Troubleshooting` 参照) を選んでもらう。

## Preflight checks (1 つでも NG なら絶対に進めない)

```bash
# 1. 作業ツリーがクリーンか
git status --porcelain        # 空であること
# 2. main にいるか
git rev-parse --abbrev-ref HEAD   # "main"
# 3. origin と同期しているか
git fetch origin && git rev-list --count HEAD..origin/main  # 0
# 4. 最新の CI が success か
gh run list --branch main --workflow ci.yml --limit 1       # conclusion: success
# 5. npm に target version が未公開か
npm view xserver-mcp-server@<TARGET_VERSION>                # 404 Not Found
```

失敗したら**ユーザーに何が NG かを伝えて停止する**。特に「CI が red」「main が古い」の状態でリリースを強行しない — 構造的に壊れる。

## Execution steps (順番厳守・途中 failure で即停止)

### 1. Version bump

🛑 **Gate 1 をここで通すこと** (前述)。OK なら実行:

```bash
npm version <patch|minor|major> --no-git-tag-version
```

`--no-git-tag-version` は **commit と tag を我々が明示的に制御するため**。`npm version` は `package.json` と `package-lock.json` の両方を書き換える。

明示版指定なら:

```bash
npm version <x.y.z> --no-git-tag-version
```

`npm version` は既定で「同じ version への指定」をエラーにするので、`preflight 5` をすり抜けた場合も二重の防御になる。

### 2. Update CHANGELOG.md

以下を順に `Edit` ツールで反映:

1. `## [Unreleased]` の下に新セクションを挿入し、日付を ISO 形式で書く

   ```markdown
   ## [Unreleased]

   ## [<NEW_VERSION>] - YYYY-MM-DD

   ### Added

   - ...
   ```

2. `[Unreleased]` に項目があれば新バージョンセクションに移動する
3. 項目がなければ `git log v<OLD>..HEAD --oneline` をベースに draft する:
   - `feat(...)` → **Added**
   - `fix(...)` → **Fixed**
   - `refactor(...)` → **Changed**
   - `chore(deps)` → **Changed** (依存更新としてまとめる)
   - `docs(...)` → **Documentation** (keep-a-changelog 非標準だが本プロジェクトでは OK)
   - `chore!:` や `BREAKING CHANGE:` を含むもの → **Changed** の冒頭に `**BREAKING**:` 付きで明示
4. 末尾の comparison link を更新:
   ```
   [Unreleased]: https://github.com/Mink16/xserver-mcp/compare/v<NEW>...HEAD
   [<NEW>]: https://github.com/Mink16/xserver-mcp/releases/tag/v<NEW>
   [<OLD>]: ...(既存、そのまま)
   ```

**diff をユーザーに見せて承認を取る**。勝手に進めない。

### 3. Full gate (ローカル)

```bash
npm run format && \
  npm run typecheck && \
  npm run lint && \
  npm test && \
  npm run build
```

1 つでも失敗したらリリース中止。原因を特定して修正 → 再実行。CI に任せず**ローカルで必ず通す** (release.yml 内の test もここと同じだが、先に落ちるほど早い)。

### 4. Commit

🛑 **Gate 2 をここで通すこと** (`git diff CHANGELOG.md package.json` を見せて承認待ち)。OK なら:

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "$(cat <<'EOF'
chore(release): v<NEW_VERSION>

See CHANGELOG for details.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

`chore(release): v<VERSION>` が subject の慣例。 `Co-Authored-By` フッタは本プロジェクトのコミット規約 (`.claude/rules/commit-messages.md`) で必須。

### 5. Push main (admin bypass)

```bash
git push origin main
```

Branch protection で required status checks が要求されるが、solo maintainer は admin bypass で通る。標準エラーに:

```
remote: - 7 of 7 required status checks are expected.
```

が出ても push 自体が通っていれば OK (required checks はこの push に対して走り始めるだけ)。push が **reject** されたら別要因 (non-admin / 別保護ルール) なので調査する。

### 6. Tag と tag push

```bash
git tag -a v<NEW_VERSION> -m "v<NEW_VERSION>"
```

🛑 **Gate 3 をここで通すこと** (tag 作成後、push の直前)。「次の `git push` + `gh release create` で npm publish が走ります。**revert するには `next patch` を切る必要あり**。進めてよいですか?」と確認。OK なら:

```bash
git push origin v<NEW_VERSION>
```

annotated tag (`-a`) を使う (lightweight tag は使わない)。Release にメタ情報を残すため。

**Gate 3 以降は Step 10 まで自動で完走する** (ユーザーに都度確認しない)。失敗したら即座に stop して recovery 手順に移る。

### 7. Release notes を抽出

```bash
awk '/^## \[<NEW_VERSION>\]/{flag=1;next} /^## \[/{flag=0} /^\[[^]]+\]:/{flag=0} flag' \
  CHANGELOG.md > /tmp/release-<NEW_VERSION>.md
# 先頭の空行をトリム
sed -i '/./,$!d' /tmp/release-<NEW_VERSION>.md
# 末尾に共通 footer を追加
cat >> /tmp/release-<NEW_VERSION>.md <<EOF

---

**npm**: https://www.npmjs.com/package/xserver-mcp-server/v/<NEW_VERSION>
**Full CHANGELOG**: [CHANGELOG.md](./CHANGELOG.md)
EOF
```

生成した `/tmp/release-<NEW_VERSION>.md` が空でないことを必ず確認する (awk パターンがずれていると空になる)。

### 8. GitHub Release を作成 (release.yml 起動 trigger)

```bash
gh release create v<NEW_VERSION> \
  --title "v<NEW_VERSION>" \
  --notes-file /tmp/release-<NEW_VERSION>.md
```

このコマンドで Release が publish 状態になり、`release.yml` が `release: published` イベントで起動する。

### 9. release.yml の完走を待つ

```bash
RUN_ID=$(gh run list --workflow=release.yml --limit 1 \
  --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

`--exit-status` で失敗時に non-zero exit。通常 20 秒前後で完了する。

### 10. npm 側に存在することを検証

```bash
npm view xserver-mcp-server@<NEW_VERSION>
npm view xserver-mcp-server versions   # 新版が末尾に追加されていること
```

`maintainers` / `.unpackedSize` / `.tarball` が前バージョンと概ね同じ範囲に収まっているかも目視する。

### 11. ユーザーに最終報告

以下を 1 メッセージにまとめてユーザーに渡す:

- GitHub Release URL: `https://github.com/Mink16/xserver-mcp/releases/tag/v<NEW>`
- npm URL: `https://www.npmjs.com/package/xserver-mcp-server/v/<NEW>`
- 今 publish された versions 一覧
- `/tmp/release-<NEW>.md` を削除する

```bash
rm -f /tmp/release-<NEW_VERSION>.md
```

## Troubleshooting / recovery

### Preflight で CI が red

release.yml の試行は無意味。ユーザーに CI を直してもらってから再試行。

### 最新 CI は green だが手元の full gate で落ちる

Node バージョン差・ファイル未コミット・ロック差異のいずれか。差分を特定してから release。

### main が origin/main に対して behind

`git pull --rebase origin main` → preflight を最初からやり直す。自分の commit を上書きしない。

### push が admin bypass で通らない

`enforce_admins: true` に変わっている可能性。feature ブランチ + PR 経由に切り替えて、`gh pr merge --admin --squash` や `gh pr merge --merge` で merge してから release を続行。

### Tag を誤って切った

```bash
git tag -d v<WRONG>
git push --delete origin v<WRONG>
```

その後やり直し。ただし `gh release` 作成済みなら `gh release delete v<WRONG>` も先に走らせる。

### release.yml が失敗した (OIDC auth error)

ほぼ確実に npm 側 trusted publisher の設定ズレ。確認:

- Repository: `Mink16/xserver-mcp`
- Workflow filename: `release.yml` (exactly)
- Environment: 空 (未設定)
  解決後、`gh workflow run release.yml -f ref=v<NEW>` で再実行。

### release.yml が失敗した (test fail on Node 25 etc.)

Node 24 ローカルで通っても Node 25 で落ちた → プラットフォーム差異。locally を再現 (`nvm install 25 && nvm use 25 && npm test`) → fix → 次の patch バージョンで再リリース。**同じ version を再 publish できない** (npm は同一 version の再 publish 禁止)。

### Release は作ったが npm に存在しない

release.yml が起動していない可能性。`gh workflow run release.yml -f ref=v<NEW>` で手動起動。それでもダメなら GitHub Actions の Secrets / Environments を疑う。

### 既に publish されているバージョンを踏みそう

Preflight 5 で検出されるはずだが、漏れた場合:

- `npm unpublish` は 72 時間以内かつ依存されていないときのみ可
- 原則として**次の patch version に進めて再リリース**する (`unpublish` は gap を残し、dependents を壊す)

## Why this skill exists

リリースは「`npm publish` を打つだけ」ではなく、**コミット履歴 / タグ / GitHub Release / npm / provenance 署名 / CHANGELOG / comparison link の整合性**を同時に満たす必要がある。1 個でも食い違うとエコシステム (npm 上の dependents / GitHub の release 一覧 / provenance 検証) が壊れる。このスキルは「抜けてはいけない step」と「起きがちな落とし穴」を 1 つの手順に圧縮して、ヒューマンエラーを構造的に排除する。
