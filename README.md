# Conduit API Tests

[![API Tests](https://github.com/EkaterinaMalik/claude-practice/actions/workflows/api-tests.yml/badge.svg)](https://github.com/EkaterinaMalik/claude-practice/actions/workflows/api-tests.yml)

An API test suite built the way a suite has to be built to survive: **72 tests that run in parallel in any order**, each creating its own data and cleaning up after itself, against a live third-party server that cannot be reset between runs.

Written in Playwright and TypeScript. The whole suite finishes in about 15 seconds — these are pure API tests, so no browser is ever launched and no browser binaries are downloaded.

What it demonstrates:

- **Test independence under real conditions.** Every test registers a throwaway user. Nothing is shared, nothing is ordered, `fullyParallel` is on.
- **Validation that runs, not just compiles.** TypeScript types vanish at runtime, so every response shape is checked again with zod against what the server actually sent.
- **Failures that point at the cause.** Cleanup problems are reported rather than swallowed, a missing environment variable names itself, and a known server bug is pinned with `test.fail()` so it starts failing the day it is fixed.
- **Reporting and CI as part of the suite, not an afterthought.** Four reporters from one run, Allure viewable with nothing installed but Docker, and GitHub Actions publishing a check run on every push and pull request.
- **Server quirks documented, not worked around.** The target is a public demo API with real oddities; each one is written down with the test that pins it.

The system under test is [Conduit](https://conduit-api.bondaracademy.com), the RealWorld reference backend — articles, comments, profiles and auth.

## Quick start

```bash
git clone git@github.com:EkaterinaMalik/claude-practice.git
cd claude-practice
npm ci
cp .env.example .env     # the defaults work as-is; .env is gitignored
npm test
```

Node 22 is expected. If a variable is missing, the suite stops immediately and names it rather than failing later with a confusing `Invalid URL`.

## What is covered

| Spec | Tests | Covers |
|---|---|---|
| `articles.spec.ts` | 26 | CRUD, pagination, tag filter, favorites, feed, auth protection, boundary values, special characters |
| `auth.spec.ts` | 9 | Register, login, current user, update user, token rejection |
| `schema.spec.ts` | 9 | Zod validation of every response shape |
| `comments.spec.ts` | 7 | List, add, delete, validation |
| `error-response.spec.ts` | 6 | Error body structure, no internals leaked |
| `profiles.spec.ts` | 6 | Fetch, follow, unfollow |
| `performance.spec.ts` | 5 | Response-time ceilings |
| `tags.spec.ts` | 3 | Tag list and tag filtering |
| `e2e-flow.spec.ts` | 1 | One full social flow, register through cleanup |

Every test creates its own throwaway user and cleans up after itself, so the suite runs fully in parallel in any order.

## Running

```bash
npm test                          # everything
npm run test:auth                 # one spec (also :articles, :comments, :tags, :profiles)
npx playwright test -g "favorite" # one test by name

npm run test:docker               # run the suite in a container, no local Node needed
```

## Reports

Four reporters write from a single run: console, Playwright HTML, Allure, and JUnit XML for CI.

```bash
npm run report                    # Playwright's own HTML report
npm run allure:serve              # Allure report — needs Java and the Allure CLI locally
npm run allure:docker             # same report from a container, no Java needed → localhost:5252
```

`allure-results/` is cleared before each `npm test` by a `pretest` hook, so a report never mixes two runs.

## Continuous integration

GitHub Actions runs the suite on every push and pull request to `master`, and on demand from the Actions tab. Results appear as a check run on the commit; the HTML report and raw Allure results are attached to each run for 7 days.

Configuration lives in repository Variables, credentials in Secrets — see [CI_SETUP.md](CI_SETUP.md).

## Layout

```
tests/           9 spec files
support/
  api/           one wrapper class per resource — specs call these, not raw HTTP
  schemas.ts     zod schemas for runtime response validation
  types.ts       shared types: Article, Author, Comment, Profile, User
  helpers.ts     createAuthContext(), cleanup(), uniqueId(), generateEmail()
  env.ts         requiredEnv() — fails loudly on a missing variable
docker/          images for the test runner and the Allure viewer
```

## Notes on the target API

It is a public demo server with real quirks, and the tests document them rather than work around them:

- Anonymous reads only ever return the pre-seeded data. Authenticate whenever a test needs to see its own writes, or a loop can iterate zero times and pass while checking nothing.
- Login returns **403**, not 422, for wrong credentials.
- `GET /api/articles?offset=-1` returns a 500 with raw internals. That is tracked by a `test.fail()` test, which will start failing — correctly — the day the server is fixed.
- Usernames are capped at 20 characters.

Full list in [CLAUDE.md](CLAUDE.md).

## Documentation

| File | What it holds |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Commands, architecture, testing rules, server quirks |
| [PROJECT_FILES.md](PROJECT_FILES.md) | File-by-file map of the repo |
| [CI_SETUP.md](CI_SETUP.md) | How the GitHub Actions workflow was built, step by step |
| [TEST_RECOMMENDATIONS.md](TEST_RECOMMENDATIONS.md) | Coverage audit and remaining gaps |
| [CLAUDE_SETUP.md](CLAUDE_SETUP.md) | How Claude Code is configured for this repo |
