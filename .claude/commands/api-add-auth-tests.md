# Add Auth Edge Case Tests

Generate the full set of authentication edge case tests for the specified endpoint(s).

## Usage
`/api-add-auth-tests <endpoint>` — e.g. `/api-add-auth-tests POST /api/articles`

If no endpoint is given, review all write endpoints in the current suite and add missing auth tests for each.

## Tests to generate for each endpoint

1. **Missing token → 401** — call the endpoint with no `Authorization` header (use the unauthenticated `request` fixture, not an auth context).
2. **Malformed token → 401** — call with `Authorization: Token not-a-real-token`. Create a bare `playwright.request.newContext` with that header manually.
3. **Cross-user access → 403** (for endpoints that operate on a specific resource, e.g. PUT/DELETE on an article) — create two independent auth contexts (`ownerCtx` and `otherCtx`), owner creates the resource, other user attempts the operation.

## Placement

Add tests to an `Auth protection` describe block in the relevant spec file. Each test must be fully independent: create any needed resources inside the test and clean up afterward. Log cleanup errors instead of swallowing them silently — see the pattern reference.

The missing-token test is a single call + assert — leave it flat, no `test.step` needed. The cross-user 403 test has three distinct phases (owner setup, attacker attempt, cleanup) — wrap each in `test.step`, and keep the full created resource object in an outer-scope variable (e.g. `let article: Article`) rather than narrowing to just the slug.

## Pattern reference

```typescript
test('POST /api/articles — returns 401 without token', async ({ request }) => {
  const { status } = await new ArticlesApi(request).create({ ... });
  expect(status).toBe(401);
});

test('PUT /api/articles/:slug — returns 403 when editing another user\'s article', async ({ playwright }) => {
  let ownerCtx: APIRequestContext;
  let otherCtx: APIRequestContext;
  let article: Article;

  await test.step('Owner registers and creates an article', async () => {
    ownerCtx = await createAuthContext(playwright);
    const { article: created } = await new ArticlesApi(ownerCtx).create({ ... });
    article = created;
  });

  await test.step('Second user registers and attempts to edit the article', async () => {
    otherCtx = await createAuthContext(playwright);
    const { status } = await new ArticlesApi(otherCtx).update(article.slug, { title: 'hijacked' });
    expect(status).toBe(403);
  });

  await test.step('Cleanup: delete article and dispose contexts', async () => {
    await new ArticlesApi(ownerCtx).delete(article.slug).catch((error) => {
      console.warn('Cleanup failed:', error);
    });
    await ownerCtx.dispose();
    await otherCtx.dispose();
  });
});
```
