#!/usr/bin/env bash
# xserver-mcp .claude/hooks/completion-gate.sh
# Stop + SubagentStop(tdd-developer|implementer|test-writer): src/ tests/ に変更が
# あれば npm run typecheck && npm test を走らせ、fail なら decision:block (Phase 3)
#
# 制約:
# - stop_hook_active=true の場合はスキップ (無限ループ防止)
# - 30 秒以内の再実行はキャッシュでスキップ (同じ Stop のブレや連続 Stop でのコスト回避)
# - XSERVER_MCP_SKIP_GATE=1 で bypass (CI / 非対話 debug 用)
# - 変更対象が src/ tests/ にない場合はスキップ (read-only 探索の Stop では走らない)

set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

input="$(cat 2>/dev/null || true)"
[ -z "$input" ] && exit 0

stop_hook_active="$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")"
if [ "$stop_hook_active" = "true" ]; then
  exit 0
fi

if [ "${XSERVER_MCP_SKIP_GATE:-}" = "1" ]; then
  exit 0
fi

project_dir="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$project_dir" ] || [ ! -d "$project_dir" ]; then
  exit 0
fi

cd "$project_dir" 2>/dev/null || exit 0

changed="$(git status --porcelain -- src/ tests/ 2>/dev/null)"
if [ -z "$changed" ]; then
  exit 0
fi

stamp_dir="${project_dir}/.claude/.hints"
stamp="${stamp_dir}/gate-last.stamp"
mkdir -p "$stamp_dir" 2>/dev/null || true

if [ -f "$stamp" ]; then
  now="$(date +%s)"
  mtime="$(stat -c %Y "$stamp" 2>/dev/null || echo 0)"
  age=$((now - mtime))
  if [ "$age" -lt 30 ]; then
    exit 0
  fi
fi

tmpout="$(mktemp -t xserver-mcp-gate.XXXXXX)"
trap 'rm -f "$tmpout"' EXIT

{
  echo "=== npm run typecheck ==="
  npm run typecheck 2>&1
  tc_exit=$?
  echo "=== npm test ==="
  npm test 2>&1
  test_exit=$?
  echo "---"
  echo "typecheck_exit=$tc_exit test_exit=$test_exit"
} > "$tmpout" 2>&1

if ! grep -qE '^typecheck_exit=0 test_exit=0' "$tmpout"; then
  tail_output="$(tail -40 "$tmpout")"
  reason=$(printf '完了ゲート (%s) が fail: src/ tests/ に変更があるため npm run typecheck && npm test を実行したが落ちた。直前の実装を修正してから Stop してください。直近の出力末尾:\n\n```\n%s\n```\n\nテストが仕様バグなら test-writer に差し戻し、実装バグなら implementer / tdd-developer で修正。緊急 bypass は env XSERVER_MCP_SKIP_GATE=1。' \
    "completion-gate.sh" "$tail_output")
  jq -n --arg r "$reason" '{
    decision: "block",
    reason: $r
  }'
  exit 0
fi

touch "$stamp" 2>/dev/null || true

exit 0
