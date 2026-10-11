import { test, expect, APIRequestContext } from '@playwright/test';
import { ArticlesApi } from '../support/api/ArticlesApi';
import { CommentsApi } from '../support/api/CommentsApi';
import { Comment } from '../support/types';
import { createAuthContext, cleanup } from '../support/helpers';

test.describe('Comments', () => {
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
      title: `Cmts ${Date.now()}`,
      description: 'For comment tests',
      body: 'Article body for comment tests.',
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

  test('GET /api/articles/:slug/comments — returns an empty list for a brand-new article', async () => {
    // Its own article, not the shared one from beforeAll. Three other tests in this block add
    // comments to that article, so "no comments yet" would hang on declaration order.
    const article = await articlesApi.createArticle({
      title: `Cmts empty ${Date.now()}`,
      description: 'For the empty-list check',
      body: 'This article never gets a comment.',
      tagList: [],
    });

    try {
      // Authenticated on purpose. Anonymous comment reads on this server always come back
      // empty (see CLAUDE.md, Key constraints), so an anonymous read would pass here even if
      // the article had fifty comments.
      const comments = await commentsApi.list(article.slug);
      expect(comments).toHaveLength(0);
    } finally {
      await cleanup(`article ${article.slug}`, () => articlesApi.deleteRaw(article.slug));
    }
  });

  test('POST /api/articles/:slug/comments — adds a comment when authenticated', async () => {
    const comment = await commentsApi.create(articleSlug, 'This is a test comment from Playwright.');

    expect(comment.id).toBeTruthy();
    expect(comment.body).toBe('This is a test comment from Playwright.');
    expect(comment.author).toBeDefined();
  });

  test('POST /api/articles/:slug/comments — returns 401 without auth', async ({ request }) => {
    const publicComments = new CommentsApi(request);
    const response = await publicComments.createRaw(articleSlug, 'Unauthenticated comment attempt.');
    expect(response.status()).toBe(401);
  });

  test('DELETE /api/articles/:slug/comments/:id — returns 401 without token', async ({ request }) => {
    let comment: Comment;

    await test.step('Create comment to attempt deleting', async () => {
      comment = await commentsApi.create(articleSlug, 'Comment for auth delete test.');
    });

    await test.step('Attempt delete without token', async () => {
      const response = await new CommentsApi(request).deleteRaw(articleSlug, comment.id);
      expect(response.status()).toBe(401);
    });

    await test.step('Cleanup: delete comment', async () => {
      await cleanup(`comment ${comment.id} on ${articleSlug}`, () => commentsApi.deleteRaw(articleSlug, comment.id));
    });
  });

  test('DELETE /api/articles/:slug/comments/:id — deletes own comment', async () => {
    let comment: Comment;

    await test.step('Create comment to delete', async () => {
      comment = await commentsApi.create(articleSlug, 'Comment to be deleted.');
    });

    await test.step('Delete the comment', async () => {
      await commentsApi.delete(articleSlug, comment.id);
    });

    await test.step('Verify comment removed from list', async () => {
      const comments = await commentsApi.list(articleSlug);
      expect(comments.find(c => c.id === comment.id)).toBeUndefined();
    });
  });

  test('POST /api/articles/:slug/comments — returns 422 when body is missing', async () => {
    const response = await commentsApi.createRaw(articleSlug, undefined);
    expect(response.status()).toBe(422);
    expect((await response.json()).errors?.body).toBeDefined();
  });

  test('POST /api/articles/:slug/comments — returns 422 when body is empty', async () => {
    const response = await commentsApi.createRaw(articleSlug, '');
    expect(response.status()).toBe(422);
    expect((await response.json()).errors?.body).toBeDefined();
  });
});

//{"comment":{}}
//{"comment":{"body":""}}
