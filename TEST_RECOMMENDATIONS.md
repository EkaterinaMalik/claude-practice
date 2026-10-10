# API Test Coverage Recommendations
### Based on: *8 API Testing Mistakes That Keep QA Engineers at Junior Level* — Aston Cook

**Suite state when last audited:** 2026-10-10 — 72 tests across 9 spec files. A full run reports
72 passed. One of those is an expected `test.fail()` that tracks a known server bug, so the
runner counts it as passing while it keeps failing. `npm run typecheck` is clean.

> Keep this file in sync with `tests/`. Whenever a spec file is added, removed, or
> meaningfully changed, re-check the section it belongs to and update the ✅ / gap lists below.

---

## What changed since the 2026-09-16 audit

No test was added or removed. The count is the same 72. What changed is that several of them now
test something they previously only appeared to test. That is a coverage change, so it belongs here.

- **The known-bug tracker could not report.** In `error-response.spec.ts`, `test.fail()` sat above
  the status assertion. It marks the whole test. So if the server were fixed to return 400, that
  assertion would fail and be recorded as an expected failure — green forever, with nobody told.
  The marker now sits below the status check. Fixed 2026-09-27.
- **Five loops could iterate zero times and still pass.** `schema.spec.ts`, `articles.spec.ts` and
  `tags.spec.ts` looped over response arrays without asserting they held anything. There are now
  nine non-empty assertions across those three files.
- **One of those loops was hiding a real gap.** The comment schema test listed comments through the
  plain `request` fixture. This server returns an empty array to anonymous callers, so the test had
  validated zero comments for months. It now lists through an authenticated context. The quirk is
  recorded in `CLAUDE.md` under Key constraints.
- **Five create calls never checked their status.** `article` is typed as non-optional. On a
  non-2xx it is undefined. So a failed create surfaced two steps later as "Cannot read properties
  of undefined", in a test that looked unrelated. Three of the five were `beforeAll` hooks, which
  took a whole describe block with them. All five now assert the status.
- **Cleanup failures are now reported.** The old `.catch()` pattern could not see them. The API
  classes return `{ status }` and never throw. A 403 or 404 resolved normally and logged nothing.
  The `cleanup()` helper in `support/helpers.ts` checks the status, warns, and annotates the
  report.
- **TypeScript is now actually checked.** `tsconfig.json` and `npm run typecheck` (`tsc --noEmit`)
  arrived on 2026-10-03. Before that, nothing verified the type claims this file makes under #7.
- **A missing environment variable now names itself**, through `requiredEnv()` in `support/env.ts`,
  instead of surfacing as `TypeError: Invalid URL` from whichever request ran first.

---

## Scorecard

| # | Mistake | Status | Where |
|---|---------|--------|-------|
| 1 | Only testing happy paths | ✅ Covered (minor gaps) | `articles.spec.ts`, `auth.spec.ts`, `comments.spec.ts` |
| 2 | Ignoring auth edge cases | ✅ Covered (minor gaps) | `auth.spec.ts`, `articles.spec.ts`, `comments.spec.ts`, `profiles.spec.ts` |
| 3 | Not testing error responses | ✅ Covered | `error-response.spec.ts` |
| 4 | Skipping response time checks | ✅ Covered | `performance.spec.ts` |
| 5 | Testing in isolation only | ✅ Covered | `e2e-flow.spec.ts` |
| 6 | Ignoring rate limits | ⚠️ N/A | Target server has no rate limiting |
| 7 | Not validating response schema | ✅ Covered (not strict) | `schema.spec.ts` (zod) |
| 8 | Forgetting database state | ✅ Covered | Re-fetch assertions throughout |

---

## Mistake #1 — Only Testing Happy Paths

**Rule:** For every endpoint test missing required fields, invalid data types, empty strings, null values, boundary values (0, -1, MAX_INT), and special characters.

**What we have:**
- ✅ Articles: 422 for missing/empty title, description, body
- ✅ Comments: 422 for missing/empty body
- ✅ Auth: 422 for empty registration fields (`username`/`email`/`password` sent as `''`)
- ✅ Pagination boundaries: `limit=0` → 200, `limit=999999` → 200, `offset=-1` → 500 (server bug, asserted as-is)
- ✅ Special characters: `<script>alert(1)</script>` stored verbatim in article title
- ✅ SQL injection string `' OR 1=1; --` stored verbatim in article title

