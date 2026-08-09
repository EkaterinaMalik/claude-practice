import { test, expect } from '@playwright/test';
import { ArticlesApi } from '../support/api/ArticlesApi';
import { CommentsApi } from '../support/api/CommentsApi';
import { ProfilesApi } from '../support/api/ProfilesApi';
import { AuthApi } from '../support/api/AuthApi';
import { createAuthContext, uniqueId, generateEmail, API_BASE, TEST_PASSWORD } from '../support/helpers';

test.describe('End-to-end — Full social flow', () => {
  test('register → follow → create article → update article → comment → verify → delete comment → unfollow → delete article → verify gone', async ({ playwright }) => {
    let targetUsername: string;

    await test.step('Register a target user to follow', async () => {
      const targetId = uniqueId();
      targetUsername = `u_${targetId}`;
      const setupCtx = await playwright.request.newContext({
        baseURL: API_BASE,
        extraHTTPHeaders: { 'Content-Type': 'application/json' },
      });
      await new AuthApi(setupCtx).register({
        username: targetUsername,
        email: generateEmail('tgt', targetId),
        password: TEST_PASSWORD,
      });
      await setupCtx.dispose();
    });

    const actorCtx = await createAuthContext(playwright);
    const articlesApi = new ArticlesApi(actorCtx);
    const commentsApi = new CommentsApi(actorCtx);
    const profilesApi = new ProfilesApi(actorCtx);

    try {
      await test.step('Follow target user', async () => {
        const { status, profile } = await profilesApi.follow(targetUsername);
        expect(status).toBe(200);
        expect(profile.following).toBe(true);
      });

      let slug: string;
      let commentId: number;

      await test.step('Create article', async () => {
        const { status, article } = await articlesApi.create({
          title: `E2E Flow ${uniqueId()}`,
          description: 'End-to-end flow test article',
          body: 'This article is created as part of the full social flow test.',
          tagList: [],
        });
        expect(status).toBe(201);
        expect(article.slug).toBeTruthy();
        slug = article.slug;
      });

      await test.step('Add comment (before updating the article)', async () => {
        const { status, comment } = await commentsApi.create(slug, 'End-to-end test comment.');
        expect(status).toBe(200);
        expect(comment.id).toBeTruthy();
        expect(comment.body).toBe('End-to-end test comment.');
        commentId = comment.id;
      });

      const updatedTitle = `E2E Updated ${uniqueId()}`;
      const updatedDescription = 'Updated description for the e2e flow test.';
      const updatedBody = 'Updated body for the e2e flow test.';

      await test.step('Update article (title, description, body) with a comment already present', async () => {
        const { status, article } = await articlesApi.update(slug, {
          title: updatedTitle,
          description: updatedDescription,
          body: updatedBody,
        });
        expect(status).toBe(200);
        expect(article.title).toBe(updatedTitle);
        expect(article.description).toBe(updatedDescription);
        expect(article.body).toBe(updatedBody);

        // Updating the title changes the slug — use the returned slug from here on
        slug = article.slug;
      });

      await test.step('Verify update persisted via a separate fetch', async () => {
        const { article: fetched } = await articlesApi.getBySlug(slug);
        expect(fetched.title).toBe(updatedTitle);
        expect(fetched.body).toBe(updatedBody);
      });

      await test.step('Verify comment is still present after the update', async () => {
        const { status, comments } = await commentsApi.list(slug);
        expect(status).toBe(200);
        expect(comments.find(c => c.id === commentId)).toBeDefined();
      });

      await test.step('Delete comment and verify it is gone', async () => {
        const { status } = await commentsApi.delete(slug, commentId);
        expect(status).toBe(200);

        const { comments: commentsAfterDelete } = await commentsApi.list(slug);
        expect(commentsAfterDelete.find(c => c.id === commentId)).toBeUndefined();
      });

      await test.step('Unfollow target user', async () => {
        const { status, profile } = await profilesApi.unfollow(targetUsername);
        expect(status).toBe(200);
        expect(profile.following).toBe(false);
      });

      await test.step('Delete article and verify 404', async () => {
        const { status } = await articlesApi.delete(slug);
        expect(status).toBe(204);

        const { status: notFoundStatus } = await articlesApi.getBySlug(slug);
        expect(notFoundStatus).toBe(404);
      });
    } finally {
      await actorCtx.dispose();
    }
  });
});
