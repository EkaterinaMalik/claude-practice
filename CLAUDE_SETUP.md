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

### These files rot, and there is now a check for it

They contain real snippets — method calls, signatures, zod schemas, cleanup — and nothing compiles
them. All five went stale through the Raw/wrapper refactor on 2026-10-17 while every spec still
passed. They taught the deleted result-object API, `z.object` instead of `z.strictObject`,
`createAuthContext(playwright)` after the argument was removed, and `.catch()` cleanup — the one
pattern `CLAUDE.md` forbids — presented as good practice with reasoning attached.

A stale command is worse than no command: it generates code that fails `tsc` on the first line, or
compiles and teaches a bug.

```bash
npm run check:commands
```

`scripts/check-commands-current.sh` scans the fenced code blocks for retired patterns and checks
that every `api.method(` named there exists in `support/api/`. CI runs it after `typecheck`. Prose
is not scanned, so the `strictObject` section can still name `z.object` to explain why not to use
it. When you retire a pattern, add a row to the `banned` list in that script.

## 2b. Skill — `.claude/skills/playwright-api-tests/`

The same rules as the commands, written to be portable.

| | Slash command | Skill |
|---|---|---|
| Lives in | `.claude/commands/*.md` | `.claude/skills/playwright-api-tests/` |
| Runs when | you type `/its-name` | Claude reads its `description` and loads it when the task matches |
| Scope | this project — real method names, this server's quirks | any Playwright API suite — the quirks are examples, not law |

```
.claude/skills/playwright-api-tests/
├── SKILL.md              architecture: Raw/wrapper, expectStatus, cleanup, independence
└── references/           auth-tests · validation-tests · schema-tests · e2e-flow · suite-audit
```

`SKILL.md` always loads; a reference is read only when that task comes up.

**Both directories live in the repo and are symlinked into the home directory:**

```
~/.claude/commands                    -> <repo>/.claude/commands
~/.claude/skills/playwright-api-tests -> <repo>/.claude/skills/playwright-api-tests
```

So they load in every project, while git versions them, CI checks them, and a clone brings them
along. Kept only under `~/.claude/` they would be none of those things — and the commands were
literally two byte-identical copies with nothing keeping them in step, where fixing one left the
other wrong and which one won depended on where you launched Claude. Replaced with a link on
2026-10-17.

If you clone this repo elsewhere, recreate both links by hand — they are the one piece that does
not travel:

```bash
ln -s "$PWD/.claude/commands" ~/.claude/commands
ln -s "$PWD/.claude/skills/playwright-api-tests" ~/.claude/skills/playwright-api-tests
```

Both directories are covered by `npm run check:commands`.

## 3. Hook — `check-docs-current.sh`

Full path: `/home/kateryna/Projects/Claude_project/.claude/hooks/check-docs-current.sh`
Wired up in: `/home/kateryna/Projects/Claude_project/.claude/settings.local.json`

It is a `PostToolUse` hook. It runs after Claude uses Write, Edit, or Bash.

What it does: if a source file was **changed**, it names the doc that describes that file, and the
section to look at. Nothing more. It never edits a file and never blocks anything.

It covers seven pairs:

| Changed file | Doc it names |
|---|---|
| `tests/*.spec.ts` | `TEST_RECOMMENDATIONS.md` |
| `support/api/*`, `helpers.ts`, `types.ts`, `schemas.ts` | `CLAUDE.md` — Architecture |
| `package.json`, `playwright.config.ts` | `CLAUDE.md` — Commands, Reporting |
| `docker-compose.yml`, `docker/` | `CLAUDE.md` — Allure viewer, container run |
| `.github/workflows/` | `CI_SETUP.md` |
| `.claude/commands/`, `.claude/hooks/`, `.claude/skills/` | `CLAUDE_SETUP.md` — this file |
| `support/api/*`, `helpers.ts`, `schemas.ts` | `.claude/commands/` + `.claude/skills/` — both quote this code |

It stays silent on reads (`cat`, `grep`) and on test runs. So if it fires, a file really changed.

**Why it exists:** docs here went stale twice. `TEST_RECOMMENDATIONS.md` listed four kinds of
tests as missing months after they were written and passing. `CLAUDE.md` said the API-class
migration had barely started when it was finished. Both times the stale file claimed work was
outstanding that was already done — so the work nearly got done twice.

**The rule matters more than the hook.** The written version lives in `CLAUDE.md`, section
"Keeping docs current", and it travels with a clone. This hook does not — see the note at the top
of this file. If the hook disappears, follow the rule anyway.

**And a check matters more than a rule.** The commands rotted while this hook was already running,
because a reminder is only as good as whoever reads it. `npm run check:commands` fails the build
instead. Where a rule can be made executable, make it executable.

**One known limit:** for a Bash command it reads only the first line. A long heredoc that *writes
about* file paths used to set it off by mistake. Writing a doc is not the same as changing code.

## 4. Memory

Stored in `~/.claude/projects/-home-kateryna-Projects-Claude-project/memory/`, one file per
remembered fact, with `MEMORY.md` as the index. Claude reads the index at the start of a session.

Four kinds, by the `type` in each file's front matter:

| Type | Holds |
|------|-------|
| `user` | Who you are — role, preferences, working style |
| `feedback` | How you want Claude to work: plain English, ask before committing, no trailing summaries |
| `project` | State of ongoing work — this project's architecture, coverage and server quirks live here |
| `reference` | Pointers to external things, and to tooling that took effort to work out |

To see what is actually stored:

```bash
cat ~/.claude/projects/-home-kateryna-Projects-Claude-project/memory/MEMORY.md
```

**Deliberately not listed file by file.** An inventory here goes stale the moment a memory is
added or renamed — it already had, naming a file that has since been renamed. The folder also
holds memories from unrelated work, and this repository is **public**, so its contents should not
be enumerated in a committed file. Read the index instead; it is always current.

Memory is personal to you and this machine. It is not shared and not in git.

---

## Which file should I edit?

| You want to... | Edit this |
|----------------|-----------|
| Change how Claude writes tests | `CLAUDE.md` |
| Change which doc covers which file | `CLAUDE.md` — "Keeping docs current", and the hook |
| Change what a slash command does | the file in `.claude/commands/` |
| Change the rules Claude applies on **other** projects | `.claude/skills/playwright-api-tests/` |
| Stop a retired pattern coming back | add a row to `scripts/check-commands-current.sh` |
| Change when the reminder fires | `.claude/hooks/check-docs-current.sh` |
| Change how Claude talks to you | ask Claude to save it to memory |
| Change what to test next | `TEST_RECOMMENDATIONS.md`, or run `/api-test-audit` to rebuild it |
| Fix this map | `CLAUDE_SETUP.md` — the file you are reading |

## A warning about this file

This file is a description of other files. That means it can go out of date, exactly the way
`TEST_RECOMMENDATIONS.md` did. Nothing checks it automatically.

The code *inside* `.claude/commands/` and `.claude/skills/` is checked — `npm run check:commands`,
in CI. The prose here is not. Both directories went stale once while the reminder hook was already
running, which is why that check exists.

If you add a slash command, change the hook, or move a file, update the tables above. If you are
not sure it is still true, trust the real files over this one.
