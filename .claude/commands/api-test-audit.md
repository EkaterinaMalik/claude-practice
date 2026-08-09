# API Test Suite Audit

Review the current Playwright API test suite against the "8 API Testing Mistakes" framework and produce a gap analysis document.

## Steps

1. Read all files in `tests/` and `support/` to understand current coverage.
2. Evaluate the suite against each of the 8 mistakes:
   - **#1 Happy paths only** — are there validation tests (missing fields, empty strings, boundary values, special characters)?
   - **#2 Auth edge cases ignored** — are there tests for missing token (401), malformed token (401), and cross-user access (403) on all write endpoints?
   - **#3 Error response structure not tested** — do tests assert the full `{ errors: { field: string[] } }` shape, not just that `errors` exists? Do any responses leak stack traces or internals?
   - **#4 No response time checks** — are there performance assertions on critical endpoints?
   - **#5 Isolation only** — is there at least one end-to-end flow test covering a realistic multi-step user journey?
   - **#6 Rate limits ignored** — does the API implement rate limiting? If yes, are limits tested?
   - **#7 Response schema not validated** — are Zod schemas (or equivalent) used for runtime field-type validation?
   - **#8 Database state not verified** — after mutations, does a subsequent GET confirm the change persisted?
3. For each mistake, mark: ✅ covered / ⚠️ partial / ❌ missing, and list specific gaps.
4. Write the findings to `TEST_RECOMMENDATIONS.md` in the project root with a priority table (effort vs impact).

Keep the document actionable — each gap should name the specific endpoint and test type needed.
