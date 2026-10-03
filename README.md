# Conduit API Tests

[![API Tests](https://github.com/EkaterinaMalik/claude-practice/actions/workflows/api-tests.yml/badge.svg)](https://github.com/EkaterinaMalik/claude-practice/actions/workflows/api-tests.yml)

**The hard part is the target.** The API under test is live, public and shared. There is no database to reset. There is no fixture to seed. Anything a test creates is visible to the rest of the suite.

So every test here stands alone. It registers its own user. It creates its own data. It removes that data again, and it says so when removal fails. That is what makes **72 tests safe to run at once, in any order**.

Playwright and TypeScript. A full run takes about 15 seconds. No browser is launched, so no browser binaries are downloaded.

Design decisions worth a look:

- **Independence is enforced, not hoped for.** Every test registers a throwaway user. Nothing is shared. Nothing depends on order. `fullyParallel` is on.
- **Types are checked twice.** TypeScript checks the code before it runs. zod checks the server's real answer while it runs.
- **Failures name their own cause.** A failed cleanup is reported, never swallowed. A missing environment variable says which one. A known server bug is pinned with `test.fail()`, so it turns red the day the server is fixed.
- **Reporting and CI are part of the suite.** Four reporters from one run. GitHub Actions publishes a check run on every push and pull request.
- **Docker removes prerequisites.** One image renders the Allure report, so reading it needs no Java. Another runs the suite, so a machine needs no Node.
- **Server quirks are written down.** This server has real oddities. Each one sits next to the test that pins it.

The system under test is [Conduit](https://conduit-api.bondaracademy.com), the RealWorld reference backend: articles, comments, profiles, auth.

## Quick start

```bash
git clone git@github.com:EkaterinaMalik/claude-practice.git
cd claude-practice
npm ci
cp .env.example .env     # the defaults work as-is; .env is gitignored
npm test
```

Node 22 is expected. If a variable is missing, the suite stops at once and names it. No confusing `Invalid URL` later.

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

Every test creates its own throwaway user and cleans up after itself. That is what lets the suite run fully in parallel, in any order.

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

A `pretest` hook clears `allure-results/` before each `npm test`. So a report never mixes two runs.

## Docker

Two images, defined in `docker-compose.yml`. Neither running the suite nor reading the report depends on what is installed on the machine.

| Service | Image | Does |
|---|---|---|
| `allure` | `eclipse-temurin:21-jre` + Allure CLI 2.36.0 | Renders the report. Allure needs Java. This way you need only Docker. |
| `tests` | `node:22-slim` | Runs the suite. No local Node needed. |

```bash
npm run allure:docker        # serve the report at localhost:5252
npm run allure:docker:build  # write allure-report/ to disk and exit
npm run test:docker          # run the whole suite in a container
npm run test:docker -- tests/auth.spec.ts   # ...or one spec
```

Four decisions matter more than the commands:

- **Both run as you, not root.** Set by `user: "${DOCKER_UID:-1000}:${DOCKER_GID:-1000}"`, fed from `id -u`. A container is root by default. Files it writes then need `sudo` to delete.
- **Results are mounted read-only.** The viewer only renders them. It never writes. So it cannot.
- **The Allure version is pinned, and the pin is load-bearing.** Newer releases refuse to serve on anything but localhost. A container cannot use that. Checked against 2.46.0, which exits with `` `allure serve` is intended for local report preview only ``. The version is a build arg, so testing a bump takes one command.
- **No Playwright browser image.** No test opens a browser. `node:22-slim` plus `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is enough. That saves about 1.5 GB.

Dependencies are baked into the test image. The repo is mounted at run time. So editing a spec needs no rebuild.

## Continuous integration

GitHub Actions runs the suite on every push and pull request to `master`. It can also be run on demand from the Actions tab. Results appear as a check run on the commit. The HTML report and the raw Allure results are attached to each run, kept for 7 days.

Configuration lives in repository Variables. Credentials live in Secrets. See [CI_SETUP.md](CI_SETUP.md).

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

It is a public demo server with real quirks. The tests document them rather than work around them:

- Anonymous reads only ever return the pre-seeded data. Authenticate whenever a test needs to see its own writes. Otherwise a loop can run zero times and pass while checking nothing.
- Login returns **403**, not 422, for wrong credentials.
- `GET /api/articles?offset=-1` returns a 500 with raw internals. A `test.fail()` test tracks it. The day the server is fixed, that test starts failing — correctly.
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
