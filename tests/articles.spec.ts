import { test, expect, APIRequestContext } from '@playwright/test';
import { ArticlesApi, CreateArticleInput } from '../support/api/ArticlesApi';
import { TagsApi } from '../support/api/TagsApi';
import { createAuthContext, uniqueId } from '../support/helpers';

test.describe('Articles — Public endpoints', () => {
  test('GET /api/articles — returns articles list with default pagination', async ({ request }) => {
    const api = new ArticlesApi(request);
    const { status, articles } = await api.getAll({ limit: 5 });

    expect(status).toBe(200);
    expect(articles.length).toBeGreaterThan(0);

    const article = articles[0];
    expect(article.slug).toBeTruthy();
    expect(article.title).toBeTruthy();
    expect(Array.isArray(article.tagList)).toBe(true);
    expect(article.author.username).toBeTruthy();
  });

  test('GET /api/articles — supports limit and offset pagination', async ({ request }) => {
    const api = new ArticlesApi(request);

    const { articles: page1 } = await api.getAll({ limit: 2, offset: 0 });
    const { articles: page2 } = await api.getAll({ limit: 2, offset: 2 });

    expect(page1.length).toBe(2);

    const page1Slugs = new Set(page1.map(a => a.slug));
    for (const a of page2) {
      expect(page1Slugs.has(a.slug)).toBe(false);
    }
  });

  test('GET /api/articles — filters by tag', async ({ request }) => {
    const { tags } = await new TagsApi(request).getAll();
    const knownTag = tags[0];

    const api = new ArticlesApi(request);
    const { status, articles } = await api.getAll({ tag: knownTag, limit: 5 });

    expect(status).toBe(200);
    expect(articles.length).toBeGreaterThan(0);
    for (const article of articles) {
      expect(article.tagList).toContain(knownTag);
    }
  });

  test('GET /api/articles/:slug — returns a single article', async ({ request, playwright }) => {
    const authCtx = await createAuthContext(playwright);
    const authApi = new ArticlesApi(authCtx);

    const { article: created } = await authApi.create({
      title: `PW Single ${uniqueId()}`,
      description: 'For single article fetch test',
      body: 'Single article test body.',
      tagList: [],
    });

    const { status, article } = await new ArticlesApi(request).getBySlug(created.slug);

    expect(status).toBe(200);
    expect(article.slug).toBe(created.slug);
    expect(article.title).toBeTruthy();
    expect(article.body).toBeDefined();

    await authApi.delete(created.slug).catch(() => {});
    await authCtx.dispose();
  });

  test('GET /api/articles/:slug — returns 404 for non-existent slug', async ({ request }) => {
    const api = new ArticlesApi(request);
    const { status } = await api.getBySlug('this-slug-does-not-exist-99999');
    expect(status).toBe(404);
  });

  test('GET /api/articles — limit=0 returns a valid response', async ({ request }) => {
    const { status, articles } = await new ArticlesApi(request).getAll({ limit: 0 });
    expect(status).toBe(200);
    expect(Array.isArray(articles)).toBe(true);
  });

  test('GET /api/articles — very large limit returns a valid response', async ({ request }) => {
    const { status, articles, articlesCount } = await new ArticlesApi(request).getAll({ limit: 999999 });
    expect(status).toBe(200);
    expect(Array.isArray(articles)).toBe(true);
    expect(articles.length).toBeLessThanOrEqual(articlesCount);
  });

  test('GET /api/articles — negative offset returns 500', async ({ request }) => {
    // Server bug: offset=-1 crashes with a raw Prisma error instead of returning 400
    const { status } = await new ArticlesApi(request).getAll({ limit: 5, offset: -1 });
    expect(status).toBe(500);
  });
});

