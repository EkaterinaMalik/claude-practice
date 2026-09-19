# How Claude is set up in this project

A map of every file that changes how Claude behaves here. Written 2026-09-19.

There are four kinds. Two live in this repo. Two live outside it.

| # | What | Where | When it applies |
|---|------|-------|-----------------|
| 1 | Project rules | `CLAUDE.md` (this repo) | Every session, automatically |
| 2 | Slash commands | `.claude/commands/` (this repo) | Only when you type them |
| 3 | Hook | `.claude/hooks/` (**outside** this repo) | Runs by itself after a spec file changes |
| 4 | Memory | `~/.claude/projects/.../memory/` (**outside** this repo) | Loaded at the start of a session |

Items 3 and 4 are not in this repo. If you clone this repo on another machine, you get items 1
and 2 only. That is worth knowing before you wonder why the hook is silent there.

**Where this file sits:** `CLAUDE_SETUP.md` is not in the table because it changes nothing. It is a
map of the four items above. Deleting it would not alter how Claude behaves. Deleting any of the
four would.

**Two more repo files worth knowing**, neither of which is a rule either:

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

## 3. Hook — `check-test-recommendations.sh`

Full path: `/home/kateryna/Projects/Claude_project/.claude/hooks/check-test-recommendations.sh`
Wired up in: `/home/kateryna/Projects/Claude_project/.claude/settings.local.json`

It is a `PostToolUse` hook. It runs after Claude uses Write, Edit, or Bash.

What it does: if a `tests/*.spec.ts` file was **changed**, it tells Claude to re-check
`TEST_RECOMMENDATIONS.md`. Nothing more. It never edits a file.

It stays silent on reads (`cat`, `grep`) and on test runs. So if it fires, a spec really changed.

**Why it exists:** `TEST_RECOMMENDATIONS.md` had gone badly out of date. It listed four kinds of
tests as missing months after they were written and passing. The hook is a reminder so that does
not happen again.

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
| Change what a slash command does | the file in `.claude/commands/` |
| Change when the reminder fires | `.claude/hooks/check-test-recommendations.sh` |
| Change how Claude talks to you | ask Claude to save it to memory |
| Change what to test next | `TEST_RECOMMENDATIONS.md`, or run `/api-test-audit` to rebuild it |
| Fix this map | `CLAUDE_SETUP.md` — the file you are reading |

## A warning about this file

This file is a description of other files. That means it can go out of date, exactly the way
`TEST_RECOMMENDATIONS.md` did. Nothing checks it automatically.

If you add a slash command, change the hook, or move a file, update the tables above. If you are
not sure it is still true, trust the real files over this one.
