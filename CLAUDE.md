# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                        # run all tests (writes HTML + Allure results, per config)
npm run test:auth               # run a single suite
npm run test:articles
npm run test:comments
npm run test:tags
npm run test:profiles
npm run report                  # open Playwright's built-in HTML report (must run tests first)

npm run allure:generate         # build the Allure static report from allure-results/
npm run allure:open             # open the generated Allure report in a browser
npm run allure:serve            # generate + open in one step (temporary server)

npx playwright test tests/articles.spec.ts           # run one file
npx playwright test -g "creates a new article"       # run one test by title
```

### Reporting

Reporters are configured in `playwright.config.ts`: `html`, `list`, `allure-playwright` (writes to `allure-results/`), and `junit` (writes to `junit-results/results.xml`) all run together by default.

**Gotcha:** passing `--reporter=<name>` on the command line (e.g. `--reporter=list`) *replaces* the entire `reporter` array from the config — it does not add to it. Doing this silently disables Allure result generation with no error. It also silently breaks CI: the GitHub Actions workflow's `dorny/test-reporter` step reads `junit-results/results.xml` to publish the pass/fail check run, and that step will fail (or show stale results) if the JUnit reporter didn't run. Omit `--reporter` to get all four configured reporters; only pass it when you deliberately want console-only output for a quick local check.

`allure-results/` and `allure-report/` are gitignored — generate them locally or in CI as needed. Result files themselves need no extra tooling to produce; only generating/viewing the report needs the `allure` CLI.

#### Viewing the report without a local Allure CLI

The `allure:*` scripts need `allure` (and a JRE) on the host. To avoid that dependency, `docker-compose.yml` defines an `allure` service that runs a pinned Allure CLI in a container:

```bash
npm run allure:docker         # serve the report at http://localhost:5252
npm run allure:docker:build   # write allure-report/ to the host, then exit
```

- **The CLI version is pinned to 2.36.0** in `docker/allure/Dockerfile`. `allure-playwright` is on 3.x but writes Allure 2-compatible results, so the 2.x CLI renders them correctly — this is the combination known to work here. Bump the `ALLURE_VERSION` build arg only after confirming the report still renders.
- **`-h 0.0.0.0` is required** in the container's serve command. Allure's default binds to localhost *inside* the container, which the published host port cannot reach — the port looks open but every request hangs.
- **The service runs as the host user** via `user: "${DOCKER_UID:-1000}:${DOCKER_GID:-1000}"`, which the npm scripts set from `id -u`/`id -g`. Without it the container writes `allure-report/` as root, and the next local `npm run allure:generate` (or a plain `rm -rf allure-report`) fails with permission errors. Keep the `DOCKER_UID`/`DOCKER_GID` prefix if you edit these scripts.
- **The npm scripts `mkdir -p` the mounted directories first, deliberately.** Both are gitignored and often absent; Docker auto-creates a missing bind-mount source as a **root-owned** directory, after which `npm test` fails with permission errors trying to write `allure-results/`. Creating them as the host user first avoids that. Keep the `mkdir -p` if you edit these scripts.

## Architecture

**Target:** REST API at `https://conduit-api.bondaracademy.com/api` — a [RealWorld/Conduit](https://github.com/gothinkster/realworld) spec implementation. All tests are pure API tests (no browser). The single Playwright project is named `api` with no browser attached.

### Layer separation (in progress)

The project is being migrated toward a two-layer model:

| Layer | Location | Role |
|-------|----------|------|
| API classes | `support/api/` | Wrap raw HTTP calls; own typed input/output interfaces |
| Spec files | `tests/` | Assertions only; call API classes, never `request.post/get` directly |
| Shared models | `support/types.ts` | Domain types shared across API classes (`Article`, `Author`) |

**Currently migrated:** `ArticlesApi.create()`. Remaining spec files still call Playwright's `request` fixture directly — migrate them to the same pattern as you extend coverage.

### Key constraints discovered from the live API

