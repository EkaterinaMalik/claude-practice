import { test, expect, APIRequestContext } from '@playwright/test';
import { ArticlesApi } from '../support/api/ArticlesApi';
import { CommentsApi } from '../support/api/CommentsApi';
import { createAuthContext } from '../support/helpers';

test.describe('Comments', () => {
  let authCtx: APIRequestContext;
  let articlesApi: ArticlesApi;
  let commentsApi: CommentsApi;
  let articleSlug: string;

  test.beforeAll(async ({ playwright }) => {
    authCtx = await createAuthContext(playwright);
    articlesApi = new ArticlesApi(authCtx);
    commentsApi = new CommentsApi(authCtx);

    const { article } = await articlesApi.create({
      title: `Cmts ${Date.now()}`,
      description: 'For comment tests',
      body: 'Article body for comment tests.',
      tagList: [],
    });
    articleSlug = article.slug;
  });

  test.afterAll(async () => {
    if (articleSlug) {
      await articlesApi.delete(articleSlug).catch(() => {});
    }
    await authCtx.dispose();
  });

  test('GET /api/articles/:slug/comments — returns empty array initially', async ({ request }) => {
    const publicComments = new CommentsApi(request);
    const { status, comments } = await publicComments.list(articleSlug);

    expect(status).toBe(200);
    expect(Array.isArray(comments)).toBe(true);
  });

  test('POST /api/articles/:slug/comments — adds a comment when authenticated', async () => {
    const { status, comment } = await commentsApi.create(articleSlug, 'This is a test comment from Playwright.');

    expect(status).toBe(200);
    expect(comment.id).toBeTruthy();
    expect(comment.body).toBe('This is a test comment from Playwright.');
    expect(comment.author).toBeDefined();
  });

  test('POST /api/articles/:slug/comments — returns 401 without auth', async ({ request }) => {
    const publicComments = new CommentsApi(request);
    const { status } = await publicComments.create(articleSlug, 'Unauthenticated comment attempt.');
    expect(status).toBe(401);
  });

  test('DELETE /api/articles/:slug/comments/:id — returns 401 without token', async ({ request }) => {
    const { comment } = await commentsApi.create(articleSlug, 'Comment for auth delete test.');

    const { status } = await new CommentsApi(request).delete(articleSlug, comment.id);
    expect(status).toBe(401);

    await commentsApi.delete(articleSlug, comment.id).catch(() => {});
  });

  test('DELETE /api/articles/:slug/comments/:id — deletes own comment', async () => {
    const { comment } = await commentsApi.create(articleSlug, 'Comment to be deleted.');

    const { status } = await commentsApi.delete(articleSlug, comment.id);
    expect(status).toBe(200);

    const { comments } = await commentsApi.list(articleSlug);
    expect(comments.find(c => c.id === comment.id)).toBeUndefined();
  });

  test('POST /api/articles/:slug/comments — returns 422 when body is missing', async () => {
    const { status, errors } = await commentsApi.create(articleSlug, undefined);
    expect(status).toBe(422);
    expect(errors?.body).toBeDefined();
  });

  test('POST /api/articles/:slug/comments — returns 422 when body is empty', async () => {
    const { status, errors } = await commentsApi.create(articleSlug, '');
    expect(status).toBe(422);
    expect(errors?.body).toBeDefined();
  });
});

//{"comment":{}}
//{"comment":{"body":""}}
