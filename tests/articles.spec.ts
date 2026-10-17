import { test, expect, APIRequestContext } from '@playwright/test';
import { ArticlesApi, CreateArticleInput, ListArticlesParams } from '../support/api/ArticlesApi';
import { TagsApi } from '../support/api/TagsApi';
import { Article } from '../support/types';
import { createAuthContext, uniqueId, cleanup, API_BASE } from '../support/helpers';

test.describe('Articles — Public endpoints', () => {
  test('GET /api/articles — returns articles list with default pagination', async ({ request }) => {
    const api = new ArticlesApi(request);
    const { articles } = await api.getAll({ limit: 5 });

    expect(articles.length).toBeGreaterThan(0);

    const article = articles[0];
    expect(article.slug).toBeTruthy();
    expect(article.title).toBeTruthy();
    expect(Array.isArray(article.tagList)).toBe(true);
    expect(article.author.username).toBeTruthy();
  });

  test('GET /api/articles — supports limit and offset pagination', async ({ request }) => {
    const api = new ArticlesApi(request);

    // Both calls assert their own 200 inside getAll(). Before the Raw/wrapper split
    // neither status was checked here, so a 500 left both pages empty and the
    // disjointness loop below compared nothing.
    const { articles: page1 } = await api.getAll({ limit: 2, offset: 0 });
    const { articles: page2 } = await api.getAll({ limit: 2, offset: 2 });

    expect(page1.length).toBe(2);
    // Without this the disjointness loop below can compare nothing and still pass.
    expect(page2.length, 'second page is empty — nothing to check for overlap')
      .toBeGreaterThan(0);

    const page1Slugs = new Set(page1.map(a => a.slug));
    for (const a of page2) {
      expect(page1Slugs.has(a.slug)).toBe(false);
    }
  });

  test('GET /api/articles — filters by tag', async ({ request }) => {
    const tags = await new TagsApi(request).getAll();
    const knownTag = tags[0];

    const api = new ArticlesApi(request);
    const { articles } = await api.getAll({ tag: knownTag, limit: 5 });

    expect(articles.length).toBeGreaterThan(0);
    for (const article of articles) {
      expect(article.tagList).toContain(knownTag);
    }
  });

// Destructure fixtures
//  async ({ request, playwright })

//======= the save as fixtures =======

//  test('...', async (fixtures) => {
//  const request = fixtures.request;
//  const playwright = fixtures.playwright;
////
  // ...
//});

// 'request' = an anonymous API client, ready to use

//!!!!! NO Need to create HTTP client use 'request' fixture which playwright has already created !!!!

// request.post(...)
// request.get(...)
// .....
// const response = await request.post('/api/articles', {
//     data: {
//       title: 'My article',
//       description: 'Test article'
//     }
//   });

  test('GET /api/articles/:slug — returns a single article', async ({ request }) => {
    const authCtx = await createAuthContext();
    const authApi = new ArticlesApi(authCtx);
    let created: Article;

    await test.step('Create article as author', async () => {
      created = await authApi.createArticle({
        title: `PW Single ${uniqueId()}`,
        description: 'For single article fetch test',
        body: 'Single article test body.',
        tagList: [],
      });
    });

    await test.step('Fetch article as public user', async () => {
      const article = await new ArticlesApi(request).getBySlug(created.slug);
      expect(article.slug).toBe(created.slug);
      expect(article.title).toBeTruthy();
      expect(article.body).toBeDefined();
    });

    await test.step('Cleanup: delete article', async () => {
      // To test 'Annotations' section, 
      // we intentionally pass an invalid slug to cleanup to see if it handles errors
      //  gracefully.
      //await cleanup(`article ${created.slug}`, () => authApi.delete(created.slug+'kkkkkk'));
      await cleanup(`article ${created.slug}`, () => authApi.deleteRaw(created.slug));
    
      await authCtx.dispose();
    });
  });

  test('GET /api/articles/:slug — returns 404 for non-existent slug', async ({ request }) => {
    const api = new ArticlesApi(request);
    const response = await api.getBySlugRaw('this-slug-does-not-exist-99999');
    expect(response.status()).toBe(404);
  });

  test('GET /api/articles — limit=0 should return an empty page [known server bug]', async ({ request }) => {
    // getAll() asserts the 200 here, before test.fail() is set — so if the server ever starts
    // erroring on limit=0, that fails genuinely instead of being recorded as expected.
    const { articles } = await new ArticlesApi(request).getAll({ limit: 0 });

    // Known server bug: 0 is falsy on the server, so it falls back to the default page size and
    // returns all 10 seeded articles. Probed 2026-10-11 — limit=1 works, so only the falsy value
    // is affected. test.fail() makes this a bug-tracker entry: the day the server returns an empty
    // page, Playwright reports "Expected to fail, but passed" and this goes red.
    test.fail();

    expect(articles).toHaveLength(0);
  });

  test('GET /api/articles — a limit larger than the total returns every article', async ({ request }) => {
    const { articles, articlesCount } = await new ArticlesApi(request).getAll({ limit: 999999 });

    // articlesCount is the total, not the page size (limit=1 returns 1 article and a count of 10),
    // so an oversized limit must return the whole set — exactly once, nothing missing.
    // Probed 2026-10-11: limit=999999 and limit=999999999999 both return 200 with all 10 seeded
    // articles, so the server neither caps below the total nor overflows on a huge value.
    expect(articles).toHaveLength(articlesCount);

    // Guards against a vacuous pass: an empty seed would satisfy the line above with 0 === 0.
    expect(articles.length).toBeGreaterThan(0);
  });

  // This used to be 'negative offset returns 500'. The server crashed here with a raw Prisma
  // error, and CI went red on 2026-10-17 because that was fixed. Re-probed the same day: a
  // negative offset is now ignored and you get the offset=0 page, the same fallback a
  // non-numeric value gets. The fraction case below still crashes, so only part was fixed.
  test('GET /api/articles — a negative offset is ignored, not rejected', async ({ request }) => {
    const api = new ArticlesApi(request);
    const firstPage = await api.getAll({ limit: 5, offset: 0 });

    for (const offset of [-1, -99]) {
      const response = await api.getAllRaw({ limit: 5, offset });
      expect(response.status(), `offset=${offset} — expected the value to be ignored, not rejected`)
        .toBe(200);

      const { articles } = await response.json();
      // Same slugs in the same order as offset=0 — proves it fell back rather than skipping.
      expect(articles.map((a: Article) => a.slug), `offset=${offset} — should return the first page`)
        .toEqual(firstPage.articles.map(a => a.slug));
      expect(articles, `offset=${offset} — limit should still be honoured`).toHaveLength(5);
    }
  });

  // Probed 2026-10-11, still true 2026-10-17: a non-numeric value is ignored rather than
  // rejected — the server falls back to its default page, the same way limit=0 does.
  test('GET /api/articles — a non-numeric limit or offset is ignored, not rejected', async ({ request }) => {
    const api = new ArticlesApi(request);
    const baseline = await api.getAll();

    for (const params of [{ limit: 'abc' }, { offset: 'abc' }, { limit: 'abc', offset: 'abc' }]) {
      // Deliberate violation: these are typed as number, and sending a string is the point.
      const response = await api.getAllRaw(params as unknown as ListArticlesParams);
      const label = JSON.stringify(params);

      expect(response.status(), `${label} — expected the value to be ignored, not rejected`).toBe(200);
      const { articles } = await response.json();
      expect(articles, `${label} — should fall back to the default page`)
        .toHaveLength(baseline.articles.length);
    }
  });

  // Same bug class as offset=-1 above: a value Prisma cannot coerce reaches the query layer and
  // the raw error comes back. Probed 2026-10-11 — the body is
  // "Argument take: Got invalid value 1.5 on prisma.findManyArticle. Provided Float, expected Int."
  // The leak itself is tracked in error-response.spec.ts; this pins the status.
  test('GET /api/articles — a fractional limit or offset returns 500', async ({ request }) => {
    const api = new ArticlesApi(request);

    for (const params of [{ limit: 1.5 }, { offset: 1.5 }]) {
      const response = await api.getAllRaw(params as ListArticlesParams);
      expect(response.status(), `${JSON.stringify(params)} — known server bug`).toBe(500);
    }
  });
});

