import { test, expect, APIRequestContext } from '@playwright/test';
import { ArticlesApi } from '../support/api/ArticlesApi';
import { TagsApi } from '../support/api/TagsApi';
import { AuthApi } from '../support/api/AuthApi';
import { createAuthContext, generateEmail, API_BASE, TEST_PASSWORD, uniqueId } from '../support/helpers';

const THRESHOLD_MS = 2000;

test.describe('Performance — Response time checks', () => {
  test('GET /api/articles — responds within 2000ms', async ({ request }) => {
    const start = Date.now();
    const { status } = await new ArticlesApi(request).getAll({ limit: 10 });
    const duration = Date.now() - start;

    expect(status).toBe(200);
    expect(duration).toBeLessThan(THRESHOLD_MS);
  });

  test('GET /api/tags — responds within 2000ms', async ({ request }) => {
    const start = Date.now();
    const { status } = await new TagsApi(request).getAll();
    const duration = Date.now() - start;

    expect(status).toBe(200);
    expect(duration).toBeLessThan(THRESHOLD_MS);
  });

  test('GET /api/articles/:slug — responds within 2000ms', async ({ request }) => {
    const api = new ArticlesApi(request);
    let slug: string;

    await test.step('Fetch a sample article slug', async () => {
      const { articles } = await api.getAll({ limit: 1 });
      slug = articles[0].slug;
    });

    await test.step('Measure response time for GET by slug', async () => {
      const start = Date.now();
      const { status } = await api.getBySlug(slug);
      const duration = Date.now() - start;

      expect(status).toBe(200);
      expect(duration).toBeLessThan(THRESHOLD_MS);
    });
  });

  test('POST /api/users/login — responds within 2000ms', async ({ playwright }) => {
    const id = uniqueId();
    const email = generateEmail('perf', id);
    let ctx: APIRequestContext;
    let api: AuthApi;

    await test.step('Register a user to log in with', async () => {
      ctx = await playwright.request.newContext({
        baseURL: API_BASE,
        extraHTTPHeaders: { 'Content-Type': 'application/json' },
      });
      api = new AuthApi(ctx);
      await api.register({ username: `u_${id}`, email, password: TEST_PASSWORD });
    });

    await test.step('Measure login response time', async () => {
      const start = Date.now();
      const { status } = await api.login({ email, password: TEST_PASSWORD });
      const duration = Date.now() - start;

      expect(status).toBe(200);
      expect(duration).toBeLessThan(THRESHOLD_MS);
    });

    await test.step('Cleanup: dispose context', async () => {
      await ctx.dispose();
    });
  });

  test('GET /api/user — responds within 2000ms when authenticated', async ({ playwright }) => {
    let authCtx: APIRequestContext;

    await test.step('Register and authenticate a user', async () => {
      authCtx = await createAuthContext(playwright);
    });

    await test.step('Measure GET /api/user response time', async () => {
      const start = Date.now();
      const { status } = await new AuthApi(authCtx).getCurrentUser();
      const duration = Date.now() - start;

      expect(status).toBe(200);
      expect(duration).toBeLessThan(THRESHOLD_MS);
    });

    await test.step('Cleanup: dispose context', async () => {
      await authCtx.dispose();
    });
  });
});
