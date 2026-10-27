# Conduit API Tests

[![API Tests](https://github.com/EkaterinaMalik/claude-practice/actions/workflows/api-tests.yml/badge.svg)](https://github.com/EkaterinaMalik/claude-practice/actions/workflows/api-tests.yml)

**93 API tests against a live, shared, public server — run in parallel, in any order.**

Playwright and TypeScript. No browser is launched, so no browser binaries are downloaded.


Design decisions worth a look:

- **Independence is enforced, not hoped for.** Users are throwaway and never reused across spec files. Nothing depends on order. `fullyParallel` is on.
- **Types are checked twice.** TypeScript checks the code before it runs. Zod checks the server's real answer while it runs.
- **Failures name their own cause.** A failed cleanup is reported, never swallowed. A missing environment variable says which one. A known server bug is pinned with `test.fail()`, so it turns red the day the server is fixed.
- **Reporting and CI are part of the suite.** Four reporters from one run. GitHub Actions publishes a check run on every push and pull request.
- **Docker removes prerequisites.** One image renders the Allure report, so reading it needs no Java. Another runs the suite, so a machine needs no Node.


## The interesting part is the target

The API under test is [Conduit](https://conduit-api.bondaracademy.com), the RealWorld reference backend — articles, comments, profiles, auth. It is a public demo server that anyone can write to. There is no database to reset between runs, and no fixtures to seed.

Every test creates test data, cleans up after itself, and reads nothing another test created.

All tests run independently of each other. One throwaway user is registered per spec file and shared for read-only work. Any test that changes user state registers its own. Each test cleans up the data it created, and reports it when removal fails — a cleanup problem is never allowed to mask the real test result.

## What I was actually trying to get right

**Tests that can fail.** The easiest mistake in API testing is a test that stays green whatever the
server does — a loop over an empty list, an assertion on a response that merely echoed your input.
Five of those were found in this suite and fixed. Every loop now asserts it had something to loop
over.

**Bugs tracked, not hidden.** Where the server is genuinely wrong, the test records the correct behaviour and is marked as expected-to-fail. It turns red the day the server is fixed. That has already happened once: a crash on a negative offset was repaired upstream without announcement,
and the next CI run reported it.

**Failures that explain themselves.** A missing environment variable names itself instead of
surfacing as a confusing URL error three layers down. A cleanup that fails says so instead of
leaving silent litter. An unexpected status prints the server's own words alongside it.

**Findings written down.** The server has real quirks — it accepts an auth scheme the spec does not mention, it ignores a page size of zero, it rejects a duplicate article title. Each one is recorded next to the test that pins it, so nobody has to discover it twice.

## What is covered

| Spec | Tests | Covers |
|---|---|---|
| `articles.spec.ts` | 33 | CRUD, pagination, tag filter, favorites, feed, auth protection, boundary values, special characters |
| `auth.spec.ts` | 17 | Register, login, current user, token handling, update user, token rejection |
| `schema.spec.ts` | 9 | Zod validation of every response shape |
| `comments.spec.ts` | 9 | List, add, delete, validation |
| `error-response.spec.ts` | 8 | Error body structure, no internals leaked |
| `profiles.spec.ts` | 9 | Fetch, follow, unfollow |
| `performance.spec.ts` | 5 | Response-time ceilings |
| `tags.spec.ts` | 2 | Tag list and tag filtering |
| `e2e-flow.spec.ts` | 1 | One end-to-end social flow, register through cleanup |

No test reads data made by another. Every run registers throwaway users as it goes: one shared per spec file where tests only read, plus a dedicated one for every test that changes user state.

## Try it

```bash
git clone git@github.com:EkaterinaMalik/claude-practice.git
cd claude-practice
npm ci
cp .env.example .env    # the defaults work as-is; .env is gitignored
npm test
```

Node 22. No browser binaries are downloaded — these are pure API tests. If you would rather not install anything, `npm run test:docker` runs the whole suite in a container.

## Reports

One run produces four reports: the console, Playwright's HTML report, Allure, and JUnit XML for CI.

```bash
npm run report          # Playwright's HTML report
npm run allure:docker   # Allure at localhost:5252, no Java needed
```

GitHub Actions runs everything on each push and pull request, and publishes the results as a check on the commit.

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
- `GET /api/articles?limit=1.5` returns a 500 with raw internals. A `test.fail()` test tracks it. The day the server is fixed, that test starts failing — correctly. The same used to be true of `offset=-1`, until the server fixed it and the suite said so.
- Usernames are capped at 20 characters.

Full list in [CLAUDE.md](CLAUDE.md).

## Documentation

| File | What it holds |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Architecture, testing rules, and everything learned about the live API |
| [TEST_RECOMMENDATIONS.md](TEST_RECOMMENDATIONS.md) | Coverage audit against a well-known list of API testing mistakes |
| [CI_SETUP.md](CI_SETUP.md) | How the pipeline was built, and why each choice was made |
| [PROJECT_FILES.md](PROJECT_FILES.md) | A map of every file in the repo |
| [CLAUDE_SETUP.md](CLAUDE_SETUP.md) | How Claude Code is configured here |
