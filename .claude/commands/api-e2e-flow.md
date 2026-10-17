# Generate End-to-End Flow Test

Generate a multi-step journey test for the main resource.

## Usage
`/api-e2e-flow` — reads the project to find the main resource and generates the test.

## The journey

Create `tests/e2e-flow.spec.ts` (or add to it) with one test chaining:

1. **Register** a secondary user — the target to follow
2. **Register + login** the actor, via `createAuthContext()`
3. **Follow** the target → `profile.following === true`
4. **Create** the article → slug is truthy
5. **Add a comment**
6. **Update** the article, title included → assert each changed field, and carry the new article forward
7. **Verify the update persisted** with a separate GET on the new slug
8. **Verify the comment is still there** under the new slug
9. **Delete the comment** → verify it is gone
10. **Unfollow** → `profile.following === false`
11. **Delete the article**
12. **Verify it is gone** → `getBySlugRaw` returns 404

## Wrappers assert their own status

There is no `status` to destructure. `follow()` asserts the 200 and returns a `Profile`; `createArticle()` asserts the 201 and returns an `Article`; `delete()` asserts the 204 and returns `void`. So a step asserts on the payload, not the status:

```typescript
await test.step('Follow target user', async () => {
  const profile = await profilesApi.follow(targetUsername);
  expect(profile.following).toBe(true);
});
```

The one place you need Raw is step 12, where 404 is the expected answer:

```typescript
await test.step('Verify the article is gone', async () => {
  const response = await articlesApi.getBySlugRaw(article.slug);
  expect(response.status()).toBe(404);
});
```

## Key patterns

- **The slug changes when the title changes.** After `update(slug, { title })` the server generates a new slug. Use the returned article for every later call, and keep the whole object in `let article: Article` — not just the slug — so later steps have every field.
- **Two contexts.** The target is registered through a bare context; the actor gets `createAuthContext()`, which takes **no arguments**.
- **`test.step` per phase.** The HTML report then shows collapsible, individually-timed steps and points a failure at the phase that broke. No `page` fixture is needed — the callback is `async () => {}`.
- **`try/finally` around everything after the actor logs in**, so `actorCtx.dispose()` always runs.

## Cleanup must be able to fail

Use `cleanup()` from `support/helpers.ts`, and pass it the **Raw** method:

```typescript
await cleanup(`article ${article.slug}`, () => articlesApi.deleteRaw(article.slug));
```

**Never `.catch()`.** A Raw method does not throw on a non-2xx response — Playwright's `failOnStatusCode` defaults to `false` — so a 403 or 404 resolves normally and `.catch` never runs. A cleanup that deleted nothing then looks exactly like one that worked. `cleanup()` checks the status *and* catches throws, warns, and adds a `cleanup-failed` annotation so it shows up in the HTML and Allure reports. It never rethrows, so a cleanup problem cannot mask the real result.

Pass the Raw method, not the wrapper: `delete()` asserts its own 204, which would turn a failed cleanup into a failed test.

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
  const commentsApi = new CommentsApi(actorCtx);
  const profilesApi = new ProfilesApi(actorCtx);

  try {
    let article: Article;

    await test.step('Create article', async () => {
      article = await articlesApi.createArticle({ title, description, body, tagList });
      expect(article.slug).toBeTruthy();
    });

    await test.step('Update article attributes', async () => {
      const updated = await articlesApi.update(article.slug, updates);
      expect(updated.title).toBe(updates.title);
      article = updated;   // the slug changed with the title
    });

    // ... remaining steps, each in its own await test.step(...)
  } finally {
    await actorCtx.dispose();
  }
});
```

## One thing this server does that will surprise you

**An anonymous read only ever sees the pre-seeded data.** `GET /api/articles` returns the same 10 seeded articles no matter what the suite created, `?author=<user>` comes back empty, and `GET /api/articles/:slug/comments` returns an empty array even for an article that has comments. Every verification step in this flow must run through the actor's context, or it will verify nothing and still pass.
