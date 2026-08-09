import { test, expect, APIRequestContext } from '@playwright/test';
import { ArticlesApi } from '../support/api/ArticlesApi';
import { AuthApi } from '../support/api/AuthApi';
import { CommentsApi } from '../support/api/CommentsApi';
import { ProfilesApi } from '../support/api/ProfilesApi';
import { TagsApi } from '../support/api/TagsApi';
import { createAuthContext, uniqueId, generateEmail, API_BASE, TEST_PASSWORD } from '../support/helpers';
import {
  ArticleSchema,
  CommentSchema,
  UserSchema,
  ProfileSchema,
  TagsSchema,
} from '../support/schemas';

test.describe('Schema validation — Response shape', () => {
  let authCtx: APIRequestContext;
  let articlesApi: ArticlesApi;
  let commentsApi: CommentsApi;
  let articleSlug: string;

  test.beforeAll(async ({ playwright }) => {
    authCtx = await createAuthContext(playwright);
    articlesApi = new ArticlesApi(authCtx);
    commentsApi = new CommentsApi(authCtx);

    const { article } = await articlesApi.create({
      title: `Schema test ${uniqueId()}`,
      description: 'Created for schema validation tests',
      body: 'Schema validation test article body.',
      tagList: [],
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

  test('GET /api/articles — each article matches ArticleSchema', async ({ request }) => {
    const { status, articles } = await new ArticlesApi(request).getAll({ limit: 5 });
    expect(status).toBe(200);
    for (const article of articles) {
      ArticleSchema.parse(article);
    }
  });

  test('GET /api/articles/:slug — single article matches ArticleSchema', async ({ request }) => {
    const { status, article } = await new ArticlesApi(request).getBySlug(articleSlug);
    expect(status).toBe(200);
    ArticleSchema.parse(article);
  });

  test('GET /api/tags — response matches TagsSchema', async ({ request }) => {
    const { status, tags } = await new TagsApi(request).getAll();
    expect(status).toBe(200);
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
      const { status, profile } = await new ProfilesApi(request).get(username);
      expect(status).toBe(200);
      ProfileSchema.parse(profile);
    });
  });

  test('GET /api/user — authenticated user matches UserSchema', async () => {
    const { status, user } = await new AuthApi(authCtx).getCurrentUser();
    expect(status).toBe(200);
    UserSchema.parse(user);
  });

  test('POST /api/users — registration response matches UserSchema', async ({ playwright }) => {
    const id = uniqueId();
    const ctx = await playwright.request.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { 'Content-Type': 'application/json' },
    });
    const { status, user } = await new AuthApi(ctx).register({
      username: `u_${id}`,
      email: generateEmail('reg', id),
      password: TEST_PASSWORD,
    });
    await ctx.dispose();

    expect(status).toBe(201);
    UserSchema.parse(user);
  });

  test('POST /api/users/login — login response matches UserSchema', async ({ playwright }) => {
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
      const { status, user } = await api.login({ email, password: TEST_PASSWORD });
      expect(status).toBe(200);
      UserSchema.parse(user);
    });

    await test.step('Cleanup: dispose context', async () => {
      await ctx.dispose();
    });
  });

  test('GET /api/articles/:slug/comments — each comment matches CommentSchema', async ({ request }) => {
    await test.step('Add a comment', async () => {
      await commentsApi.create(articleSlug, 'Comment for schema validation.');
    });

    await test.step('Validate each comment in the list', async () => {
      const { status, comments } = await new CommentsApi(request).list(articleSlug);
      expect(status).toBe(200);
      for (const comment of comments) {
        CommentSchema.parse(comment);
      }
    });
  });

  test('POST /api/articles/:slug/comments — created comment matches CommentSchema', async () => {
    const { status, comment } = await commentsApi.create(articleSlug, 'Schema test comment body.');
    expect(status).toBe(200);
    CommentSchema.parse(comment);
  });
});
