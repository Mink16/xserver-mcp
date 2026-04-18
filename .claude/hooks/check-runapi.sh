#!/usr/bin/env bash
# xserver-mcp .claude/hooks/check-runapi.sh
# PostToolUse(Write|Edit|MultiEdit): src/tools/**/*.ts 内で client.request() が
# try/catch に直接囲まれている可能性を heuristic で検知、stderr 警告のみ (Phase 2)
# block はしない (exit 0 固定)。誤検知のリスクがあるため reviewer agent に最終判断を委ねる。

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

case "$rel_path" in
  src/tools/*.ts) ;;
  src/tools/*/*.ts) ;;
  *) exit 0 ;;
esac

base="${rel_path##*/}"
case "$base" in
  index.ts|types.ts|helpers.ts|registry.ts|domain.ts) exit 0 ;;
esac

[ -f "$file_path" ] || exit 0

window=5
awk -v w="$window" '
  { lines[NR]=$0 }
  /client\.request[[:space:]]*\(/ { hits[NR]=1 }
  END {
    for (h in hits) {
      lo = h - w; if (lo < 1) lo = 1
      hi = h + w; if (hi > NR) hi = NR
      for (i = lo; i <= hi; i++) {
        if (lines[i] ~ /[[:space:]]try[[:space:]]*\{/ || lines[i] ~ /[[:space:]]catch[[:space:]]*\(/ || lines[i] ~ /^try[[:space:]]*\{/ || lines[i] ~ /^catch[[:space:]]*\(/) {
          print h
          break
        }
      }
    }
  }
' "$file_path" | sort -nu | while read -r line_no; do
  printf '[runApi-check] %s:%s 付近で client.request() が try/catch で囲まれている可能性があります。CLAUDE.md に従い、エラー正規化は `runApi(() => client.request(...))` 経由にしてください。このチェックは heuristic のため誤検知なら無視可。\n' "$rel_path" "$line_no" >&2
done

exit 0
