import { test, expect } from '@playwright/test';
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
    const { articles } = await api.getAll({ limit: 1 });
    const slug = articles[0].slug;

    const start = Date.now();
    const { status } = await api.getBySlug(slug);
    const duration = Date.now() - start;

    expect(status).toBe(200);
    expect(duration).toBeLessThan(THRESHOLD_MS);
  });

  test('POST /api/users/login — responds within 2000ms', async ({ playwright }) => {
    const id = uniqueId();
    const email = generateEmail('perf', id);
    const ctx = await playwright.request.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { 'Content-Type': 'application/json' },
    });
    const api = new AuthApi(ctx);
    await api.register({ username: `u_${id}`, email, password: TEST_PASSWORD });

    const start = Date.now();
    const { status } = await api.login({ email, password: TEST_PASSWORD });
    const duration = Date.now() - start;

    expect(status).toBe(200);
    expect(duration).toBeLessThan(THRESHOLD_MS);

    await ctx.dispose();
  });

  test('GET /api/user — responds within 2000ms when authenticated', async ({ playwright }) => {
    const authCtx = await createAuthContext(playwright);

    const start = Date.now();
    const { status } = await new AuthApi(authCtx).getCurrentUser();
    const duration = Date.now() - start;

    expect(status).toBe(200);
    expect(duration).toBeLessThan(THRESHOLD_MS);

    await authCtx.dispose();
  });
});
