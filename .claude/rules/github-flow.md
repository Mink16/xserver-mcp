---
name: GitHub Flow
description: xserver-mcp のブランチ戦略・マージ手順・禁止事項。GitHub Flow (main + 短命 feature ブランチ) をベースにする
---

# GitHub Flow 運用ルール

## 原則

- **main は常にデプロイ可能な状態を保つ**。`npm run typecheck && npm test && npm run build` が通らない状態で main に入れない。
- **main への直接 push / 直接コミット禁止**。必ず feature ブランチ → PR 経由でマージする。
- **feature ブランチは短命** (目安 1〜3 日)。長期化する場合は task を分割するか、`main` を定期的に rebase/merge して差分を小さく保つ。

## ブランチ命名

`<type>/<短い要約>` または `<type>/<issue番号>-<要約>` の形式。type は Conventional Commits と揃える (`commit-messages.md` 参照)。

| type        | 用途                          | 例                             |
| ----------- | ----------------------------- | ------------------------------ |
| `feat/`     | 新ツール追加・新機能          | `feat/dns-bulk-update`         |
| `fix/`      | バグ修正                      | `fix/idn-normalize-regression` |
| `refactor/` | 挙動を変えない内部改善        | `refactor/error-normalize`     |
| `docs/`     | README / CLAUDE.md / rules 等 | `docs/update-error-table`      |
| `test/`     | テスト追加・修正のみ          | `test/mail-account-edge-cases` |
| `chore/`    | 依存更新・設定・ツール        | `chore/bump-vitest`            |
| `hotfix/`   | 本番影響の緊急修正            | `hotfix/auth-header-missing`   |

ブランチ名にスペース・日本語・大文字は使わない (kebab-case 固定)。

## ワークフロー

1. `git switch main && git pull --ff-only`
2. `git switch -c feat/xxx`
3. TDD サイクル (RED → GREEN → REFACTOR) でコミット。**1 コミット = 1 論理単位**。
4. ローカルで `npm run typecheck && npm test && npm run build` を全部グリーンにする。
5. `git push -u origin feat/xxx`
6. `gh pr create` で PR を作成 (`pull-requests.md` の手順に従う)。
7. レビュー・CI 通過後にマージ。マージ後はローカル/リモート両方のブランチを削除。

```bash
# マージ後の後片付け
git switch main && git pull --ff-only
git branch -d feat/xxx        # ローカル削除
git push origin --delete feat/xxx  # リモート削除 (GitHub 側で自動削除設定なら不要)
```

## マージ戦略

- **通常の PR**: Merge commit (`--no-ff`) を推奨。TDD の RED/GREEN/REFACTOR の履歴を残し、PR 単位が `git log --merges` で追える。
- **雑多な WIP コミットしかない PR**: Squash merge も可。ただし PR タイトルが Conventional Commits 形式になっていることを確認する。
- **Rebase merge**: 履歴を完全に直線化したい場合のみ。強制 push が必要になるので他者と共有中のブランチでは使わない。
- 同一 PR 内で戦略を混在させない。PR 作成時にどれを使うか決める。

## 禁止事項

- `main` への `git push --force` / `--force-with-lease` は**全面禁止**。誤ってコミットを進めてしまった場合は新しい revert コミットで戻す。
- feature ブランチでも他者と共有している場合は `--force` 禁止。自分専用のブランチに限り `--force-with-lease` のみ許可 (`--force` 単体は使わない)。
- `git reset --hard origin/main` など、未 push の変更を巻き戻す操作は本人の明示的指示がない限り実行しない。
- プレコミットフックを `--no-verify` でスキップしない。フックが失敗したら根本原因を直す。
- `git commit --amend` で**公開済みコミット**を書き換えない (force push が必要になるため)。ローカル未 push のコミットのみ可。

## hotfix の扱い

本番影響の緊急修正は `hotfix/xxx` ブランチで作り、通常 PR と同じレビュー経路を通す。Git Flow の「main と develop 両方にマージ」ルールは**採用しない** (本プロジェクトは develop ブランチを持たない GitHub Flow のため)。
