#!/usr/bin/env bash
# xserver-mcp .claude/hooks/check-tdd-pair.sh
# PostToolUse(Write|Edit|MultiEdit): 新規ツール実装に対応する RED テストの存在を検証 (Phase 2)
# 対応テストが無ければ decision:block で agent に TDD 逆転を差し戻す

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

re_tool='^src/tools/(mail|dns|server|domainVerification)/([^/]+)\.ts$'
if ! [[ $rel_path =~ $re_tool ]]; then
  exit 0
fi

domain="${BASH_REMATCH[1]}"
name="${BASH_REMATCH[2]}"

case "$name" in
  index|types|helpers|registry) exit 0 ;;
esac

test_rel="tests/tools/${domain}/${name}.test.ts"
test_abs="${project_dir}/${test_rel}"

if [ -f "$test_abs" ]; then
  exit 0
fi

reason="ツール実装 \`${rel_path}\` に対応する RED テスト \`${test_rel}\` が見つかりません。本リポジトリは TDD 必須 (.claude/rules/tdd-workflow.md) — 実装より先に失敗するテストを書いてください。\`test-writer\` subagent か \`tdd-test-scaffold\` skill で 3 種カバー (正常系+入力検証+API エラー) の雛形が生成できます。テストが既にあるのに検出されていない場合はパス命名 (\`${name}.test.ts\`) を確認してください。"

jq -n --arg r "$reason" '{
  decision: "block",
  reason: $r
}'

exit 0
