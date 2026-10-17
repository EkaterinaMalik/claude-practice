# Add Auth Edge Case Tests

Generate the authentication edge cases for an endpoint.

## Usage
`/api-add-auth-tests <endpoint>` — e.g. `/api-add-auth-tests POST /api/articles`

If no endpoint is given, review every write endpoint and add what is missing.

## Tests to generate

1. **No token → 401** — call through the plain `request` fixture, which carries no `Authorization` header.
2. **Malformed token → 401** — build a bare context with a broken header. Cover the shapes separately: garbage after the scheme, a scheme with no token, a token with no scheme, a truncated JWT.
3. **Cross-user access → 403** — for endpoints acting on a specific resource (PUT/DELETE on an article). Two independent contexts: the owner creates it, the other user attempts the operation.

## Use the Raw method

A wrapper asserts the status that endpoint really returns, so `createArticle()` fails the test on the 401 you came to assert. Raw returns the `APIResponse` untouched:

```typescript
test('POST /api/articles — returns 401 without token', async ({ request }) => {
  const response = await new ArticlesApi(request).createArticleRaw({ title, description, body });
  expect(response.status()).toBe(401);
});
```

## Know what this server actually does before asserting

Probed 2026-10-11 against the live API:

- **`Bearer` is accepted as well as `Token`.** The RealWorld spec says `Token <jwt>`, but `Bearer <jwt>` returns 200 on `GET /api/user` and 201 on `POST /api/articles`. **A test asserting 401 for `Bearer` will fail.** Pin the leniency instead.
- **The scheme is case-sensitive.** `token` and `bearer` both give 401. That is worth a test.
- All four malformed shapes give 401 on a write endpoint.

Probe first. Do not generate a test from the spec and assume this server follows it.

## Cross-user test — the shape

```typescript
test('PUT /api/articles/:slug — returns 403 when editing another user\'s article', async () => {
  let ownerCtx: APIRequestContext;
  let otherCtx: APIRequestContext;
  let article: Article;

  await test.step('Owner registers and creates an article', async () => {
    ownerCtx = await createAuthContext();          // no arguments
    article = await new ArticlesApi(ownerCtx).createArticle({ title, description, body });
  });

  await test.step('Second user attempts to edit it', async () => {
    otherCtx = await createAuthContext();
    const response = await new ArticlesApi(otherCtx).updateRaw(article.slug, { title: 'hijacked' });
    expect(response.status()).toBe(403);
  });

  await test.step('Cleanup: delete the article and dispose both contexts', async () => {
    await cleanup(`article ${article.slug}`, () => new ArticlesApi(ownerCtx).deleteRaw(article.slug));
    await ownerCtx.dispose();
    await otherCtx.dispose();
  });
});
```

Keep the whole `Article` in the outer variable, not just the slug — a later step or a later edit will want another field.

## Cleanup must be able to fail

Use `cleanup()` from `support/helpers.ts`, and **pass it the Raw method**.

**Do not use `.catch()`.** A Raw method never throws on a non-2xx response, because Playwright's `failOnStatusCode` defaults to `false`. A 403 or 404 resolves normally, so `.catch` never runs and a cleanup that did nothing looks identical to a healthy one. Verified against the live server: a cross-user delete returned 403, the old pattern logged nothing, and the article was still there.

Pass the Raw method and not the wrapper: `delete()` asserts its own 204, which would turn a failed cleanup into a failed test — the exact thing `cleanup()` exists to prevent.

## Placement

An `Auth protection` describe block in the relevant spec. Each test creates its own data and cleans up after itself, so it is safe under `fullyParallel: true`.

The no-token test is one call and one assert — leave it flat. The cross-user test has three phases — use `test.step` for each.