test.describe('Articles — Auth protection', () => {
  test('POST /api/articles — returns 401 without token', async ({ request }) => {
    const { status } = await new ArticlesApi(request).create({
      title: 'Unauthorized',
      description: 'test',
      body: 'test',
    });
    expect(status).toBe(401);
  });

  test('GET /api/articles/feed — returns 401 without token', async ({ request }) => {
    const { status } = await new ArticlesApi(request).getFeed();
    expect(status).toBe(401);
  });

  test('DELETE /api/articles/:slug — returns 401 without token', async ({ request, playwright }) => {
    const authCtx = await createAuthContext(playwright);
    const { article } = await new ArticlesApi(authCtx).create({
      title: `PW Auth Del ${uniqueId()}`,
      description: 'for auth test',
      body: 'for auth test',
    });

    const { status } = await new ArticlesApi(request).delete(article.slug);
    expect(status).toBe(401);

    await new ArticlesApi(authCtx).delete(article.slug).catch(() => {});
    await authCtx.dispose();
  });

  test('PUT /api/articles/:slug — returns 403 when editing another user\'s article', async ({ playwright }) => {
    const ownerCtx = await createAuthContext(playwright);
    const { article } = await new ArticlesApi(ownerCtx).create({
      title: `PW Owner ${uniqueId()}`,
      description: 'owner article',
      body: 'owner article body',
    });

    const otherCtx = await createAuthContext(playwright);
    const { status } = await new ArticlesApi(otherCtx).update(article.slug, { title: 'hijacked' });
    expect(status).toBe(403);

    await new ArticlesApi(ownerCtx).delete(article.slug).catch(() => {});
    await ownerCtx.dispose();
    await otherCtx.dispose();
  });

  test('DELETE /api/articles/:slug — returns 403 when deleting another user\'s article', async ({ playwright }) => {
    const ownerCtx = await createAuthContext(playwright);
    const { article } = await new ArticlesApi(ownerCtx).create({
      title: `PW Owner Del ${uniqueId()}`,
      description: 'owner article',
      body: 'owner article body',
    });

    const otherCtx = await createAuthContext(playwright);
    const { status } = await new ArticlesApi(otherCtx).delete(article.slug);
    expect(status).toBe(403);

    await new ArticlesApi(ownerCtx).delete(article.slug).catch(() => {});
    await ownerCtx.dispose();
    await otherCtx.dispose();
  });
});