**Gaps to address:**
- Special characters / injection strings in article **body** and **description** — currently only `title` is exercised
- Non-numeric pagination params (`limit=abc`, `offset=abc`) — undefined behavior, worth pinning down
- Genuinely **omitted** registration fields (keys absent, not empty strings) — the current test sends `''`, which is a different code path

---

## Mistake #2 — Ignoring Auth Edge Cases

**Rule:** Test expired tokens, invalid token format, token for different user, token with insufficient permissions, missing token, token in wrong header location.

**What we have:**
- ✅ Missing token → 401: `GET /api/user`, `PUT /api/user`, `POST /api/articles`, `DELETE /api/articles/:slug`, `GET /api/articles/feed`, `POST /api/articles/:slug/comments`, `DELETE /api/articles/:slug/comments/:id`, `POST /api/profiles/:username/follow`, `DELETE /api/profiles/:username/follow`
- ✅ Malformed token (`Token not-a-real-token`) → 401 on `GET /api/user`
- ✅ Cross-user `PUT /api/articles/:slug` → 403
- ✅ Cross-user `DELETE /api/articles/:slug` → 403

**Gaps to address:**
- Malformed token against a **write** endpoint (e.g. `POST /api/articles`) — currently only the read path is covered
- Token in the wrong header scheme. **Probed 2026-10-10: this server accepts `Bearer`.** `GET /api/user` returned 200 and `POST /api/articles` returned 201 with a valid token under `Bearer`. The RealWorld spec says `Token`. So a test here pins the leniency; asserting 401 would fail.
- Expired tokens: not testable against this server — no way to mint or age a token. Out of scope unless the target API changes.

---

## Mistake #3 — Not Testing Error Responses

**Rule:** Verify error response structure, error message format, that no sensitive data is leaked, and that error codes are consistent across all endpoints.

**What we have** (`tests/error-response.spec.ts`):
- ✅ Full error shape asserted via zod `ErrorSchema` (`{ errors: { field: string[] } }`) on 422 from `POST /api/users`, `POST /api/articles`, `POST /api/articles/:slug/comments`
- ✅ 422 responses asserted not to leak stack traces, database details, or internal paths
- ✅ `GET /api/articles?offset=-1` → 500 leaks raw Prisma internals — captured as a `test.fail()` so the suite flags it the moment the server is fixed

**Assessment:** Covered. The expected failure is a deliberate tracker, not a suite defect.

Since 2026-09-27 the `test.fail()` marker sits *below* the status assertion. That matters. The
server could be fixed two ways, and the tracker now reports both. A 400 instead of a 500 fails the
status check. A clean 500 body makes the test report "Expected to fail, but passed".

The API wrapper classes also name the problem when a response envelope changes shape. They no
longer hand back an undefined field for a later line to trip over.

---

## Mistake #4 — Skipping Response Time Checks

**Rule:** Add response time assertions to critical endpoints. Set thresholds (< 500ms for simple GETs). Track trends over time.

**What we have** (`tests/performance.spec.ts`):
- ✅ `GET /api/articles` under 2000ms
- ✅ `GET /api/tags` under 2000ms
- ✅ `GET /api/articles/:slug` under 2000ms
- ✅ `POST /api/users/login` under 2000ms
- ✅ `GET /api/user` (authenticated) under 2000ms

**Note:** all five share a single `THRESHOLD_MS = 2000` constant. Per the rule in `CLAUDE.md`, thresholds are set at roughly 3× the measured actual response time — loose enough to avoid flakiness, tight enough to catch a real regression. Re-measure if the server or network environment changes.

---

## Mistake #5 — Testing in Isolation Only

**Rule:** Write end-to-end API flows that mirror real user journeys. Verify that actions in one endpoint correctly affect others.

**What we have:**
- ✅ `tests/e2e-flow.spec.ts` — one full social journey: register → follow → create article → update article → comment → verify comment in list → delete comment → unfollow → delete article → verify gone
- ✅ `PUT /api/user`: register → login → update → verify via GET → login with new password
- ✅ `DELETE /api/articles`: create → delete → verify 404 via GET
- ✅ `DELETE` comment: create → delete → verify gone via list

