# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                        # run all 30 tests
npm run test:auth               # run a single suite
npm run test:articles
npm run test:comments
npm run test:tags
npm run test:profiles
npm run report                  # open HTML report (must run tests first)

npx playwright test --reporter=list                  # no HTML report, console only
npx playwright test tests/articles.spec.ts           # run one file
npx playwright test -g "creates a new article"       # run one test by title
```

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
