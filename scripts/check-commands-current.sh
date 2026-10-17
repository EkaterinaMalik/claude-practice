#!/usr/bin/env bash
# Fails if anything in .claude/commands/ or .claude/skills/ teaches an API this
# repo no longer has.
#
# Why this exists: those files contain code, so they rot like code, but nothing
# compiles them. All five went stale through the Raw/wrapper refactor and taught
# a cleanup pattern that cannot detect a failed cleanup. The reminder hook did
# not catch it, because a reminder is only as good as the reader. This is a
# check, so CI catches it.
#
# Add a row whenever you remove or rename something the commands quote.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

# Both hold prose that teaches code. The skill is symlinked into ~/.claude/skills/
# so it loads in every project, but it lives here so it is versioned and checked.
dirs=""
for d in .claude/commands .claude/skills; do
  [ -d "$d" ] && dirs="$dirs $d"
done
[ -n "$dirs" ] || { echo "nothing to check"; exit 0; }

fail=0

# pattern <TAB> why it is wrong
banned=$(cat <<'ROWS'
const \{ status	the API classes return typed payloads, not result objects — a wrapper asserts its own status
\bz\.object\(	schemas are z.strictObject — z.object strips unknown keys and passes
\.catch\(\(error\)	a Raw method never throws on a non-2xx, so .catch cannot detect a failed cleanup — use cleanup()
\.catch\(\(\) =>	same — a swallowed cleanup failure looks identical to a healthy run
createAuthContext\(playwright\)	createAuthContext() takes no arguments since #9
\brequest\.(get|post|put|delete)\(	specs go through the API layer — use a Raw method for the untouched response
ROWS
)

# Only the fenced code blocks are checked. Prose that explains why NOT to use a
# pattern has to be able to name it — the z.strictObject section does exactly that.
code_lines() {
  # shellcheck disable=SC2086
  find $dirs -name '*.md' -type f 2>/dev/null | sort | while IFS= read -r f; do
    awk -v f="$f" '
      /^```/ { inblock = !inblock; next }
      inblock { print f ":" NR ":" $0 }
    ' "$f"
  done
}

blocks=$(code_lines)

while IFS=$'\t' read -r pattern reason; do
  [ -z "$pattern" ] && continue
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    echo "  $hit"
    echo "      ^ $reason"
    fail=1
  done < <(printf '%s\n' "$blocks" | grep -E "$pattern")
done <<< "$banned"

# Every xxxApi.method( named in a command must exist in support/api/.
real=$(grep -ho "async [a-zA-Z]*" support/api/*.ts | sed 's/async //' | grep -v '^function$' | sort -u)
while IFS= read -r m; do
  [ -z "$m" ] && continue
  grep -qx "$m" <<< "$real" || { echo "  no such method '$m' in support/api/"; fail=1; }
done < <(printf '%s\n' "$blocks" | grep -ohE "\.(get|create|update|delete|follow|unfollow|favorite|unfavorite|list|register|login)[a-zA-Z]*(Raw)?\(" | tr -d '.(' | sort -u)

if [ "$fail" = 1 ]; then
  echo
  echo "A file under .claude/ describes code that no longer exists."
  echo "Those files generate tests. Stale ones generate tests that do not compile,"
  echo "or worse, compile and teach a bug. Fix them in the change that moved the code."
  exit 1
fi

echo "✓$dirs match the current API"
