#!/usr/bin/env bash
# xserver-mcp .claude/hooks/guard-main-branch.sh
# PreToolUse(Write|Edit|MultiEdit): main ブランチ上で src/ / tests/ の直接編集を deny (Phase 3)
#
# - .claude/rules/github-flow.md「main への直接コミット禁止」を機械的に担保する
# - package.json / tsconfig.json / CHANGELOG.md / docs / .claude は対象外 (release skill と
#   運用整備の直接編集を阻害しないため)
# - XSERVER_MCP_ALLOW_MAIN_EDIT=1 で一時 bypass

set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

if [ "${XSERVER_MCP_ALLOW_MAIN_EDIT:-}" = "1" ]; then
  exit 0
fi

input="$(cat 2>/dev/null || true)"
[ -z "$input" ] && exit 0

file_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"
[ -z "$file_path" ] && exit 0

project_dir="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$project_dir" ]; then
  exit 0
fi

rel_path="${file_path#"$project_dir"/}"
if [ "$rel_path" = "$file_path" ]; then
  exit 0
fi

case "$rel_path" in
  src/*|tests/*) ;;
  *) exit 0 ;;
esac

current_branch="$(cd "$project_dir" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
if [ "$current_branch" != "main" ]; then
  exit 0
fi

reason=$(printf '%s への書き込みを hook で遮断しました。現在 main ブランチ直で src/ / tests/ の編集は .claude/rules/github-flow.md により禁止 (main は常にデプロイ可能状態を保つ)。feature branch を切ってから編集してください:\n\n    git switch -c feat/<summary>   # または chore/<summary> 等\n\n緊急 hotfix などで main 直編集が必要な場合は env XSERVER_MCP_ALLOW_MAIN_EDIT=1 で bypass 可。package.json / tsconfig.json / CHANGELOG.md / docs / .claude 配下は本 guard の対象外 (release skill 動作を阻害しないため)。' "$rel_path")

jq -n --arg r "$reason" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: $r
  }
}'

exit 0
