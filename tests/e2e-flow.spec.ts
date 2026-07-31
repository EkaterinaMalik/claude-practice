import { test, expect } from '@playwright/test';
import { ArticlesApi } from '../support/api/ArticlesApi';
import { CommentsApi } from '../support/api/CommentsApi';
import { ProfilesApi } from '../support/api/ProfilesApi';
import { AuthApi } from '../support/api/AuthApi';
import { createAuthContext, uniqueId, generateEmail, API_BASE, TEST_PASSWORD } from '../support/helpers';

test.describe('End-to-end — Full social flow', () => {
  test('register → follow → create article → update article → comment → verify → delete comment → unfollow → delete article → verify gone', async ({ playwright }) => {
    // --- Setup: register a target user to follow ---
    const targetId = uniqueId();
    const targetUsername = `u_${targetId}`;
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

    // --- Actor: register + login ---
    const actorCtx = await createAuthContext(playwright);
    const articlesApi = new ArticlesApi(actorCtx);
    const commentsApi = new CommentsApi(actorCtx);
    const profilesApi = new ProfilesApi(actorCtx);

    try {
      // 1. Follow target user
      const { status: followStatus, profile: followedProfile } = await profilesApi.follow(targetUsername);
      expect(followStatus).toBe(200);
      expect(followedProfile.following).toBe(true);

      // 2. Create article
      const { status: createStatus, article } = await articlesApi.create({
        title: `E2E Flow ${uniqueId()}`,
        description: 'End-to-end flow test article',
        body: 'This article is created as part of the full social flow test.',
        tagList: [],
      });
      expect(createStatus).toBe(201);
      expect(article.slug).toBeTruthy();

      // 3. Add comment (before updating the article)
      const { status: commentStatus, comment } = await commentsApi.create(
        article.slug,
        'End-to-end test comment.'
      );
      expect(commentStatus).toBe(200);
      expect(comment.id).toBeTruthy();
      expect(comment.body).toBe('End-to-end test comment.');

      // 4. Update article (title, description, body) with a comment already present
      const updatedTitle = `E2E Updated ${uniqueId()}`;
      const updatedDescription = 'Updated description for the e2e flow test.';
      const updatedBody = 'Updated body for the e2e flow test.';
      const { status: updateStatus, article: updatedArticle } = await articlesApi.update(article.slug, {
        title: updatedTitle,
        description: updatedDescription,
        body: updatedBody,
      });
      expect(updateStatus).toBe(200);
      expect(updatedArticle.title).toBe(updatedTitle);
      expect(updatedArticle.description).toBe(updatedDescription);
      expect(updatedArticle.body).toBe(updatedBody);

      // Updating the title changes the slug — use updatedArticle.slug from here on
      const slug = updatedArticle.slug;

      const { article: fetchedArticle } = await articlesApi.getBySlug(slug);
      expect(fetchedArticle.title).toBe(updatedTitle);
      expect(fetchedArticle.body).toBe(updatedBody);

      // 5. Verify comment is still present after the update
      const { status: listStatus, comments } = await commentsApi.list(slug);
      expect(listStatus).toBe(200);
      expect(comments.find(c => c.id === comment.id)).toBeDefined();

      // 6. Delete comment and verify it's gone
      const { status: deleteCommentStatus } = await commentsApi.delete(slug, comment.id);
      expect(deleteCommentStatus).toBe(200);

      const { comments: commentsAfterDelete } = await commentsApi.list(slug);
      expect(commentsAfterDelete.find(c => c.id === comment.id)).toBeUndefined();

      // 7. Unfollow target user
      const { status: unfollowStatus, profile: unfollowedProfile } = await profilesApi.unfollow(targetUsername);
      expect(unfollowStatus).toBe(200);
      expect(unfollowedProfile.following).toBe(false);

      // 8. Delete article and verify 404
      const { status: deleteArticleStatus } = await articlesApi.delete(slug);
      expect(deleteArticleStatus).toBe(204);

      const { status: notFoundStatus } = await articlesApi.getBySlug(slug);
      expect(notFoundStatus).toBe(404);
    } finally {
      await actorCtx.dispose();
    }
  });
});
