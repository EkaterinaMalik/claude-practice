import { test, expect, APIRequestContext } from '@playwright/test';
import { ArticlesApi } from '../support/api/ArticlesApi';
import { CommentsApi } from '../support/api/CommentsApi';
import { createAuthContext, uniqueId } from '../support/helpers';
import { ErrorSchema } from '../support/schemas';

const LEAK_PATTERNS = ['PrismaClient', 'prisma.', 'at Object.', 'at Module.', 'node_modules'];

test.describe('Error responses — Shape and safety', () => {
  let authCtx: APIRequestContext;
  let articlesApi: ArticlesApi;
  let articleSlug: string;

  test.beforeAll(async ({ playwright }) => {
    authCtx = await createAuthContext(playwright);
    articlesApi = new ArticlesApi(authCtx);

    const { article } = await articlesApi.create({
      title: `ErrTest ${uniqueId()}`,
      description: 'For error response tests',
      body: 'Article body for error response tests.',
    });
    articleSlug = article.slug;
  });

  test.afterAll(async () => {
    if (articleSlug) {
      await articlesApi.delete(articleSlug).catch((error) => {
        console.warn('Cleanup failed:', error);
      });
    }
    await authCtx.dispose();
  });

  // --- Error shape: { errors: { field: string[] } } ---

  test('POST /api/users — 422 body matches ErrorSchema', async ({ request }) => {
    const response = await request.post('/api/users', {
      data: { user: { username: '', email: '', password: '' } },
    });
    expect(response.status()).toBe(422);
    ErrorSchema.parse(await response.json());
  });

  test('POST /api/articles — 422 body matches ErrorSchema', async () => {
    const response = await authCtx.post('/api/articles', {
      data: { article: { description: 'no title', body: 'body' } },
    });
    expect(response.status()).toBe(422);
    ErrorSchema.parse(await response.json());
  });

  test('POST /api/articles/:slug/comments — 422 body matches ErrorSchema', async () => {
    const response = await authCtx.post(`/api/articles/${articleSlug}/comments`, {
      data: { comment: { body: '' } },
    });
    expect(response.status()).toBe(422);
    ErrorSchema.parse(await response.json());
  });

  // --- No internal data leak on 422 responses ---

  test('POST /api/users — 422 response does not expose stack trace or internals', async ({ request }) => {
    const response = await request.post('/api/users', {
      data: { user: { username: '', email: '', password: '' } },
    });
    const text = await response.text();
    for (const pattern of LEAK_PATTERNS) {
      expect(text, `Response must not contain "${pattern}"`).not.toContain(pattern);
    }
  });

  test('POST /api/articles — 422 response does not expose stack trace or internals', async () => {
    const response = await authCtx.post('/api/articles', {
      data: { article: { description: 'no title', body: 'body' } },
    });
    const text = await response.text();
    for (const pattern of LEAK_PATTERNS) {
      expect(text, `Response must not contain "${pattern}"`).not.toContain(pattern);
    }
  });

  // --- Known server bug: 500 leaks raw Prisma internals ---

  test('GET /api/articles?offset=-1 — 500 response should not expose internals [known server bug]', async ({ request }) => {
    test.fail(); // Server currently returns raw Prisma error text — tracked as a known bug
    const response = await request.get('/api/articles?limit=1&offset=-1');
    expect(response.status()).toBe(500);
    const text = await response.text();
    for (const pattern of LEAK_PATTERNS) {
      expect(text, `Response must not contain "${pattern}"`).not.toContain(pattern);
    }
  });
});
