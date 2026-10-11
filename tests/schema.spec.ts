import { test, expect, APIRequestContext } from '@playwright/test';
import { ArticlesApi } from '../support/api/ArticlesApi';
import { AuthApi } from '../support/api/AuthApi';
import { CommentsApi } from '../support/api/CommentsApi';
import { ProfilesApi } from '../support/api/ProfilesApi';
import { TagsApi } from '../support/api/TagsApi';
import { createAuthContext, uniqueId, generateEmail, API_BASE, TEST_PASSWORD, cleanup } from '../support/helpers';
import {
  ArticleSchema,
  CommentSchema,
  UserSchema,
  //!!! Added LoginUserSchema to validate login response shape, 
  // which does not return `id` field.
  LoginUserSchema,
  ProfileSchema,
  TagsSchema,
} from '../support/schemas';

// Why additional LoginUserSchema was added.
// The three endpoints return different shapes:

// POST /api/users        6 keys, with id
// GET  /api/user         6 keys, with id
// POST /api/users/login  5 keys, no id

// So, required different schema for login endpoint, 
// which does not return id field in response.

test.describe('Schema validation — Response shape', () => {
  let authCtx: APIRequestContext;
  let articlesApi: ArticlesApi;
  let commentsApi: CommentsApi;
  let articleSlug: string;

  test.beforeAll(async () => {
    authCtx = await createAuthContext();
    articlesApi = new ArticlesApi(authCtx);
    commentsApi = new CommentsApi(authCtx);

    // create() asserts the 201 and returns the article, so a failed setup fails here
    // with the server's own message rather than later as an unrelated TypeError.
    const article = await articlesApi.createArticle({
      title: `Schema test ${uniqueId()}`,
      description: 'Created for schema validation tests',
      body: 'Schema validation test article body.',
      tagList: [],
    });
    articleSlug = article.slug;
  });

  test.afterAll(async () => {
    if (articleSlug) {
      await cleanup(`article ${articleSlug}`, () => articlesApi.deleteRaw(articleSlug));
    }
    // `?.` so a failed beforeAll reports its own error, not a second TypeError here.
    await authCtx?.dispose();
  });

  test('GET /api/articles — each article matches ArticleSchema', async ({ request }) => {
    const { articles } = await new ArticlesApi(request).getAll({ limit: 5 });
    // Without this the loop below can validate nothing and still report green.
    expect(articles.length, 'no articles returned — the schema check would pass vacuously')
      .toBeGreaterThan(0);
    for (const article of articles) {
      ArticleSchema.parse(article);
    }
  });

  test('GET /api/articles/:slug — single article matches ArticleSchema', async ({ request }) => {
    const article = await new ArticlesApi(request).getBySlug(articleSlug);
    ArticleSchema.parse(article);
  });

  test('GET /api/tags — response matches TagsSchema', async ({ request }) => {
    const tags = await new TagsApi(request).getAll();
    TagsSchema.parse(tags);
  });

  test('GET /api/profiles/:username — profile matches ProfileSchema', async ({ request, playwright }) => {
    const id = uniqueId();
    const username = `u_${id}`;

    await test.step('Register a profile target user', async () => {
      const ctx = await playwright.request.newContext({
        baseURL: API_BASE,
        extraHTTPHeaders: { 'Content-Type': 'application/json' },
      });
      await new AuthApi(ctx).register({ username, email: generateEmail('sch', id), password: TEST_PASSWORD });
      await ctx.dispose();
    });

    await test.step('Fetch and validate profile', async () => {
      const profile = await new ProfilesApi(request).get(username);
      ProfileSchema.parse(profile);
    });
  });

  test('GET /api/user — authenticated user matches UserSchema', async () => {
    const user = await new AuthApi(authCtx).getCurrentUser();
    UserSchema.parse(user);
  });

  test('POST /api/users — registration response matches UserSchema', async ({ playwright }) => {
    const id = uniqueId();
    const ctx = await playwright.request.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { 'Content-Type': 'application/json' },
    });
    const user = await new AuthApi(ctx).register({
      username: `u_${id}`,
      email: generateEmail('reg', id),
      password: TEST_PASSWORD,
    });
    await ctx.dispose();

    UserSchema.parse(user);
  });

  test('POST /api/users/login — login response matches LoginUserSchema (no id)', async ({ playwright }) => {
    const id = uniqueId();
    const email = generateEmail('lgn', id);
    let ctx: APIRequestContext;
    let api: AuthApi;

    await test.step('Register a user', async () => {
      ctx = await playwright.request.newContext({
        baseURL: API_BASE,
        extraHTTPHeaders: { 'Content-Type': 'application/json' },
      });
      api = new AuthApi(ctx);
      await api.register({ username: `u_${id}`, email, password: TEST_PASSWORD });
    });

    await test.step('Log in and validate response', async () => {
      const user = await api.login({ email, password: TEST_PASSWORD });

      // LoginUserSchema, not UserSchema: this endpoint alone omits `id`.
      /// Why LoginUserSchema exists. The three endpoints return different shapes:

      // POST /api/users        6 keys, with id
      // GET  /api/user         6 keys, with id
      // POST /api/users/login  5 keys, no id

      LoginUserSchema.parse(user);
    });

    await test.step('Cleanup: dispose context', async () => {
      await ctx.dispose();
    });
  });

  test('GET /api/articles/:slug/comments — each comment matches CommentSchema', async ({ request }) => {
    await test.step('Add a comment', async () => {
      // create() asserts its own status, so a failed write stops here. Without that the
      // list below comes back empty, the loop never runs, and the test reports green
      // having validated nothing.
      await commentsApi.create(articleSlug, 'Comment for schema validation.');
    });

    await test.step('Validate each comment in the list', async () => {
      // Listed through the AUTHENTICATED context on purpose. This server returns an
      // empty comments array to unauthenticated callers, even for seeded articles, so
      // listing via the plain `request` fixture yields nothing and the loop below
      // validates nothing. See "Key constraints" in CLAUDE.md.
      const comments = await commentsApi.list(articleSlug);
      expect(comments.length, 'no comments returned — the schema check would pass vacuously')
        .toBeGreaterThan(0);
      for (const comment of comments) {
        CommentSchema.parse(comment);
      }
    });
  });

  test('POST /api/articles/:slug/comments — created comment matches CommentSchema', async () => {
    const comment = await commentsApi.create(articleSlug, 'Schema test comment body.');
    CommentSchema.parse(comment);
  });
});
