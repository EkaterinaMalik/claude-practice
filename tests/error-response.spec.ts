import { test, expect, APIRequestContext } from '@playwright/test';
import { ArticlesApi } from '../support/api/ArticlesApi';
import { CommentsApi } from '../support/api/CommentsApi';
import { createAuthContext, uniqueId, cleanup } from '../support/helpers';
import { ErrorSchema } from '../support/schemas';

const LEAK_PATTERNS = ['PrismaClient', 'prisma.', 'at Object.', 'at Module.', 'node_modules'];

test.describe('Error responses — Shape and safety', () => {
  let authCtx: APIRequestContext;
  let articlesApi: ArticlesApi;
  let articleSlug: string;

  test.beforeAll(async () => {
    authCtx = await createAuthContext();
    articlesApi = new ArticlesApi(authCtx);

    const { status, article } = await articlesApi.create({
      title: `ErrTest ${uniqueId()}`,
      description: 'For error response tests',
      body: 'Article body for error response tests.',
    });
    // ArticleResult types `article` as non-optional, but it is undefined on a
    // non-2xx. Without this check a failed setup surfaces later as "Cannot read
    // properties of undefined", inside a test that looks unrelated.
    expect(status, 'setup article was not created').toBe(201);
    articleSlug = article.slug;
  });

  test.afterAll(async () => {
    if (articleSlug) {
      await cleanup(`article ${articleSlug}`, () => articlesApi.delete(articleSlug));
    }
    
    // `?.` so a failed beforeAll reports its own error, not a second TypeError here.
    await authCtx?.dispose();
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
    const response = await request.get('/api/articles?limit=1&offset=-1');

    // Asserted BEFORE test.fail() deliberately. test.fail() marks the whole test, so if
    // the status assertion sat under it and the server were fixed to return 400, the
    // failure would be recorded as "expected" and this test would stay green forever -
    // a bug tracker that can never report. Throwing here, before the marker is set,
    // makes that case genuinely red.
    expect(
      response.status(),
      'status is no longer 500 — the server behaviour changed, re-check this known bug'
    ).toBe(500);

    // The leak below is the actual known bug. If the server stops leaking while still
    // returning 500, Playwright reports "Expected to fail, but passed" — also red. So
    // both ways of fixing the server surface here.
    test.fail();

    const text = await response.text();
    for (const pattern of LEAK_PATTERNS) {
      expect(text, `Response must not contain "${pattern}"`).not.toContain(pattern);
    }
  });
});
