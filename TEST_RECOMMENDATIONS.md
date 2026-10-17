# API Test Coverage Recommendations
### Based on: *8 API Testing Mistakes That Keep QA Engineers at Junior Level* — Aston Cook

**Suite state when last audited:** 2026-10-11 — 78 tests across 9 spec files. A full run reports
78 passed. Two of those are expected `test.fail()` markers tracking known server bugs
(`offset=-1` leaking Prisma internals, and `limit=0` returning the default page instead of an
empty one), so the runner counts them as passing while they keep failing. `npm run typecheck` is clean.

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
- **Five create calls never checked their status.** `article` was typed as non-optional, but on a
  non-2xx it is undefined. So a failed create surfaced two steps later as "Cannot read properties
  of undefined", in a test that looked unrelated. Three of the five were `beforeAll` hooks, which
  took a whole describe block with them. This is now structural rather than a per-call fix: the
  wrapper methods (`create`, `getBySlug`, …) assert the status before they read a payload, so no
  spec can reach an undefined one. Negative tests call the `…Raw` twin instead.
- **Cleanup failures are now reported.** The old `.catch()` pattern could not see them. A `…Raw`
  method never throws on a non-2xx, so a 403 or 404 resolved normally and logged nothing. The
  `cleanup()` helper in `support/helpers.ts` takes a `…Raw` method, checks the status, warns, and
  annotates the report.
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
- ✅ Pagination boundaries: `limit=999999` → 200 returning every article exactly once,
  `offset=-1` → 500 (server bug, tracked with `test.fail()`), `limit=0` → 200 returning the full
  default page rather than an empty one (server bug, tracked with `test.fail()`)
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
- ✅ Malformed token → 401 on `GET /api/user` (read) and on `POST /api/articles` (write). The write
  case covers four shapes: garbage after the scheme, a scheme with no token, a token with no
  scheme, and a truncated JWT
- ✅ Cross-user `PUT /api/articles/:slug` → 403
- ✅ Cross-user `DELETE /api/articles/:slug` → 403

**Gaps to address:**
- Malformed token against a **write** endpoint (e.g. `POST /api/articles`) — currently only the read path is covered
- ✅ Token in the wrong header scheme. **This server accepts `Bearer`.** `GET /api/user` returns 200 and `POST /api/articles` returns 201 with a valid token under `Bearer`; the RealWorld spec says `Token`. `auth.spec.ts` pins the leniency rather than asserting a 401, which would fail. It also pins that the scheme is case-sensitive: `token` and `bearer` give 401.
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
| 1 | Migrate the three direct `request.*` calls in `error-response.spec.ts` to `…Raw` methods | #7 | Low |
| 2 | `tags.spec.ts` — `'returns non-empty list'` asserts what the test above it already asserts | #7 | Low |
| 3 | The CI workflow still uses a Node 20 action that GitHub has deprecated | — | Low |
| 4 | Add the `limit=1.5` / `offset=1.5` Prisma leak to the `test.fail()` tracker in `error-response.spec.ts` — only the status is pinned today | #3 | Low |

Re-checked against the live API on 2026-10-11. Everything the September audit left open has been
written; the four items above all came out of work done on 2026-10-11.

**Item 1** is open work, not a rule. `error-response.spec.ts` asserts on the raw body — leak
patterns via `response.text()`, and the exact `{ errors: … }` envelope — and until the Raw methods
existed, three direct `request.*` calls were the only way to reach it, because the API classes
discarded the raw body. A Raw method returns the `APIResponse` itself, so that reason is gone.
`registerRaw` replaces two of the calls and `getAllRaw` the third.

**Done since the last audit:**

- **`Bearer` is accepted as well as `Token`, and the scheme is case-sensitive.** `auth.spec.ts`
  pins the leniency on a read and a write, since asserting 401 would fail. Probed 2026-10-11:
  `Token` and `Bearer` both give 200/201, while `token` and `bearer` give 401.
- **Special characters in `description` and `body`.** `articles.spec.ts` sends a script tag, a SQL
  injection string, unicode with emoji, and newlines/tabs, then re-fetches each article to prove
  the value was stored rather than echoed. All four survive verbatim.
- **Non-numeric pagination is ignored, not rejected.** `limit=abc` and `offset=abc` return 200 with
  the default page. A fractional value is different: `limit=1.5` and `offset=1.5` return 500
  leaking Prisma internals, the same bug class as `offset=-1`. Both statuses are now pinned.
- **Registration with an omitted key, not an empty string.** A missing key is a separate code path
  from `''`. Probed 2026-10-11: this server returns 422 either way and names each missing field,
  which `auth.spec.ts` now asserts per field.

- **A malformed token is rejected by a write endpoint.** `articles.spec.ts` sends four malformed
  shapes to `POST /api/articles` — garbage after the scheme, a scheme with no token, a token with
  no scheme, and a truncated JWT — and asserts 401 for each. Probed 2026-10-11; all four are
  rejected. The read-side case was already covered in `auth.spec.ts`.
- **Strict zod schemas** — all six are `z.strictObject`, so an undeclared response field fails the
  test instead of being silently stripped. See #7 above.
- **`article` is no longer typed as present on a non-2xx.** The old entry asked for it to be typed
  optional; the Raw/wrapper split solved it structurally instead. A wrapper asserts the status
  before it reads a payload, so a happy path cannot reach an undefined one, and a negative test
  calls the `…Raw` twin and never sees a payload at all. No caller has to check.
- **Four tests that could not fail** were rewritten on 2026-10-11: `limit=0`, `limit=999999`, the
  feed test, and the comments "empty initially" test. Each asserted something true regardless of
  what the server returned. See #1 and #7 above.

Not planned: rate limiting (#6, server doesn't implement it), expired-token tests (#2, no way to mint or age a token against this server), direct DB assertions (#8, no DB access).
