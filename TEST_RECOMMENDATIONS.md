# API Test Coverage Recommendations
### Based on: *8 API Testing Mistakes That Keep QA Engineers at Junior Level* — Aston Cook

**Suite state when last audited:** 2026-10-17 — 86 tests across 9 spec files. A full run reports
86 passed. **Four** of those are expected `test.fail()` markers tracking known server bugs, so the
runner counts them as passing while they keep failing:

| Bug | Tracked in |
|---|---|
| `limit=1.5` / `offset=1.5` return 500 leaking Prisma internals | `error-response.spec.ts` |
| Follow / unfollow an unknown username, comment on an unknown slug — same leak | `error-response.spec.ts` |
| `limit=0` returns the default page instead of an empty one | `articles.spec.ts` |
| Favouriting twice as the same user counts twice | `articles.spec.ts` |

`npm run typecheck` is clean.

**The suite caught a server fix on 2026-10-17.** `offset=-1` had crashed with a 500 leaking Prisma
internals; it now returns 200 with the `offset=0` page. CI went red on the tracker's status
assertion, which is exactly what that assertion is there for. The leak did not disappear, it
narrowed to fractional values, so the tracker was repointed at `limit=1.5` / `offset=1.5` and the
`articles.spec.ts` test became a positive one.

> Keep this file in sync with `tests/`. Whenever a spec file is added, removed, or
> meaningfully changed, re-check the section it belongs to and update the ✅ / gap lists below.

---

## What changed since the 2026-09-16 audit

**This section is a record of that audit, not of the suite today.** The counts in it are the
counts of the day; the current figure is in the suite-state line at the top of this file.

At that point no test had been added or removed — the count was still 72. What changed was that
several of them began testing something they had previously only appeared to test. That is a
coverage change, so it belongs here.

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

- ✅ Special characters / injection strings in article **body** and **description** as well as
  `title`. Each one is re-fetched after the write, so the test proves the value was *stored* rather
  than echoed back by the create response. Added 2026-10-11.
- ✅ Non-numeric pagination params. `limit=abc` and `offset=abc` are ignored and return the default
  page — the behaviour was undefined, now it is pinned. A fractional value is a different story and
  is tracked as a server bug; see Mistake #3. Added 2026-10-11.
- ✅ Genuinely **omitted** registration fields, keys absent rather than `''`. A separate code path:
  the value arrives as `undefined`. This server returns 422 either way and names each missing
  field, which `auth.spec.ts` now asserts per field. Added 2026-10-11.

**No gaps outstanding for this mistake.**

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

- ✅ Malformed token against a **write** endpoint. `POST /api/articles` is sent four malformed
  shapes — garbage after the scheme, a scheme with no token, a token with no scheme, and a
  truncated JWT — and all four give 401. Added 2026-10-11; the read path was already covered.
- ✅ Token in the wrong header scheme. **This server accepts `Bearer`.** `GET /api/user` returns 200 and `POST /api/articles` returns 201 with a valid token under `Bearer`; the RealWorld spec says `Token`. `auth.spec.ts` pins the leniency rather than asserting a 401, which would fail. It also pins that the scheme is case-sensitive: `token` and `bearer` give 401.
**One gap outstanding, and it is not actionable:** expired tokens. There is no way to mint or age
a token against this server, so it stays out of scope unless the target API changes.

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

One open item, and it is a dated one:

| Priority | Item | Mistake | Effort |
|----------|------|---------|--------|
| 1 | **Revisit the `ubuntu-24.04` pin after 2026-11-19.** `runs-on` was pinned on 2026-10-17 because GitHub migrates `ubuntu-latest` to Ubuntu 26 gradually from 10-19 to 11-19. Mid-window, two runs of the same commit can land on different images, and `performance.spec.ts` asserts five 2000 ms thresholds — a borderline timing flipping on a kernel change is indistinguishable from a real regression. After the window: drop the pin, or move to `ubuntu-26.04` and re-measure the thresholds deliberately. **A pin left forever eventually fails when 24.04 is retired.** | #4 | Low |