test.describe('Articles — Authenticated endpoints', () => {
  let authCtx: APIRequestContext;
  let api: ArticlesApi;
  let createdSlug: string;

  test.beforeAll(async ({ playwright }) => {
    authCtx = await createAuthContext(playwright);
    api = new ArticlesApi(authCtx);
  });

  test.afterAll(async () => {
    if (createdSlug) {
      await api.delete(createdSlug).catch(() => {});
    }
    await authCtx.dispose();
  });

  test('POST /api/articles — creates a new article', async () => {
    const { status, article } = await api.create({
      title: `PW Test ${Date.now()}`,
      description: 'Created by Playwright API test',
      body: 'This is the article body created during automated testing.',
      tagList: ['playwright', 'automation'],
    });

    expect(status).toBe(201);
    expect(article.slug).toBeTruthy();
    expect(article.tagList).toContain('playwright');
    expect(article.author).toBeDefined();

    createdSlug = article.slug;
  });

  test('PUT /api/articles/:slug — updates all article attributes', async () => {
    const { article: created } = await api.create({
      title: `PW Pre-update ${Date.now()}`,
      description: 'Pre-update description',
      body: 'Pre-update body.',
      tagList: ['playwright'],
    });
    expect(created.slug, 'Article creation must succeed before update can be tested').toBeTruthy();

    const updates = {
      title: `Updated Title ${Date.now()}`,
      description: 'Updated description from Playwright',
      body: 'Updated body content from Playwright automated test.',
    };

    const { status, article } = await api.update(created.slug, updates);

    expect(status).toBe(200);
    expect(article.title).toBe(updates.title);
    expect(article.description).toBe(updates.description);
    expect(article.body).toBe(updates.body);

    // Verify changes persisted via a separate fetch
    const { article: fetched } = await api.getBySlug(article.slug);
    expect(fetched.title).toBe(updates.title);
    expect(fetched.description).toBe(updates.description);
    expect(fetched.body).toBe(updates.body);

    await api.delete(article.slug).catch(() => {});
  });

  test('POST /api/articles/:slug/favorite — favorites an article', async () => {
    const { article: created } = await api.create({
      title: `PW Fav ${uniqueId()}`,
      description: 'For favorite test',
      body: 'Article for favorite test.',
      tagList: [],
    });

    const { status, article } = await api.favorite(created.slug);
    expect(status).toBe(200);
    expect(article.favorited).toBe(true);

    await api.unfavorite(created.slug);
    await api.delete(created.slug).catch(() => {});
  });

  test('DELETE /api/articles/:slug/favorite — unfavorites an article', async () => {
    const { article: created } = await api.create({
      title: `PW Unfav ${uniqueId()}`,
      description: 'For unfavorite test',
      body: 'Article for unfavorite test.',
      tagList: [],
    });

    await api.favorite(created.slug);

    const { status, article } = await api.unfavorite(created.slug);
    expect(status).toBe(200);
    expect(article.favorited).toBe(false);

    await api.delete(created.slug).catch(() => {});
  });

  test('GET /api/articles/feed — returns feed for authenticated user', async () => {
    const { status, articles } = await api.getFeed();

    expect(status).toBe(200);
    expect(Array.isArray(articles)).toBe(true);
    expect(typeof articles.length).toBe('number');
  });

  test('DELETE /api/articles/:slug — deletes own article', async () => {
    const { article } = await api.create({
      title: `Del Me ${Date.now()}`,
      description: 'To be deleted',
      body: 'Will be deleted by test.',
      tagList: [],
    });

    const { status } = await api.delete(article.slug);
    expect(status).toBe(204);

    const { status: getStatus } = await api.getBySlug(article.slug);
    expect(getStatus).toBe(404);
  });

  test('POST /api/articles — returns 422 when title is missing', async () => {
    // Cast is intentional: sending incomplete data to verify server-side validation
    const { status, errors } = await api.create({ description: 'No title', body: 'Some body.' } as CreateArticleInput);
    expect(status).toBe(422);
    expect(errors).toBeDefined();
  });

  test('POST /api/articles — returns 422 when description is missing', async () => {
    const { status, errors } = await api.create({ title: 'No desc', body: 'Some body.' } as CreateArticleInput);
    expect(status).toBe(422);
    expect(errors?.description).toBeDefined();
  });

  test('POST /api/articles — returns 422 when description is empty', async () => {
    const { status, errors } = await api.create({ title: 'Empty desc', description: '', body: 'Some body.' });
    expect(status).toBe(422);
    expect(errors?.description).toBeDefined();
  });

  test('POST /api/articles — returns 422 when body is missing', async () => {
    const { status, errors } = await api.create({ title: 'No body', description: 'Some desc.' } as CreateArticleInput);
    expect(status).toBe(422);
    expect(errors?.body).toBeDefined();
  });

  test('POST /api/articles — returns 422 when body is empty', async () => {
    const { status, errors } = await api.create({ title: 'Empty body', description: 'Some desc.', body: '' });
    expect(status).toBe(422);
    expect(errors?.body).toBeDefined();
  });

  test('POST /api/articles — stores special characters in title without mangling', async () => {
    const title = '<script>alert(1)</script>';
    const { status, article } = await api.create({
      title,
      description: 'Special chars test',
      body: 'Special chars body.',
    });
    expect(status).toBe(201);
    expect(article.title).toBe(title);
    await api.delete(article.slug).catch(() => {});
  });

  test('POST /api/articles — stores SQL injection string in title without mangling', async () => {
    const title = "' OR 1=1; --";
    const { status, article } = await api.create({
      title,
      description: 'SQL injection test',
      body: 'SQL injection body.',
    });
    expect(status).toBe(201);
    expect(article.title).toBe(title);
    await api.delete(article.slug).catch(() => {});
  });
});
