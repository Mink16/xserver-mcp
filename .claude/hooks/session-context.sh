#!/usr/bin/env bash
# xserver-mcp .claude/hooks/session-context.sh
# SessionStart(startup|resume): branch / [Unreleased] / 直近コミットを additionalContext に注入 (Phase 1)

set -uo pipefail

command -v jq >/dev/null 2>&1 || { echo '{}'; exit 0; }

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$project_dir" 2>/dev/null || { echo '{}'; exit 0; }

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || printf '(git unavailable)')"
recent_commits="$(git log -5 --oneline 2>/dev/null || printf '(git log unavailable)')"

unreleased=""
if [ -f CHANGELOG.md ]; then
  unreleased="$(awk '
    /^## \[Unreleased\]/ { flag=1; next }
    /^## \[/ && flag { flag=0 }
    flag
  ' CHANGELOG.md 2>/dev/null || true)"
fi

if [ -z "$(printf '%s' "$unreleased" | tr -d ' \t\n\r')" ]; then
  unreleased="(CHANGELOG.md の [Unreleased] セクションは空です — 次回リリースに含める項目を PR マージ前に追記してください)"
fi

context=$(printf '**xserver-mcp リポジトリ状況** (session-context.sh hook による自動注入)\n\n- 現在のブランチ: `%s`\n\n**CHANGELOG.md [Unreleased]**:\n\n%s\n\n**直近 5 コミット** (git log -5 --oneline):\n\n```\n%s\n```\n\nリリース作業は `release` skill、TDD は `tdd-developer` / `test-writer` + `implementer` を想起してください。' \
  "$branch" "$unreleased" "$recent_commits")

jq -n --arg ctx "$context" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $ctx
  }
}'

exit 0