test.describe('Articles — Auth protection', () => {
  test('POST /api/articles — returns 401 without token', async ({ request }) => {
    const response = await new ArticlesApi(request).createArticleRaw({
      title: 'Unauthorized',
      description: 'test',
      body: 'test',
    });
    expect(response.status()).toBe(401);
  });

  test('POST /api/articles — returns 401 for a malformed token', async ({ playwright }) => {
    // auth.spec.ts covers a malformed token against a read (GET /api/user). A write is the case
    // worth pinning separately: a server that waves one through here lets anyone create data.
    // Probed 2026-10-11 — all four shapes return 401.
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
        const response = await new ArticlesApi(ctx).createArticleRaw({
          title: `Malformed token ${uniqueId()}`,
          description: 'should never be created',
          body: 'should never be created',
        });
        expect(response.status(), `${label} — a malformed token must not create an article`)
          .toBe(401);
      } finally {
        await ctx.dispose();
      }
    }
  });

  test('GET /api/articles/feed — returns 401 without token', async ({ request }) => {
    const response = await new ArticlesApi(request).getFeedRaw();
    expect(response.status()).toBe(401);
  });

  test('DELETE /api/articles/:slug — returns 401 without token', async ({ request }) => {
    const authCtx = await createAuthContext();
    let article: Article;

    await test.step('Create article as owner', async () => {
      article = await new ArticlesApi(authCtx).createArticle({
        title: `PW Auth Del ${uniqueId()}`,
        description: 'for auth test',
        body: 'for auth test',
      });
    });

    await test.step('Attempt delete without token', async () => {
      const response = await new ArticlesApi(request).deleteRaw(article.slug);
      expect(response.status()).toBe(401);
    });

    await test.step('Cleanup: delete article and dispose context', async () => {
      await cleanup(`article ${article.slug}`, () => new ArticlesApi(authCtx).deleteRaw(article.slug));
      await authCtx.dispose();
    });
  });

  test('PUT /api/articles/:slug — returns 403 when editing another user\'s article', async () => {
    let ownerCtx: APIRequestContext;
    let otherCtx: APIRequestContext;
    let article: Article;

    await test.step('Owner registers and creates an article', async () => {
      ownerCtx = await createAuthContext();
      article = await new ArticlesApi(ownerCtx).createArticle({
        title: `PW Owner ${uniqueId()}`,
        description: 'owner article',
        body: 'owner article body',
      });
    });

    await test.step('Second user registers and attempts to edit the article', async () => {
      otherCtx = await createAuthContext();
      const response = await new ArticlesApi(otherCtx).updateRaw(article.slug, { title: 'hijacked' });
      expect(response.status()).toBe(403);
    });

    await test.step('Cleanup: delete article and dispose contexts', async () => {
      await cleanup(`article ${article.slug}`, () => new ArticlesApi(ownerCtx).deleteRaw(article.slug));
      await ownerCtx.dispose();
      await otherCtx.dispose();
    });
  });

  test('DELETE /api/articles/:slug — returns 403 when deleting another user\'s article', async () => {
    let ownerCtx: APIRequestContext;
    let otherCtx: APIRequestContext;
    let article: Article;

    await test.step('Owner registers and creates an article', async () => {
      ownerCtx = await createAuthContext();
      article = await new ArticlesApi(ownerCtx).createArticle({
        title: `PW Owner Del ${uniqueId()}`,
        description: 'owner article',
        body: 'owner article body',
      });
    });

    await test.step('Second user registers and attempts to delete the article', async () => {
      otherCtx = await createAuthContext();
      const response = await new ArticlesApi(otherCtx).deleteRaw(article.slug);
      expect(response.status()).toBe(403);
    });

    await test.step('Cleanup: delete article and dispose contexts', async () => {
      await cleanup(`article ${article.slug}`, () => new ArticlesApi(ownerCtx).deleteRaw(article.slug));
      await ownerCtx.dispose();
      await otherCtx.dispose();
    });
  });
});

