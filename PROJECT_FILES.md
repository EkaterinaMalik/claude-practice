# Every file in this project, and what it is for

A complete map. Written 2026-09-19, when the suite had **72 tests in 9 spec files**.

Start here if you are not sure which file to open.

---

## The short version

| I want to... | Open |
|---|---|
| See what the tests cover | `tests/` — 9 spec files |
| See what is still missing | `TEST_RECOMMENDATIONS.md` |
| Run something | `package.json`, or the Commands section of `CLAUDE.md` |
| Understand the code layout | `CLAUDE.md` — Architecture |
| Know how Claude is set up | `CLAUDE_SETUP.md` |
| Fix the CI | `.github/workflows/api-tests.yml` and `CI_SETUP.md` |

---

## 1. The test plan — `tests/`

Nine spec files. This is the test plan. There is no separate plan document; the specs *are* the plan,
and `TEST_RECOMMENDATIONS.md` tracks what is missing from them.

| File | Tests | Covers |
|---|---|---|
| `articles.spec.ts` | 26 | The biggest one. Public list and filters, pagination boundaries, auth protection, cross-user 403s, create / update / favourite / feed / delete, 422 validation, special characters |
| `auth.spec.ts` | 9 | Register, login, get and update the current user, 401 without a token, 401 with a broken token |
| `schema.spec.ts` | 9 | Runtime response-shape checks with zod, for articles, tags, profiles, users and comments |
| `comments.spec.ts` | 7 | List, add, delete, 401 without auth, 422 on an empty body |
| `profiles.spec.ts` | 6 | Get a profile, 404 for unknown, follow and unfollow, 401 without a token |
| `error-response.spec.ts` | 6 | Error body shape, and checks that errors do not leak stack traces or database internals. Holds the one expected failure — a known server bug |
| `performance.spec.ts` | 5 | Response times on five endpoints, all under one 2000ms threshold |
| `tags.spec.ts` | 3 | Tag list shape and filtering articles by tag |
| `e2e-flow.spec.ts` | 1 | One long realistic journey: register → follow → create → **comment → update** → verify both → delete comment → unfollow → delete article. The comment is added *before* the update on purpose — the test checks it survives one |

**One test is expected to fail.** In `error-response.spec.ts`, a `test.fail()` marks a real server bug:
`GET /api/articles?offset=-1` returns 500 with raw Prisma internals. The test will start failing — which
means passing — the day the server is fixed. That is deliberate.

## 2. The code the tests use — `support/`

Tests go through these rather than calling HTTP directly.

**One exception**, and it is deliberate: `error-response.spec.ts` makes three direct `request.*`
calls. It checks the *raw* response body, and these classes throw that body away — they return
parsed, typed fields instead. See `CLAUDE.md`, Layer separation. Leave them alone.

| File | What it holds |
|---|---|
| `api/ArticlesApi.ts` | 8 methods: getAll, getBySlug, create, update, delete, favorite, unfavorite, getFeed |
| `api/AuthApi.ts` | register, login, getCurrentUser, updateCurrentUser |
| `api/CommentsApi.ts` | list, create, delete |
| `api/ProfilesApi.ts` | get, follow, unfollow |
| `api/TagsApi.ts` | getAll |
| `helpers.ts` | `createAuthContext()`, `uniqueId()`, `generateEmail()`, and the shared constants |
| `types.ts` | Shared types: `Article`, `Author`, `Comment`, `Profile`, `User` |
| `schemas.ts` | The zod schemas used by `schema.spec.ts` and `error-response.spec.ts` |

## 3. Documentation — the `.md` files

Five in this repo. Each has a different main job, though they do repeat each other in places —
this file restates facts that `CLAUDE.md` and `TEST_RECOMMENDATIONS.md` own. Where they
disagree, those two are the source and this file is the copy.