**Assessment:** Covered.

---

## Mistake #6 — Ignoring Rate Limits

**Rule:** Test rate limit boundaries. Verify correct 429 responses. Check that limits reset properly.

**Assessment:**
- ⚠️ The Conduit test server (`conduit-api.bondaracademy.com`) does not implement rate limiting — this mistake is **not applicable** to the current target API.
- Revisit if the target API changes.

---

## Mistake #7 — Not Validating Response Schema

**Rule:** Use schema validation (JSON Schema, Zod, etc.). Verify all expected fields exist with correct types. Catch breaking changes before they break the frontend.

**What we have** (`tests/schema.spec.ts`, zod):
- ✅ `ArticleSchema` on `GET /api/articles` (every item) and `GET /api/articles/:slug`
- ✅ `TagsSchema` on `GET /api/tags`
- ✅ `ProfileSchema` on `GET /api/profiles/:username`
- ✅ `UserSchema` on `GET /api/user`, `POST /api/users`, `POST /api/users/login`
- ✅ `CommentSchema` on `GET /api/articles/:slug/comments` (every item) and `POST /api/articles/:slug/comments`
- ✅ TypeScript interfaces in `support/types.ts` additionally enforce shapes at compile time

**Assessment:** Covered for missing and mistyped fields. The compile-time half of that claim is
now verifiable: `npm run typecheck` runs `tsc --noEmit` against a real `tsconfig.json`, added
2026-10-03. Before then nothing checked it.

Each schema test that loops over an array now asserts the array is non-empty first, and the
comments test authenticates before listing. Without both, a loop over an empty response
validated nothing and reported green.

**Closed 2026-10-10.** Every schema in `support/schemas.ts` is now `z.strictObject()`. A plain
`z.object()` strips unknown keys and parses happily, so a field the server added passed silently.
All twelve `parse()` calls discard their result, so the stripped field left no trace anywhere.

Turning it on found a real inconsistency on the first run. `POST /api/users` and `GET /api/user`
both return a numeric `id`; `POST /api/users/login` does not. No schema declared it, so the suite
had never noticed. There are now two schemas — `UserSchema` with `id`, and `LoginUserSchema`
without — so each endpoint's real shape is pinned.

---

## Mistake #8 — Forgetting Database State

**Rule:** For critical operations, verify database state directly. Check that data was actually created, updated, or deleted.

**What we have:**
- ✅ `PUT /api/articles`: update → verify via separate GET
- ✅ `PUT /api/user`: update → verify via `getCurrentUser` fetch
- ✅ `DELETE /api/articles`: delete → verify 404 via GET
- ✅ `DELETE` comment: delete → verify absent in list GET

**Assessment:** Covered. Direct DB access isn't available for this target, so re-fetch through the API is the strongest available check.

---

## Remaining Work

Everything below is a genuine gap, in the order worth doing:

| Priority | Item | Mistake | Effort |
|----------|------|---------|--------|
| 1 | Malformed token against a write endpoint (`POST /api/articles`) | #2 | Low |
| 2 | Pin that this server accepts `Bearer` as well as `Token` — it does, so the test asserts the leniency, not a 401 | #2 | Low |
| 3 | Special chars / injection strings in article `body` and `description` | #1 | Low |
| 4 | Non-numeric pagination params (`limit=abc`, `offset=abc`) | #1 | Low |
| 5 | Registration with omitted (not empty) required fields | #1 | Low |
| 6 | Type `article` as optional on a non-2xx result, now that `tsc` can verify the fallout | #7 | Medium |

Re-checked against the live API on 2026-10-10. Five of the six are still open. The sixth, strict
schemas, is done — see #7 above.

Item 6 is new. The result types claim `article` is always present. That is false on a non-2xx. The
fix was skipped in September for a good reason: 23 places destructure it, and there was no
`tsconfig.json` to verify the fallout. There is one now.

Not planned: rate limiting (#6, server doesn't implement it), expired-token tests (#2, no way to mint or age a token against this server), direct DB assertions (#8, no DB access).
