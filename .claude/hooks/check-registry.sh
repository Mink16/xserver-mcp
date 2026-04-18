#!/usr/bin/env bash
# xserver-mcp .claude/hooks/check-registry.sh
# PostToolUse(Write|Edit|MultiEdit): src/tools/<domain>/index.ts を追加/編集したのに
# src/tools/registry.ts に対応 import が無ければ block (Phase 2)

set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

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

re_index='^src/tools/([^/]+)/index\.ts$'
if ! [[ $rel_path =~ $re_index ]]; then
  exit 0
fi

domain="${BASH_REMATCH[1]}"
registry="${project_dir}/src/tools/registry.ts"

if [ ! -f "$registry" ]; then
  exit 0
fi

expected_import="from \"./${domain}/index.js\""

if grep -F -q "$expected_import" "$registry"; then
  exit 0
fi

reason="\`src/tools/${domain}/index.ts\` を編集しましたが \`src/tools/registry.ts\` に対応する import 行 (\`${expected_import}\`) が見つかりません。CLAUDE.md と .claude/rules/tdd-workflow.md に従い、新 toolset を追加する場合は \`toolsetNames\` 配列と \`builders\` レコード両方を更新してください (既存 toolset の index.ts 編集ならパス命名 (\`./${domain}/index.js\`) を registry.ts 側と揃えてください)。"

jq -n --arg r "$reason" '{
  decision: "block",
  reason: $r
}'

exit 0
