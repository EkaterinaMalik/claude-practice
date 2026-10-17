# Auditing an API test suite

Framework: the "8 API Testing Mistakes" checklist. Mark each ✅ covered / ⚠️ partial / ❌ missing,
and name the specific endpoint and test type for every gap.

| # | Mistake | What to look for |
|---|---|---|
| 1 | Happy paths only | validation tests: missing fields, empty strings, boundary values, special characters — on **every** field, not just the first |
| 2 | Auth edge cases ignored | missing token (401), malformed token (401), cross-user access (403), on every write endpoint |
| 3 | Error response structure not tested | is the full envelope asserted, or only that `errors` exists? does any response leak a stack trace or ORM internals? |
| 4 | No response time checks | assertions on critical endpoints, at ~3× measured time |
| 5 | Isolation only | at least one end-to-end journey |
| 6 | Rate limits ignored | does the API rate-limit? if so, is it tested? |
| 7 | Response schema not validated | runtime schemas — and are they **strict**? |
| 8 | Database state not verified | does a separate GET confirm a mutation persisted, rather than trusting the write's own response? |

## Verify before you write

**Four statements in one audit looked obviously true and were all wrong**: the schemas were not
strict, the "missing fields" test sent empty strings rather than omitting keys, the threshold rule
was already documented elsewhere, and special characters were tested on only one field.

Read the real files. Probe the live API rather than reasoning from its published spec. A stale
audit is worse than no audit: it is confidently wrong, and it is believed. The specific damage is
that it lists work as outstanding that is already done, so the work nearly gets done twice.

## Hunt for tests that pass regardless of server behaviour

This is the highest-value part of an audit, because these tests sit inside a green suite.

- **A loop that can iterate zero times.** If an anonymous read sees only seeded data, a loop over
  the response can run zero times and pass. Every loop needs a non-empty assertion above it.
- **A structure check standing in for a behaviour check.** `expect(Array.isArray(articles))` where
  the point of the test was that `limit=0` returns an *empty* page. Assert the behaviour.
- **A `test.fail()` that can never report.** `test.fail()` marks the whole test. A status
  assertion placed *under* it is recorded as an expected failure the day the server is fixed —
  green forever, nobody told. Put the status check **above** the marker:

  ```typescript
  // Above test.fail(): if the server stops returning 500, this is genuinely red.
  expect(response.status(), 'status changed — re-check this known bug').toBe(500);

  test.fail();

  // Below: the actual bug. If the server stops leaking while still returning 500,
  // Playwright reports "Expected to fail, but passed" — also red.
  const text = await response.text();
  for (const pattern of LEAK_PATTERNS) {
    expect(text).not.toContain(pattern);
  }
  ```

  This is not hypothetical. On one suite it is exactly what caught a server-side fix: CI went red
  with `Expected: 500, Received: 200`, and the bug tracker had done its job.

- **A value that was echoed, not stored.** Asserting on the create response only proves the server
  repeated your input. Re-fetch to prove persistence.
- **A vacuous "larger than total" page.** `expect(articles).toHaveLength(articlesCount)` passes
  when both are zero. Add `expect(articles.length).toBeGreaterThan(0)`.

## Known server bugs belong in the suite

When the server is wrong in a way you cannot fix, record it with `test.fail()` and a comment
giving expected vs actual. Do not skip it and do not work around it. The failing test is a bug
tracker entry that resolves itself the day the server is fixed — provided the status check sits
above the marker.

## Update the whole record, not just the table

When an audit changes anything, in the same change:

- the audit document — table, suite-state line, test count, audit date
- the file inventory — total and per-spec counts
- the project rules file — any new live-API constraint discovered
- **anything that generates tests** — slash commands, skills, docs. They contain code that nothing
  compiles, so they rot silently. Prefer a check that fails the build over a reminder.

Check the whole document for contradictions before declaring anything closed. Per-section gap
lists go stale independently of the summary table, and a reader who scrolls to the section instead
of the table will rebuild tests that already exist.
