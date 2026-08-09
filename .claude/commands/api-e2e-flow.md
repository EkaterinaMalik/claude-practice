# Generate End-to-End Flow Test

Generate a full end-to-end flow test for the main resource in this API test project, covering a realistic multi-step user journey.

## Usage
`/api-e2e-flow` — reads the project to determine the main resource and generates the test.

## Steps to generate

1. Identify the primary resource (e.g. Article) and its related resources (e.g. Comment, Profile follow).
2. Create `tests/e2e-flow.spec.ts` (or add to it if it exists) with a single test that chains these steps in order:

   1. **Register** a secondary user (target to follow)
   2. **Register + login** the actor user via `createAuthContext`
   3. **Follow** the target user → assert `profile.following === true`
   4. **Create** the main resource → assert status 201, slug is truthy
   5. **Add a related resource** (e.g. comment) → assert it was created
   6. **Update** the main resource (including title if applicable) → assert all changed fields, capture the new slug if the title change generates one
   7. **Verify update persisted** via a separate GET using the new slug
   8. **Verify related resource still exists** under the new slug
   9. **Delete related resource** → assert success, verify via GET it is gone
   10. **Unfollow** target user → assert `profile.following === false`
   11. **Delete main resource** → assert 204
   12. **Verify main resource is gone** → assert 404

3. Wrap all steps after actor login in a `try/finally` to ensure `actorCtx.dispose()` always runs.
4. On all cleanup calls, catch and log the error rather than swallowing it silently — a bare `.catch(() => {})` looks identical to a healthy run in CI output and hides real leaked state:
   ```typescript
   await api.delete(article.slug).catch((error) => {
     console.warn('Cleanup failed:', error);
   });
   ```
5. Wrap each numbered phase in `test.step('label', async () => { ... })` instead of a plain comment — see "Group with test.step" below.

## Key patterns

- **Slug changes on title update**: after `articlesApi.update(slug, { title: newTitle })`, use the returned article's slug for all subsequent calls — the server generates a new slug from the new title. Store the full article object in an outer-scope variable (e.g. `let article: Article`), not just the slug string, so later steps have access to any field they need.
- **Two auth contexts for follow tests**: target user registered with a bare context (no token needed), actor registered with `createAuthContext`.
- **Group with `test.step`**: each numbered phase becomes its own `test.step('Follow target user', async () => { ... })` block. This makes the HTML report show collapsible, individually-timed steps and points failures straight at the phase that broke — much more useful than a plain `// 1. ...` comment. No `page` fixture is required; the callback is just `async () => {}`.

## Pattern reference (condensed)

```typescript
test('register → follow → create → add comment → update → verify → delete comment → unfollow → delete → verify gone', async ({ playwright }) => {
  let targetUsername: string;

  await test.step('Register a target user to follow', async () => {
    const targetId = uniqueId();
    targetUsername = `u_${targetId}`;
    const setupCtx = await playwright.request.newContext({ baseURL: API_BASE, extraHTTPHeaders: { 'Content-Type': 'application/json' } });
    await new AuthApi(setupCtx).register({ username: targetUsername, email: generateEmail('tgt', targetId), password: TEST_PASSWORD });
    await setupCtx.dispose();
  });

  const actorCtx = await createAuthContext(playwright);
  const articlesApi = new ArticlesApi(actorCtx);
  const commentsApi = new CommentsApi(actorCtx);
  const profilesApi = new ProfilesApi(actorCtx);

  try {
    await test.step('Follow target user', async () => {
      const { status, profile } = await profilesApi.follow(targetUsername);
      expect(status).toBe(200);
      expect(profile.following).toBe(true);
    });

    let article: Article;

    await test.step('Create article', async () => {
      const { status, article: created } = await articlesApi.create({ ... });
      expect(status).toBe(201);
      article = created;
    });

    // ... remaining steps: add comment, update (capture new slug via article = updated), verify persisted,
    // verify comment still present, delete comment, unfollow, delete article, verify 404 —
    // each in its own await test.step(...) block.
  } finally {
    await actorCtx.dispose();
  }
});
```
