import { test, expect, APIRequestContext } from '@playwright/test';
import { ProfilesApi } from '../support/api/ProfilesApi';
import { AuthApi } from '../support/api/AuthApi';
import { createAuthContext, uniqueId, generateEmail, API_BASE, TEST_PASSWORD, cleanup } from '../support/helpers';

async function createTargetUser(playwright: any): Promise<string> {
  const id = uniqueId();
  const username = `u_${id}`;
  const ctx = await playwright.request.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
  });
  await new AuthApi(ctx).register({ username, email: generateEmail('tgt', id), password: TEST_PASSWORD });
  await ctx.dispose();
  return username;
}

test.describe('Profiles', () => {
  test('GET /api/profiles/:username — returns profile for a known user', async ({ request, playwright }) => {
    const username = await createTargetUser(playwright);
    const api = new ProfilesApi(request);

    const profile = await api.get(username);

    expect(profile.username).toBe(username);
    expect(profile.following).toBe(false);
    expect('bio' in profile).toBe(true);
    expect('image' in profile).toBe(true);
  });

  test('GET /api/profiles/:username — returns 404 for non-existent user', async ({ request }) => {
    const api = new ProfilesApi(request);
    const response = await api.getRaw('this_user_does_not_exist_99999');
    expect(response.status()).toBe(404);
  });

  test('POST /api/profiles/:username/follow — follows a user when authenticated', async ({ playwright }) => {
    let targetUsername: string;
    let authCtx: APIRequestContext;
    let api: ProfilesApi;

    await test.step('Register target user and actor', async () => {
      targetUsername = await createTargetUser(playwright);
      authCtx = await createAuthContext();
      api = new ProfilesApi(authCtx);
    });

    await test.step('Follow target user', async () => {
      const profile = await api.follow(targetUsername);
      expect(profile.following).toBe(true);
      expect(profile.username).toBe(targetUsername);
    });

    await test.step('Cleanup: unfollow and dispose context', async () => {
      await cleanup(`unfollow ${targetUsername}`, () => api.unfollowRaw(targetUsername));
      await authCtx.dispose();
    });
  });

  test('DELETE /api/profiles/:username/follow — unfollows a user when authenticated', async ({ playwright }) => {
    let targetUsername: string;
    let authCtx: APIRequestContext;
    let api: ProfilesApi;

    await test.step('Register target user, actor, and follow', async () => {
      targetUsername = await createTargetUser(playwright);
      authCtx = await createAuthContext();
      api = new ProfilesApi(authCtx);
      await api.follow(targetUsername);
    });

    await test.step('Unfollow target user', async () => {
      const profile = await api.unfollow(targetUsername);
      expect(profile.following).toBe(false);
    });

    await test.step('Cleanup: dispose context', async () => {
      await authCtx.dispose();
    });
  });

  test('POST /api/profiles/:username/follow — returns 401 without token', async ({ request }) => {
    const api = new ProfilesApi(request);
    const response = await api.followRaw('any-user');
    expect(response.status()).toBe(401);
  });

  test('DELETE /api/profiles/:username/follow — returns 401 without token', async ({ request }) => {
    const response = await new ProfilesApi(request).unfollowRaw('any-user');
    expect(response.status()).toBe(401);
  });
});
