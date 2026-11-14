#!/usr/bin/env bash
# Claude Code PostToolUse hook: after an Edit/Write on a .ts/.tsx file, type-check the
# project and lint the changed file. Exit 2 sends the errors back to the agent.
# Anything unexpected exits 0 so the hook can never wedge a session.
input="$(cat 2>/dev/null || true)"
file="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j.tool_input?.file_path||"")}catch{}})' 2>/dev/null || true)"
case "$file" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac
root="$(cd "$(dirname "$file")" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -d "$root/node_modules" ] || exit 0
cd "$root" || exit 0
out="$(npx --no-install tsc --noEmit -p tsconfig.json 2>&1)"; tsc_rc=$?
lint="$(npx --no-install eslint "$file" 2>&1)"; lint_rc=$?
if [ $tsc_rc -ne 0 ] || [ $lint_rc -ne 0 ]; then
  { [ $tsc_rc -ne 0 ] && printf 'tsc:\n%s\n' "$(printf '%s' "$out" | head -40)";
    [ $lint_rc -ne 0 ] && printf 'eslint:\n%s\n' "$(printf '%s' "$lint" | head -40)"; } >&2
  exit 2
fi
exit 0