- **Username max length: 20 characters.** Use `uniqueId()` — last 10 digits of timestamp + 3-char random suffix — to generate usernames that fit: `u_${uniqueId()}` = 14 chars max.
- **Login error code is 403**, not 422, for wrong credentials on this server (deviates from the RealWorld spec).
- **`/api/articles/feed`** requires auth; returns an empty list for new users (they follow nobody).
- All tests register fresh throw-away users (`example.com` emails) — no shared credentials file.

### Auth pattern

Tests that need an authenticated context register + login a new user in `beforeAll` or at the top of the test, then dispose the context in `afterAll`. There is no saved auth state. The helper lives inline in each spec file for now; the long-term target is a shared Playwright fixture in `support/fixtures.ts`.

## Testing rules

### Test independence
Every test must create its own data and clean up after itself so cleanup failures never mask test failures. Never read data created by another test. `beforeAll` is only acceptable for a single shared read-only value (e.g. an article slug reused across comment tests in the same describe block). All tests must be safe to run in parallel (`fullyParallel: true`).

Cleanup calls must not fail silently. Catch the error and log it rather than swallowing it with a bare `.catch(() => {})` — a silent cleanup failure looks identical to a healthy test in CI output, and hides real problems (e.g. a resource that was never actually deleted, leaking state into later runs):
```typescript
await api.delete(article.slug).catch((error) => {
  console.warn('Cleanup failed:', error);
});
```

### TypeScript interfaces as test data structure
Define TypeScript interfaces for all API request/response shapes in `support/api/` (e.g. `CreateArticleInput`, `UpdateArticleInput`). Use these interfaces to type all test data — they serve as living documentation of the expected shape and give compile-time safety. When intentionally sending incomplete data to test server-side validation, use an explicit `as InterfaceType` cast to make the violation visible and deliberate:
```typescript
// Intentional: missing required field to verify 422
await api.create({ description: 'No title', body: 'Some body.' } as CreateArticleInput);
```

### Known server bugs — use `test.fail()`
When the server behaves incorrectly in a way we cannot fix (e.g. returning a raw database error instead of a structured 400), document it with `test.fail()` and a comment explaining the expected vs actual behavior. Do not silently skip or work around it — the failing test acts as a bug tracker entry that automatically resolves if the server is fixed.

### Response time thresholds
Set thresholds at approximately 3× the measured actual response time to avoid flakiness while still catching real regressions. Re-measure and adjust if the server or network environment changes significantly.

### Group multi-phase tests with `test.step`
When a test has more than one logical phase (setup, act, assert, verify persistence, cleanup), wrap each phase in `test.step('label', async () => { ... })`. This makes the HTML report show collapsible, individually-timed steps instead of one opaque block, so a failure points straight at the phase that broke.

- **Apply it** to tests with 2+ distinct phases: e.g. create → update → verify, or setup owner/attacker → act → cleanup.
- **Skip it** on true one-liners (a single API call + assert) — wrapping trivial tests in steps adds noise without adding clarity.
- **Preserve full response objects across steps**, not just the field you happen to need right now (e.g. keep `let article: Article` instead of `let slug: string`). Later steps or future edits may need other fields, and it keeps the variable's meaning obvious.
- No `page` fixture is needed for `test.step` in API tests — the callback is just `async () => {}` regardless of which fixture the outer test uses (`request`, `playwright`, or none).

```typescript
test('PUT /api/articles/:slug — updates all article attributes', async () => {
  let created: Article;

  await test.step('Create article to be updated', async () => {
    const { article } = await api.create({ ... });
    created = article;
  });

  await test.step('Update article attributes', async () => {
    const { status, article } = await api.update(created.slug, updates);
    expect(status).toBe(200);
  });

  await test.step('Verify changes persisted via a separate fetch', async () => {
    const { article: fetched } = await api.getBySlug(created.slug);
    expect(fetched.title).toBe(updates.title);
  });

  await test.step('Cleanup: delete the article', async () => {
    await api.delete(created.slug).catch(() => {});
  });
});
```