| File | Answers | Who keeps it current |
|---|---|---|
| `CLAUDE.md` | How do I work in this repo? Commands, architecture, testing rules, and the rule for keeping docs current | Updated with the code it describes |
| `TEST_RECOMMENDATIONS.md` | What should I test next? | `/api-test-audit` rewrites it; the hook reminds you |
| `CLAUDE_SETUP.md` | How is Claude configured here? | By hand, when a rule source changes |
| `CI_SETUP.md` | How does the GitHub Actions run work? | By hand, when the workflow changes |
| `PROJECT_FILES.md` | Where is everything? *(this file)* | By hand, when files are added or moved |

Five more `.md` files live in `.claude/commands/`. They are slash commands, not documents — see
`CLAUDE_SETUP.md` section 2.

## 4. Config and setup

| File | What it does |
|---|---|
| `package.json` | Dependencies, and 14 npm scripts |
| `package-lock.json` | Exact dependency versions. `npm ci` uses it, and the Docker image caches on it — do not edit by hand |
| `playwright.config.ts` | One project named `api`, no browser, `fullyParallel: true`, reporters |
| `.env` | Real values. **Not in git.** |
| `.env.example` | The same keys with safe placeholder values. In git — copy it to make your `.env` |
| `.github/workflows/api-tests.yml` | Runs the suite on GitHub after a push |
| `docker-compose.yml` | Two services: the Allure report viewer, and a containerised test run |
| `docker/allure/Dockerfile` | Java 21 + Allure CLI, for viewing the report without installing Allure |
| `docker/tests/Dockerfile` | Node 22, for running the suite on a machine that has only Docker |
| `.gitignore`, `.dockerignore` | What to leave out of git and out of the image |

### The npm scripts

Run one spec: `test:auth`, `test:articles`, `test:comments`, `test:tags`, `test:profiles`
Run everything: `test` — `pretest` clears old Allure results first
In Docker: `test:docker`
Reports: `report`, `allure:generate`, `allure:open`, `allure:serve`, `allure:docker`, `allure:docker:build`

## 5. Folders you can ignore

All generated, all in `.gitignore`. Safe to delete — they come back.

`node_modules/` · `test-results/` · `playwright-report/` · `blob-report/` · `playwright/.cache/` ·
`playwright/.auth/` · `allure-results/` · `allure-report/` · `junit-results/`

If you see a stray `.md` inside `allure-results/` or `test-results/`, it is a test attachment, not
documentation.

## 6. Files outside this repo

These are on Kateryna's machine only. A clone of this repo will not have them.

| Where | What |
|---|---|
| `../Recommendations_API.pdf` | The "8 API Testing Mistakes" article that `TEST_RECOMMENDATIONS.md` is built from |
| `../conduit-project-reference.pdf` / `.html` | A project reference written earlier |
| `../allure-docker-runbook.pdf` / `.html` | A runbook for the Allure Docker viewer |
| `../Conduit-API-Test-Reference.docx` / `.pdf` | This file plus `TEST_RECOMMENDATIONS.md`, built for printing |
| `../.claude/hooks/check-docs-current.sh` | The reminder hook |
| `../.claude/settings.local.json` | Permissions, and where the hook is wired up |
| `~/.claude/projects/.../memory/` | Claude's memory: `MEMORY.md` is the index, plus one file per remembered fact. The count changes, so check rather than trust a number here |

The `..` means `/home/kateryna/Projects/Claude_project/`, one level above this repo.

---

## Keeping this file honest

This file lists other files, so it goes out of date the moment one is added, renamed, or deleted.
Nothing checks it automatically — the hook covers source-to-doc pairs, not this inventory.

If you add a spec file, a doc, or a config file, add a row here. If a number in this file disagrees
with the real thing, the real thing is right.

To re-check the counts:

```bash
npx playwright test --list | tail -1     # total tests and files
git ls-files tests/ support/             # what exists now
find . -name "*.md" -not -path "*/node_modules/*"
```
