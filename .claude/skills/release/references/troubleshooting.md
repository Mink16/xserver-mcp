# Release troubleshooting

`.claude/skills/release/SKILL.md` の実行中に失敗した時の復旧手順集。

状況に応じて該当節を読み、そこに書かれた手順で復旧する。復旧できないパターン (破損以外) があればユーザーにエスカレーションする。

## 索引

1. [Preflight で CI が red](#preflight-で-ci-が-red)
2. [手元の full gate (Step 3) で落ちる](#手元の-full-gate-step-3-で落ちる)
3. [main が origin/main に対して behind](#main-が-originmain-に対して-behind)
4. [push (Step 5) が admin bypass で通らない](#push-step-5-が-admin-bypass-で通らない)
5. [Tag を誤って切った (Step 6)](#tag-を誤って切った-step-6)
6. [release.yml が OIDC auth error で失敗](#releaseyml-が-oidc-auth-error-で失敗)
7. [release.yml が test fail (Node 25 等)](#releaseyml-が-test-fail-node-25-等)
8. [GitHub Release はあるが npm に存在しない](#github-release-はあるが-npm-に存在しない)
9. [同一 version を再 publish しようとしてしまった](#同一-version-を再-publish-しようとしてしまった)

---

## Preflight で CI が red

release.yml の再試行は無意味 (同じコミットで落ちるだけ)。ユーザーに CI を直してもらってから release skill を再起動する。

## 手元の full gate (Step 3) で落ちる

最新 CI は green なのに local で落ちる場合の差分はほぼ以下 3 つのいずれか:

- **Node バージョン違い**: CI は 24 / 25 をテスト、local が別 major を使っている
- **未コミットファイル**: git status には載っていないが実質 skill 実行前から存在していた local 変更がある
- **`package-lock.json` のロック差異**: `npm install` でロック更新されたが未コミット

`git status --porcelain` と `node --version` を確認してから release を再開。

## main が origin/main に対して behind

```bash
git pull --rebase origin main
```

preflight を最初からやり直す。自分の release commit を上書きしないよう `--rebase` を使う (merge commit を作らない)。

## push (Step 5) が admin bypass で通らない

`enforce_admins: true` に変わっている可能性 (Branch protection の設定変更)。feature ブランチに切って PR 経由で通す:

```bash
git checkout -b release/v<NEW_VERSION>
git push -u origin release/v<NEW_VERSION>
gh pr create --fill --base main
# CI が通るのを待ち、admin merge で main に取り込む
gh pr merge --admin --merge       # or --squash
git checkout main && git pull --ff-only
```

その後 Step 6 (tag 作成 → Gate 3 → tag push) に進む。release 全体はやり直さない (commit は既に main にある)。

## Tag を誤って切った (Step 6)

```bash
git tag -d v<WRONG>
git push --delete origin v<WRONG>
```

既に `gh release create` 済みなら先に:

```bash
gh release delete v<WRONG> --yes
```

その後正しい version で Step 6 からやり直し。

**注意**: tag push + Release 作成後に release.yml が動いて npm publish 済みなら、tag / Release を消しても **npm 側の version は残る** (`unpublish` しない限り)。この場合は [ケース 9](#同一-version-を再-publish-しようとしてしまった) に進み、次の patch で進める。

## release.yml が OIDC auth error で失敗

ほぼ確実に npmjs.com 側 trusted publisher の設定ズレ。以下を確認:

- Repository: `Mink16/xserver-mcp`
- Workflow filename: `release.yml` (完全一致)
- Environment: 空 (未設定)

<https://www.npmjs.com/package/xserver-mcp-server/access> の Trusted Publisher セクションで直せる。修正後、手動再起動:

```bash
gh workflow run release.yml -f ref=v<NEW_VERSION>
```

## release.yml が test fail (Node 25 等)

Node 24 ローカルで通っても 25 で落ちた = プラットフォーム差異 (ESM loader や fs API の挙動差)。local で再現:

```bash
nvm install 25 && nvm use 25
npm ci && npm test
```

fix して**次の patch バージョンで再リリース**する。**同じ version は再 publish できない** (npm 制約)。壊れた tag と Release は削除する (ケース 5 参照)。

## GitHub Release はあるが npm に存在しない

release.yml が起動していない可能性。手動起動:

```bash
gh workflow run release.yml -f ref=v<NEW_VERSION>
```

それでも publish されない場合:

- Repository Settings → Actions → General → Workflow permissions に `id-token: write` が許可されているか
- trusted publisher 側 (ケース 6 と同じ確認)
- GitHub Actions 側のステータス (<https://www.githubstatus.com/>)

のいずれかが原因。

## 同一 version を再 publish しようとしてしまった

Preflight 5 で検出されるはずだが漏れた or 同セッション中に 2 回目の試行をした、などで発生。

- `npm unpublish` は **72 時間以内 & dependents 無しの時のみ可**。ただし gap を残して dependents を壊すので**原則使わない**
- **代わりに next patch で進める** (例: 0.1.2 が衝突したら 0.1.3 を切る)

CHANGELOG を 0.1.3 として書き直し (0.1.2 エントリは残す / または "withdrawn" と注記)、Step 1 からやり直す。