Everything the "8 API Testing Mistakes" checklist asked for has been written; the last of those
items — the deprecated Node 20 actions — closed on 2026-10-17.

**That is a statement about this checklist, not about the suite.** Coverage gaps the checklist
never asked about are still gaps, and the live API keeps changing underneath the suite —
`offset=-1` was fixed the same week. Re-run the audit rather than trusting this line.

Numbers in the table get renumbered as items close, so do not cite them from a code comment;
describe the work instead. Three comments in `tests/` cited numbers that had drifted onto
unrelated items before this was fixed.

Re-checked against the live API on 2026-10-17.

**Done since the last audit:**

- **Eight tests from a coverage probe on 2026-10-17.** Every endpoint was already hit, so the gaps
  were behaviours rather than endpoints, and each was probed against the live API before a line was
  written:
  - **`favoritesCount` can be inflated by one account.** Favouriting the same article twice as the
    same user returns 200 both times and counts twice. A seeded article shows 2269 favourites.
    Tracked with `test.fail()`.
  - **The feed's positive case was untested.** The suite only proved an empty feed stays empty,
    which would also pass if the feed were broken. Following an author now has to surface their
    article.
  - **Three more routes to the Prisma leak** — follow an unknown username, unfollow an unknown
    username, comment on an unknown slug. Statuses pinned in `profiles.spec.ts` and
    `comments.spec.ts`, the leak tracked in `error-response.spec.ts`.
  - **Self-following is permitted** (200, `following: true`). Pinned as leniency rather than
    asserted as a 422, the same way `Bearer` is in `auth.spec.ts`.
  - **A cross-user comment delete returns 404 with an empty body**, where articles return 403. The
    comment survives, so the protection works — only the status and shape differ.
  - **Unfollowing a real user you never followed is a clean 200 no-op.** Worth pinning so it is not
    "fixed" into a 404. An earlier draft assumed *this* was the 500 case and was wrong; the status
    assertion caught it before the test was committed.

- **Every action in the CI workflow is off the deprecated Node 20 runtime.** The backlog named one
  action, `dorny/test-reporter@v1`. Bumping it to `v3` (`v2` is `node20` too) made the runner's
  warning name three more: `actions/checkout@v4`, `actions/setup-node@v4` and
  `actions/upload-artifact@v4`, all `node20`. All four were bumped on 2026-10-17 and the warning is
  gone. The breaking changes between `v4` and `v7` were checked against this workflow first:
  `checkout@v7` blocks fork checkouts for `pull_request_target`, which this workflow does not use;
  `setup-node@v5`/`v6` changed cache auto-detection, and this workflow passes `cache: npm`
  explicitly; `upload-artifact@v7`'s new `archive` input is opt-in.
- **The runner image is pinned to `ubuntu-24.04`.** `ubuntu-latest` migrates to Ubuntu 26 between
  2026-10-19 and 2026-11-19, and this suite has wall-clock assertions. Pinned 2026-10-17; the pin
  is temporary and is the one open item in the table above. (This was first written here as a
  "nothing to do yet" note under Done — which is precisely where a dated item goes to be missed.)
- **Every spec now goes through the API layer.** `error-response.spec.ts` was the last file calling
  `request.*` directly. Those calls existed because the classes used to discard the raw body, and
  this spec asserts on it — leak patterns via `response.text()`, and the exact `{ errors: … }`
  envelope. A Raw method hands the `APIResponse` back untouched, so the reason was gone. Migrated
  2026-10-17: `getAllRaw` for the article call, `registerRaw` for the two registration ones.
- **A duplicate tag test was removed.** `tags.spec.ts` asserted `tags.length > 0` in its own test
  and again in `'returns array of tag strings'` directly above, which also checks the type of every
  element. The weaker one went on 2026-10-17, which is why the count dropped by one.

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
