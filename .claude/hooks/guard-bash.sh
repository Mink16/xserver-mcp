#!/usr/bin/env bash
# xserver-mcp .claude/hooks/guard-bash.sh
# PreToolUse(Bash): 破壊的コマンドを deny する (Phase 1)
# 詳細: /home/mink/.claude/plans/https-code-claude-com-docs-en-hooks-hook-ticklish-russell.md

set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

input="$(cat 2>/dev/null || true)"
[ -z "$input" ] && exit 0

command="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
[ -z "$command" ] && exit 0

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

cmd=" $(printf '%s' "$command" | tr -s ' \t\n' ' ') "

re_rm_root='[[:space:]]rm[[:space:]]+-[rRfF]+[[:space:]]+/([[:space:]]|$)'
re_rm_home='[[:space:]]rm[[:space:]]+-[rRfF]+[[:space:]]+~/?([[:space:]]|$)'
re_rm_glob='[[:space:]]rm[[:space:]]+-[rRfF]+[[:space:]]+/\*'
if [[ $cmd =~ $re_rm_root ]] || [[ $cmd =~ $re_rm_home ]] || [[ $cmd =~ $re_rm_glob ]]; then
  deny "破壊的コマンド (rm -rf /・rm -rf ~・rm -rf /*) を hook で遮断しました。root / home 直下の再帰削除は禁止です。node_modules や build など限定パスを明示してください。"
fi

re_git_push='[[:space:]]git[[:space:]]+push([[:space:]]|$)'
re_force='(--force([[:space:]]|$)|[[:space:]]-f([[:space:]]|$))'
re_force_lease='--force-with-lease'
if [[ $cmd =~ $re_git_push ]] && [[ $cmd =~ $re_force ]] && ! [[ $cmd =~ $re_force_lease ]]; then
  deny "git push --force / -f を hook で遮断しました (.claude/rules/github-flow.md)。誤コミットは revert コミットで戻してください。--force-with-lease は自分専用ブランチに限り許可されます。"
fi

re_reset_hard='[[:space:]]git[[:space:]]+reset[[:space:]].*--hard'
if [[ $cmd =~ $re_reset_hard ]]; then
  deny "git reset --hard を hook で遮断しました (.claude/rules/github-flow.md)。未 push の変更を巻き戻す操作は本人の明示的指示がない限り禁止です。"
fi

re_clean_fd='[[:space:]]git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*(fd|df)'
if [[ $cmd =~ $re_clean_fd ]]; then
  deny "git clean -fd を hook で遮断しました。未コミットの作業ツリー変更を物理削除する恐れがあります。個別に git restore / rm で対処してください。"
fi

re_npm_publish='[[:space:]]npm[[:space:]]+publish([[:space:]]|$)'
if [[ $cmd =~ $re_npm_publish ]]; then
  deny "npm publish を hook で遮断しました。本プロジェクトは .github/workflows/release.yml 経由の OIDC provenance publish のみで公開します (release skill + CLAUDE.md)。"
fi

exit 0