test.describe('Articles — Authenticated endpoints', () => {
  let authCtx: APIRequestContext;
  let api: ArticlesApi;
  let createdSlug: string;

  test.beforeAll(async () => {
    authCtx = await createAuthContext();
    api = new ArticlesApi(authCtx);
  });

  test.afterAll(async () => {
    if (createdSlug) {
      await cleanup(`article ${createdSlug}`, () => api.deleteRaw(createdSlug));
    }
    // `?.` so a failed beforeAll reports its own error, not a second TypeError here.
    await authCtx?.dispose();
  });

  test('POST /api/articles — creates a new article', async () => {
    const article = await api.createArticle({
      title: `PW Test ${Date.now()}`,
      description: 'Created by Playwright API test',
      body: 'This is the article body created during automated testing.',
      tagList: ['playwright', 'automation'],
    });

    expect(article.slug).toBeTruthy();
    expect(article.tagList).toContain('playwright');
    expect(article.author).toBeDefined();

    createdSlug = article.slug;
  });

  test('PUT /api/articles/:slug — updates all article attributes', async () => {
    let created: Article;
    let updated: Article;

    await test.step('Create article to be updated', async () => {
      // create() asserts the 201 itself and attaches the server's body on failure.
      created = await api.createArticle({
        title: `PW Pre-update ${Date.now()}`,
        description: 'Pre-update description',
        body: 'Pre-update body.',
        tagList: ['playwright'],
      });
    });

    const updates = {
      title: `Updated Title ${Date.now()}`,
      description: 'Updated description from Playwright',
      body: 'Updated body content from Playwright automated test.',
    };

    await test.step('Update article attributes', async () => {
      const article = await api.update(created.slug, updates);

      expect(article.title).toBe(updates.title);
      expect(article.description).toBe(updates.description);
      expect(article.body).toBe(updates.body);

      // Updating the title changes the slug — use the returned article from here on
      updated = article;
    });

    await test.step('Verify changes persisted via a separate fetch', async () => {
      const fetched = await api.getBySlug(updated.slug);
      expect(fetched.title).toBe(updates.title);
      expect(fetched.description).toBe(updates.description);
      expect(fetched.body).toBe(updates.body);
    });

    await test.step('Cleanup: delete the article', async () => {
      await cleanup(`article ${updated.slug}`, () => api.deleteRaw(updated.slug));
    });
  });

  test('POST /api/articles/:slug/favorite — favorites an article', async () => {
    let created: Article;

    await test.step('Create article to favorite', async () => {
      created = await api.createArticle({
        title: `PW Fav ${uniqueId()}`,
        description: 'For favorite test',
        body: 'Article for favorite test.',
        tagList: [],
      });
    });

    await test.step('Favorite the article', async () => {
      const article = await api.favorite(created.slug);
      expect(article.favorited).toBe(true);
    });

    await test.step('Cleanup: unfavorite and delete article', async () => {
      await cleanup(`unfavorite ${created.slug}`, () => api.unfavoriteRaw(created.slug));
      await cleanup(`article ${created.slug}`, () => api.deleteRaw(created.slug));
    });
  });

  test('DELETE /api/articles/:slug/favorite — unfavorites an article', async () => {
    let created: Article;

    await test.step('Create and favorite article', async () => {
      created = await api.createArticle({
        title: `PW Unfav ${uniqueId()}`,
        description: 'For unfavorite test',
        body: 'Article for unfavorite test.',
        tagList: [],
      });
      await api.favorite(created.slug);
    });

    await test.step('Unfavorite the article', async () => {
      const article = await api.unfavorite(created.slug);
      expect(article.favorited).toBe(false);
    });

    await test.step('Cleanup: delete article', async () => {
      await cleanup(`article ${created.slug}`, () => api.deleteRaw(created.slug));
    });
  });

  test('GET /api/articles/feed — is empty for a user who follows nobody', async () => {
    const { articles, articlesCount } = await api.getFeed();

    // The feed carries articles by the users you follow. This block's user follows nobody, and
    // nothing in this file calls follow, so the feed must be empty. Probed 2026-10-11: a user's
    // own articles do not appear in their own feed either, so the other tests here cannot
    // perturb this one.
    expect(articles).toHaveLength(0);
    expect(articlesCount).toBe(0);
  });

  test('DELETE /api/articles/:slug — deletes own article', async () => {
    let article: Article;

    await test.step('Create article to delete', async () => {
      article = await api.createArticle({
        title: `Del Me ${Date.now()}`,
        description: 'To be deleted',
        body: 'Will be deleted by test.',
        tagList: [],
      });
    });

    await test.step('Delete the article', async () => {
      await api.delete(article.slug);
    });

    await test.step('Verify article is gone', async () => {
      // Raw, because a 404 is the point here — the wrapper would assert 200.
      const response = await api.getBySlugRaw(article.slug);
      expect(response.status()).toBe(404);
    });
  });

  test('POST /api/articles — returns 422 when title is missing', async () => {
    // Cast is intentional: sending incomplete data to verify server-side validation
    const response = await api.createArticleRaw({ description: 'No title', body: 'Some body.' } as CreateArticleInput);
    expect(response.status()).toBe(422);
    expect((await response.json()).errors).toBeDefined();
  });

  test('POST /api/articles — returns 422 when description is missing', async () => {
    const response = await api.createArticleRaw({ title: 'No desc', body: 'Some body.' } as CreateArticleInput);
    expect(response.status()).toBe(422);
    expect((await response.json()).errors?.description).toBeDefined();
  });

  test('POST /api/articles — returns 422 when description is empty', async () => {
    const response = await api.createArticleRaw({ title: 'Empty desc', description: '', body: 'Some body.' });
    expect(response.status()).toBe(422);
    expect((await response.json()).errors?.description).toBeDefined();
  });

  test('POST /api/articles — returns 422 when body is missing', async () => {
    const response = await api.createArticleRaw({ title: 'No body', description: 'Some desc.' } as CreateArticleInput);
    expect(response.status()).toBe(422);
    expect((await response.json()).errors?.body).toBeDefined();
  });

  test('POST /api/articles — returns 422 when body is empty', async () => {
    const response = await api.createArticleRaw({ title: 'Empty body', description: 'Some desc.', body: '' });
    expect(response.status()).toBe(422);
    expect((await response.json()).errors?.body).toBeDefined();
  });

  test('POST /api/articles — stores special characters in title without mangling', async () => {
    const title = '<script>alert(1)</script>';
    let article: Article;

    await test.step('Create article with special characters in title', async () => {
      article = await api.createArticle({
        title,
        description: 'Special chars test',
        body: 'Special chars body.',
      });
    });

    await test.step('Verify title stored verbatim', async () => {
      expect(article.title).toBe(title);
    });

    await test.step('Cleanup: delete article', async () => {
      await cleanup(`article ${article.slug}`, () => api.deleteRaw(article.slug));
    });
  });

  // Remaining Work item 2. The two tests above cover `title` only. Probed 2026-10-11: all four
  // payloads are stored verbatim in `description` and `body` as well. The re-fetch matters — it
  // proves the value was stored, not merely echoed back by the create response.
  test('POST /api/articles — stores special characters in description and body without mangling', async () => {
    const payloads: Record<string, string> = {
      'script tag': '<script>alert("xss")</script>',
      'SQL injection': "'; DROP TABLE articles; --",
      'unicode and emoji': 'Ünïcødé — emoji and a check mark',
      'newlines and tabs': 'line one\nline two\ttabbed',
    };

    for (const [label, value] of Object.entries(payloads)) {
      let article: Article;

      await test.step(`Create article with ${label} in description and body`, async () => {
        article = await api.createArticle({
          title: `Special chars ${label} ${uniqueId()}`,
          description: value,
          body: value,
        });
        expect(article.description, `${label} — description in the create response`).toBe(value);
        expect(article.body, `${label} — body in the create response`).toBe(value);
      });

      await test.step(`Verify ${label} survived storage, via a separate fetch`, async () => {
        const fetched = await api.getBySlug(article.slug);
        expect(fetched.description, `${label} — description after a re-fetch`).toBe(value);
        expect(fetched.body, `${label} — body after a re-fetch`).toBe(value);
      });

      await test.step(`Cleanup: delete the ${label} article`, async () => {
        await cleanup(`article ${article.slug}`, () => api.deleteRaw(article.slug));
      });
    }
  });

  test('POST /api/articles — stores SQL injection string in title without mangling', async () => {
    const title = "' OR 1=1; --";
    let article: Article;

    await test.step('Create article with SQL injection string in title', async () => {
      article = await api.createArticle({
        title,
        description: 'SQL injection test',
        body: 'SQL injection body.',
      });
    });

    await test.step('Verify title stored verbatim', async () => {
      expect(article.title).toBe(title);
    });

    await test.step('Cleanup: delete article', async () => {
      await cleanup(`article ${article.slug}`, () => api.deleteRaw(article.slug));
    });
  });
});
