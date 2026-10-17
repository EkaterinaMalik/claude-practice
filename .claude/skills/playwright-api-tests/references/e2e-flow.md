# End-to-end journey test

One test that chains a realistic sequence, to catch what isolated tests cannot: state carried
between operations.

## A representative journey

1. **Register** a secondary user — the target of a relationship
2. **Register + login** the actor via the auth-context helper
3. **Follow** the target → assert the relationship flag flipped
4. **Create** the main resource → assert its id/slug is truthy
5. **Add a child resource** (a comment)
6. **Update** the main resource, including the field the id derives from
7. **Verify the update persisted** with a separate GET
8. **Verify the child still resolves** under the new id
9. **Delete the child** → verify it is gone
10. **Unfollow** → assert the flag flipped back
11. **Delete** the main resource
12. **Verify it is gone** → Raw, expect 404

## Wrappers assert their own status

There is no `status` to destructure. A step asserts on the payload:

```typescript
await test.step('Follow target user', async () => {
  const profile = await profilesApi.follow(targetUsername);
  expect(profile.following).toBe(true);
});
```

The one place Raw is needed is the final check, where the error status *is* the expected answer:

```typescript
await test.step('Verify the article is gone', async () => {
  const response = await articlesApi.getBySlugRaw(article.slug);
  expect(response.status()).toBe(404);
});
```

## Key patterns

- **A derived id changes when its source field changes.** If the slug is generated from the title,
  updating the title gives a new slug, and every later call must use it. Keep the whole object in
  `let article: Article` — not just the slug — so later steps have every field.

  ```typescript
  const updated = await articlesApi.update(article.slug, updates);
  expect(updated.title).toBe(updates.title);
  article = updated;   // carry the new slug forward
  ```

- **`test.step` per phase.** The HTML report then shows collapsible, individually-timed steps and
  points a failure at the phase that broke, instead of one opaque block. No `page` fixture is
  needed — the callback is `async () => {}` whatever the outer test uses.
- **`try/finally` around everything after login**, so the context is always disposed.
- **Two contexts**: the secondary user needs no token, so register it through a bare context and
  dispose it immediately; the actor gets the auth-context helper.

## Shape

```typescript
test('register → follow → create → comment → update → verify → delete → verify gone', async ({ playwright }) => {
  let targetUsername: string;

  await test.step('Register a target user to follow', async () => {
    const targetId = uniqueId();
    targetUsername = `u_${targetId}`;
    const setupCtx = await playwright.request.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { 'Content-Type': 'application/json' },
    });
    await new AuthApi(setupCtx).register({
      username: targetUsername,
      email: generateEmail('tgt', targetId),
      password: TEST_PASSWORD,
    });
    await setupCtx.dispose();
  });

  const actorCtx = await createAuthContext();
  const articlesApi = new ArticlesApi(actorCtx);

  try {
    let article: Article;

    await test.step('Create article', async () => {
      article = await articlesApi.createArticle({ title, description, body, tagList });
      expect(article.slug).toBeTruthy();
    });

    // ... remaining steps, each in its own await test.step(...)
  } finally {
    await actorCtx.dispose();
  }
});
```

## Every verification must use the right caller

If anonymous reads see only pre-seeded data — which is common — a verification step run without
the actor's context verifies nothing and still passes. Route every GET in this flow through the
actor.
