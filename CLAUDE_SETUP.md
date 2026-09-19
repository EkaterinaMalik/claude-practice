# How Claude is set up in this project

A map of every file that changes how Claude behaves here. Written 2026-09-19.

There are four kinds. Two live in this repo. Two live outside it.

| # | What | Where | When it applies |
|---|------|-------|-----------------|
| 1 | Project rules | `CLAUDE.md` (this repo) | Every session, automatically |
| 2 | Slash commands | `.claude/commands/` (this repo) | Only when you type them |
| 3 | Hook | `.claude/hooks/` (**outside** this repo) | Runs by itself after a source file changes |
| 4 | Memory | `~/.claude/projects/.../memory/` (**outside** this repo) | Loaded at the start of a session |

Items 3 and 4 are not in this repo. If you clone this repo on another machine, you get items 1
and 2 only. That is worth knowing before you wonder why the hook is silent there.

**Where this file sits:** `CLAUDE_SETUP.md` is not in the table because it changes nothing. It is a
map of the four items above. Deleting it would not alter how Claude behaves. Deleting any of the
four would.

**Three more repo files worth knowing**, none of which is a rule either:

- `PROJECT_FILES.md` — a map of every file in the project and what it is for. Start there if you
  are not sure which file to open.
- `TEST_RECOMMENDATIONS.md` — the test coverage backlog. `CLAUDE.md` points at it, the hook in
  item 3 guards it, and `/api-test-audit` rewrites it.
- `.github/workflows/` — GitHub Actions. This runs your tests on GitHub after a push. It is not
  connected to Claude at all; it would run exactly the same if Claude were never used here.

---

## 1. Project rules — `CLAUDE.md`

The main one. Claude reads it at the start of every session, without being asked.

It holds:

- **Commands** — how to run the suite, the Allure report, the Docker test run
- **Architecture** — the two-layer model, constraints found in the live API, the auth pattern
- **Testing rules** — test independence, TypeScript interfaces, `test.fail()` for known server
  bugs, response time thresholds, `test.step` for multi-phase tests
- **Coverage backlog** — a pointer to `TEST_RECOMMENDATIONS.md`

This is the file to edit when you want to change how Claude writes tests here.

## 2. Slash commands — `.claude/commands/`

Five commands. They only run when you type them.

| Command | What it does |
|---------|--------------|
| `/api-test-audit` | Reviews the suite against the "8 API Testing Mistakes" list, then writes `TEST_RECOMMENDATIONS.md` |
| `/api-add-auth-tests <endpoint>` | Adds auth edge case tests for one endpoint |
| `/api-add-validation-tests <endpoint>` | Adds 422 validation tests for every required field |
| `/api-add-schema-tests <TypeName>` | Adds Zod runtime schema checks for a response type |
| `/api-e2e-flow` | Builds one end-to-end journey test |

Note: `/api-test-audit` **overwrites** `TEST_RECOMMENDATIONS.md`. Run it when you want the file
rebuilt from scratch, not when you want a small edit.

## 3. Hook — `check-docs-current.sh`

Full path: `/home/kateryna/Projects/Claude_project/.claude/hooks/check-docs-current.sh`
Wired up in: `/home/kateryna/Projects/Claude_project/.claude/settings.local.json`

It is a `PostToolUse` hook. It runs after Claude uses Write, Edit, or Bash.

What it does: if a source file was **changed**, it names the doc that describes that file, and the
section to look at. Nothing more. It never edits a file and never blocks anything.

It covers six pairs:

| Changed file | Doc it names |
|---|---|
| `tests/*.spec.ts` | `TEST_RECOMMENDATIONS.md` |
| `support/api/*`, `helpers.ts`, `types.ts`, `schemas.ts` | `CLAUDE.md` — Architecture |
| `package.json`, `playwright.config.ts` | `CLAUDE.md` — Commands, Reporting |
| `docker-compose.yml`, `docker/` | `CLAUDE.md` — Allure viewer, container run |
| `.github/workflows/` | `CI_SETUP.md` |
| `.claude/commands/`, `.claude/hooks/` | `CLAUDE_SETUP.md` — this file |

It stays silent on reads (`cat`, `grep`) and on test runs. So if it fires, a file really changed.

**Why it exists:** docs here went stale twice. `TEST_RECOMMENDATIONS.md` listed four kinds of
tests as missing months after they were written and passing. `CLAUDE.md` said the API-class
migration had barely started when it was finished. Both times the stale file claimed work was
outstanding that was already done — so the work nearly got done twice.

**The rule matters more than the hook.** The written version lives in `CLAUDE.md`, section
"Keeping docs current", and it travels with a clone. This hook does not — see the note at the top
of this file. If the hook disappears, follow the rule anyway.

**One known limit:** for a Bash command it reads only the first line. A long heredoc that *writes
about* file paths used to set it off by mistake. Writing a doc is not the same as changing code.

## 4. Memory — six files

Stored in `~/.claude/projects/-home-kateryna-Projects-Claude-project/memory/`.
`MEMORY.md` in that folder is the index. Claude reads the index at the start of a session.

| File | Holds |
|------|-------|
| `user-kateryna.md` | Your role and working style |
| `feedback-plain-english.md` | Write in short, simple sentences |
| `feedback-no-trailing-summary.md` | No "here is what changed" summaries at the end |
| `project-conduit-api-tests.md` | State of this project: architecture, coverage, server quirks |
| `project-docker-test-run-deferred.md` | The containerized test run (`npm run test:docker`) |
| `hook-test-recommendations-staleness.md` | Why the hook above exists |

Memory is personal to you and this machine. It is not shared and not in git.

---

## Which file should I edit?

| You want to... | Edit this |
|----------------|-----------|
| Change how Claude writes tests | `CLAUDE.md` |
| Change which doc covers which file | `CLAUDE.md` — "Keeping docs current", and the hook |
| Change what a slash command does | the file in `.claude/commands/` |
| Change when the reminder fires | `.claude/hooks/check-docs-current.sh` |
| Change how Claude talks to you | ask Claude to save it to memory |
| Change what to test next | `TEST_RECOMMENDATIONS.md`, or run `/api-test-audit` to rebuild it |
| Fix this map | `CLAUDE_SETUP.md` — the file you are reading |

## A warning about this file

This file is a description of other files. That means it can go out of date, exactly the way
`TEST_RECOMMENDATIONS.md` did. Nothing checks it automatically.

If you add a slash command, change the hook, or move a file, update the tables above. If you are
not sure it is still true, trust the real files over this one.
