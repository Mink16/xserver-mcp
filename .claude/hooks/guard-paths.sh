#!/usr/bin/env bash
# xserver-mcp .claude/hooks/guard-paths.sh
# PreToolUse(Write|Edit|MultiEdit): 保護ファイルへの書き込みを deny する (Phase 1)

set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

input="$(cat 2>/dev/null || true)"
[ -z "$input" ] && exit 0

file_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"
[ -z "$file_path" ] && exit 0

deny() {
  local reason="$1"
  jq -n --arg r "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

project_dir="${CLAUDE_PROJECT_DIR:-}"
rel_path="$file_path"
if [ -n "$project_dir" ] && [[ "$file_path" == "$project_dir"/* ]]; then
  rel_path="${file_path#"$project_dir"/}"
fi

case "$rel_path" in
  .env.example|.env.sample|.env.template)
    ;;
  .env|.env.*)
    deny ".env 系ファイルへの書き込みを hook で遮断しました (CLAUDE.md「触ってはいけないもの」)。実 credentials は .env.example に書かず、~/.claude/settings.local.json の env もしくは実行環境の環境変数で渡してください。"
    ;;
  docs/xserver-openapi.json)
    deny "docs/xserver-openapi.json への書き込みを hook で遮断しました。XServer 公式 API 仕様 (©XServer Inc.) のコピーは再配布許諾が無く .gitignore 済で改変しない方針です (CLAUDE.md)。"
    ;;
  build|build/*)
    deny "build/** への書き込みを hook で遮断しました。build/ は tsc の生成物です。src/ を編集してから npm run build で再生成してください。"
    ;;
esac

exit 0
