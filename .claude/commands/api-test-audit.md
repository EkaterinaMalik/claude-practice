# API Test Suite Audit

Review the suite against the "8 API Testing Mistakes" framework and update the gap analysis.

## Steps

1. Read everything in `tests/` and `support/`.
2. Evaluate against each mistake:
   - **#1 Happy paths only** — validation tests: missing fields, empty strings, boundary values, special characters?
   - **#2 Auth edge cases ignored** — missing token (401), malformed token (401), cross-user access (403), on every write endpoint?
   - **#3 Error response structure not tested** — is the full `{ errors: { field: string[] } }` shape asserted, not just that `errors` exists? Does any response leak internals?
   - **#4 No response time checks** — assertions on critical endpoints?
   - **#5 Isolation only** — at least one end-to-end flow covering a realistic journey?
   - **#6 Rate limits ignored** — does the API rate-limit? If so, is it tested?
   - **#7 Response schema not validated** — zod schemas for runtime field types, and are they `strictObject`?
   - **#8 Database state not verified** — does a separate GET confirm a mutation persisted, rather than trusting the write's own response?
3. Mark each ✅ covered / ⚠️ partial / ❌ missing, and name the specific gap.
4. Update `TEST_RECOMMENDATIONS.md`: the Remaining Work table, the suite-state line, and the audit date.

## Verify before you write

**Four statements in the 2026-09-16 audit looked obviously true and were wrong.** The schemas were not strict, the "missing fields" test sent empty strings rather than omitting keys, the threshold rule was already documented elsewhere, and special characters were only tested on one field. Read the real files and confirm the claim. A stale doc is worse than no doc: it is confidently wrong, and it is believed.

Probe the live API rather than reasoning from the RealWorld spec — this server deviates in ways that will make a generated test fail. See the "Key constraints discovered from the live API" section of `CLAUDE.md`, and re-probe anything you are about to assert.

## Look for tests that pass regardless of server behaviour

This is the failure mode that hides in a green suite, and it has been found here four separate times:

- **A loop that can iterate zero times.** An anonymous read sees only pre-seeded data, so a loop over the response can run zero times and pass. A schema test validated zero comments for months. Every loop needs a non-empty assertion above it.
- **A structure check standing in for a behaviour check.** Asserting `Array.isArray(articles)` when the point of the test was that `limit=0` returns an empty page.
- **A `test.fail()` that can never report.** `test.fail()` marks the whole test, so a status assertion placed *under* it is recorded as an expected failure when the server is fixed — green forever, with nobody told. Put the status check **above** the marker. This is not hypothetical: it is what caught the `offset=-1` fix on 2026-10-17.
- **A value that was echoed, not stored.** Asserting on the create response proves the server repeated your input. Re-fetch to prove it was stored.

## Update the whole record, not just the table

When the audit changes anything, in the same change:

- `TEST_RECOMMENDATIONS.md` — the table, the suite-state line, the test count, the audit date
- `PROJECT_FILES.md` — total count and the per-spec counts
- `CLAUDE.md` — any new live-API constraint you discovered
- `.claude/commands/` — if the audit changed an approach, the commands teach the old one

Check the whole file for contradictions before declaring anything closed. Section lists ("Gaps to address") go stale independently of the Remaining Work table, and a reader who scrolls to the section instead of the table will rebuild tests that already exist.

Keep every entry actionable: name the endpoint and the kind of test needed.
