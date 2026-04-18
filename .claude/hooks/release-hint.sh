#!/usr/bin/env bash
# xserver-mcp .claude/hooks/release-hint.sh
# UserPromptSubmit: リリース系キーワード検知で release skill 起動を案内 (Phase 2)
# session_id 単位の flag file で 1 セッション 1 回に抑制。flag は .claude/.hints/ に保管。

set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

input="$(cat 2>/dev/null || true)"
[ -z "$input" ] && exit 0

prompt="$(printf '%s' "$input" | jq -r '.prompt // empty' 2>/dev/null || true)"
session_id="$(printf '%s' "$input" | jq -r '.session_id // "unknown"' 2>/dev/null || echo "unknown")"
[ -z "$prompt" ] && exit 0

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
hints_dir="${project_dir}/.claude/.hints"
flag_file="${hints_dir}/release-${session_id}.flag"

re_ja='リリース|バージョン|バージョンアップ|タグ切|タグを切|npm 公開|npm公開|npm に公開'
re_en='\brelease\b|cut[[:space:]]+(a[[:space:]]+|the[[:space:]]+)?release|\bpublish\b|bump[[:space:]]+(the[[:space:]]+)?version|version[[:space:]]+bump'

if ! { [[ $prompt =~ $re_ja ]] || [[ $prompt =~ $re_en ]]; }; then
  exit 0
fi

if [ -f "$flag_file" ]; then
  exit 0
fi

mkdir -p "$hints_dir" 2>/dev/null || exit 0

find "$hints_dir" -maxdepth 1 -type f -name 'release-*.flag' -mtime +30 -delete 2>/dev/null || true

: > "$flag_file" 2>/dev/null || true

context=$(cat <<'EOF'
**release-hint hook によるガイド (1 セッション 1 回のみ)**

リリース関連のキーワードを検知しました。本リポジトリのリリースは `release` skill が以下を一気通貫で実行します:

1. SemVer bump (0.x 期: breaking→minor / その他→patch)
2. `CHANGELOG.md [Unreleased]` の新バージョンへの promote
3. 完了ゲート (`npm run typecheck && npm test && npm run build`)
4. commit + annotated tag + push
5. GitHub Release 作成 (これが `release.yml` の OIDC provenance npm publish をトリガー)
6. `npm view` で registry 反映を検証

起動:
- 自然言語: 「リリースして」「v0.1.2 を出して」「patch 出して」等
- 明示: `/release [patch|minor|major|vX.Y.Z]`

先に `.claude/skills/release/SKILL.md` を読んでから着手してください。user approval gate が 3 箇所あります (bump 版 / tag push 前 / publish 確認)。
EOF
)

jq -n --arg ctx "$context" '{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: $ctx
  }
}'

exit 0
