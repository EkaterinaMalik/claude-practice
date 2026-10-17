# Auth edge case tests

## What to generate per endpoint

1. **No token → 401** — call through the plain `request` fixture, which carries no `Authorization`.
2. **Malformed token → 401** — a bare context with a broken header. Cover the shapes separately:
   garbage after the scheme, a scheme with no token, a token with no scheme, a truncated JWT.
3. **Cross-user access → 403** — for endpoints acting on a specific resource. Two independent
   contexts: the owner creates it, the other user attempts the operation.

## Use the Raw method

A wrapper asserts the status the endpoint really returns, so it fails the test on the 401 you came
to assert.

```typescript
test('POST /api/articles — returns 401 without token', async ({ request }) => {
  const response = await new ArticlesApi(request).createArticleRaw({ title, description, body });
  expect(response.status()).toBe(401);
});
```

## Table-driven for the token shapes

```typescript
const malformed: Record<string, string> = {
  'garbage after the scheme': 'Token not-a-real-token',
  'scheme with no token': 'Token ',
  'token with no scheme': 'not-a-real-token',
  'truncated JWT': 'Token eyJhbGciOiJIUzI1NiJ9.truncated',
};

for (const [label, header] of Object.entries(malformed)) {
  const ctx = await playwright.request.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { 'Content-Type': 'application/json', Authorization: header },
  });
  try {
    const response = await new ArticlesApi(ctx).createArticleRaw({ title, description, body });
    expect(response.status(), `${label} — must be rejected`).toBe(401);
  } finally {
    await ctx.dispose();
  }
}
```

The label in the message is the point. Without it a failure says only that 201 is not 401, and you
cannot tell which shape produced it.

## Probe before asserting

**Do not generate these from the API's spec.** Servers are lenient in ways the spec does not
mention, and a test asserting the strict behaviour fails on day one.

Check at minimum:

- which auth schemes are accepted — a server documented as `Token <jwt>` may also accept `Bearer`
- whether the scheme is case-sensitive — `token` and `bearer` often are rejected while `Token` is not
- whether a write endpoint rejects what a read endpoint rejects

Where the server is lenient, **pin the leniency** rather than asserting the stricter behaviour,
and say in a comment that it deviates from the spec. A test that fails because the server is
lenient teaches nothing; a test that records the leniency tells you the day it changes.

## Cross-user test shape

```typescript
test('PUT /api/articles/:slug — 403 when editing another user\'s article', async () => {
  let ownerCtx: APIRequestContext;
  let otherCtx: APIRequestContext;
  let article: Article;

  await test.step('Owner registers and creates an article', async () => {
    ownerCtx = await createAuthContext();
    article = await new ArticlesApi(ownerCtx).createArticle({ title, description, body });
  });

  await test.step('Second user attempts to edit it', async () => {
    otherCtx = await createAuthContext();
    const response = await new ArticlesApi(otherCtx).updateRaw(article.slug, { title: 'hijacked' });
    expect(response.status()).toBe(403);
  });

  await test.step('Cleanup', async () => {
    await cleanup(`article ${article.slug}`, () => new ArticlesApi(ownerCtx).deleteRaw(article.slug));
    await ownerCtx.dispose();
    await otherCtx.dispose();
  });
});
```

Keep the whole resource object in the outer variable, not just its id — a later step or a later
edit will want another field.

## The auth-context helper

One helper that registers and logs in a throw-away user, returning a context with the token
attached. It should take **no arguments** — anything it needs comes from env.

It must **fail fast and loudly**: assert the register and login statuses, check a token came back,
and throw a message naming the function, the user, expected vs actual status, and the first 300
characters of the body. It runs inside `beforeAll`, so a silent failure there surfaces later as an
unrelated `TypeError` in a test that looks unconnected to the cause.

## Placement

An `Auth protection` describe block in the relevant spec. The no-token test is one call and one
assert — leave it flat. The cross-user test has three phases — `test.step` each.
