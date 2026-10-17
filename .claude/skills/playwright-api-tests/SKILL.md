---
name: playwright-api-tests
description: Use when writing, reviewing, or auditing API test suites in Playwright with TypeScript - adding auth edge cases, validation/422 tests, zod response-schema checks, end-to-end journey tests, or assessing coverage of an existing suite. Covers the two-method API layer (Raw + wrapper), cleanup that can actually fail, test independence under fullyParallel, and the ways an API test passes while proving nothing.
---

# Playwright API test suites

API-only testing: `APIRequestContext`, no browser. This skill holds the architecture and the
traps. The references hold the per-task detail.

## Pick the reference

| Task | Read |
|---|---|
| Auth edge cases — 401, 403, token shapes | `references/auth-tests.md` |
| Validation — 422 per required field | `references/validation-tests.md` |
| Runtime response schemas with zod | `references/schema-tests.md` |
| A multi-step journey test | `references/e2e-flow.md` |
| Audit an existing suite for gaps | `references/suite-audit.md` |

## The two-method API layer

Keep HTTP out of the specs. One class per resource, **two methods per endpoint**:

```typescript
async getBySlugRaw(slug: string): Promise<APIResponse>   // negative tests
async getBySlug(slug: string): Promise<Article>          // happy paths
```

- **`xxxRaw()`** returns the response untouched and asserts nothing, so any status resolves
  normally. Negative tests need it: they want the status, the raw text, the error envelope —
  everything a parsed payload throws away.
- **`xxx()`** calls the Raw method, asserts the status that endpoint really returns, and returns
  the typed payload. Because the status is checked first, the payload is always there, so nothing
  downstream has to ask whether it exists.

Which one a test calls says what kind of test it is:

```typescript
// Happy path — createArticle() asserts the 201 itself, so no status line here.
const article = await api.createArticle({ title, description, body });
expect(article.slug).toBeTruthy();

// Negative path — Raw, because the wrapper would fail the test on the 422.
const response = await api.createArticleRaw({ description, body } as CreateArticleInput);
expect(response.status()).toBe(422);
```

**Make every method `async`, the Raw ones included.** A Raw method is a one-line pass-through, so
`async` plus `return await` buys only a stack frame. Write it anyway, so no caller has to read a
signature to decide whether to await.

**Two helpers do the shared work inside the wrappers.**

`expectStatus(response, expected)` — asserts the status and puts the server's own words in the
message. A bare `expect(status).toBe(201)` says only that the number was wrong; the body usually
says why. Take **no label**: the URL comes from `response.url()`, so it cannot drift from the
request actually sent, and it arrives with the query string. `APIResponse` has no `method()`, so
the verb is not available — the test name and the trace have it.

```typescript
export async function expectStatus(response: APIResponse, expected: number): Promise<void> {
  const actual = response.status();
  if (actual === expected) return;
  const body = (await response.text()).slice(0, 300);
  const message = `${response.url()}: expected ${expected}, got ${actual}. Response body: ${body || '<empty>'}`;
  expect(actual, message).toBe(expected);
}
```

`unwrap(body, key)` — pulls the payload out of its envelope and throws if the key is missing.
Otherwise a missing key goes quietly `undefined` and surfaces far away as `Expected array,
received undefined`. **Dig only when the payload is nested:** if the endpoint already returns the
shape you want, return `response.json()` as it stands.

## Cleanup must be able to fail

A silent cleanup failure looks identical to a healthy test, and leaks state into later runs.

```typescript
await cleanup(`article ${article.slug}`, () => api.deleteRaw(article.slug));
```

**`.catch()` does not work here.** Playwright's `failOnStatusCode` defaults to `false`, so a Raw
method never throws on a non-2xx. A 403 or 404 resolves normally and `.catch` never runs:

```typescript
// BROKEN — cannot detect a failed cleanup
await api.delete(slug).catch(error => console.warn('Cleanup failed:', error));
```

Verified against a live server: a cross-user delete returned 403, this logged nothing, and the
resource was still there.

`cleanup()` checks the status *and* catches throws, warns, and adds an annotation so it appears in
the HTML and Allure reports. It never rethrows — a cleanup problem must not mask the real result.
**Pass it the Raw method**: the wrapper asserts its own 204, which would turn a failed cleanup into
a failed test, the exact thing `cleanup()` prevents.

## Test independence

Every test creates its own data and cleans up after itself. Never read data another test created.
`beforeAll` is for a single shared read-only value at most. Everything must survive
`fullyParallel: true`.

## Probe the live API before asserting

A server deviates from its own spec, and a test generated from the spec will fail. Probe with
`curl`, then write the assertion, then record what you found in the project's rules file.

Examples found this way on one RealWorld/Conduit server — illustrations of the *kind* of thing to
look for, not facts about your target:

- `Bearer` accepted as well as the documented `Token`, and the scheme case-sensitive
- `limit=0` falling back to the default page because `0` is falsy server-side
- a fractional `limit=1.5` returning 500 with a raw Prisma error, while `limit=abc` is ignored
- an anonymous read returning only pre-seeded data, so the suite never sees its own writes

## Tests that pass while proving nothing

The failure mode that hides inside a green suite. Full list in `references/suite-audit.md`.

- **A loop that can iterate zero times.** Assert the array is non-empty above it, with a message.
- **A structure check standing in for a behaviour check.** `expect(Array.isArray(x))` where the
  point was that the list is empty.
- **A `test.fail()` that can never report.** `test.fail()` marks the whole test, so a status
  assertion *under* it is recorded as expected-failure when the server is fixed — green forever,
  nobody told. Put the status check **above** the marker.
- **A value that was echoed, not stored.** Re-fetch to prove persistence; the create response only
  proves the server repeated your input.

## Keep the generated tests' sources honest

Any file that teaches these patterns — a CLAUDE.md, a slash command, a doc — contains code that
nothing compiles, so it rots silently while every test still passes. When a pattern is retired,
fix those files in the same change, and prefer a check that fails the build over a reminder.
