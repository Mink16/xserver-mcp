#!/usr/bin/env bash
# xserver-mcp .claude/hooks/format-changed.sh
# PostToolUse(Write|Edit|MultiEdit): 編集直後に prettier --write を当てる (Phase 1)
# settings.json で async:true 指定。失敗しても exit 0 で non-blocking。

set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

input="$(cat 2>/dev/null || true)"
[ -z "$input" ] && exit 0

file_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"
[ -z "$file_path" ] && exit 0

case "$file_path" in
  *.ts|*.tsx|*.js|*.mjs|*.cjs|*.json|*.jsonc|*.md|*.mdx|*.yml|*.yaml|*.css) ;;
  *) exit 0 ;;
esac

project_dir="${CLAUDE_PROJECT_DIR:-}"
if [ -n "$project_dir" ] && [[ "$file_path" != "$project_dir"/* ]]; then
  exit 0
fi

[ -f "$file_path" ] || exit 0

if [ -n "$project_dir" ]; then
  cd "$project_dir" 2>/dev/null || exit 0
fi

npx --no-install prettier --write --log-level silent "$file_path" >/dev/null 2>&1 || true

exit 0
