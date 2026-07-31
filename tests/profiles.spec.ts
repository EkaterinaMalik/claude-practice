import { test, expect } from '@playwright/test';
import { ProfilesApi } from '../support/api/ProfilesApi';
import { AuthApi } from '../support/api/AuthApi';
import { createAuthContext, uniqueId, generateEmail, API_BASE, TEST_PASSWORD } from '../support/helpers';

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

    const { status, profile } = await api.get(username);

    expect(status).toBe(200);
    expect(profile.username).toBe(username);
    expect(profile.following).toBe(false);
    expect('bio' in profile).toBe(true);
    expect('image' in profile).toBe(true);
  });

  test('GET /api/profiles/:username — returns 404 for non-existent user', async ({ request }) => {
    const api = new ProfilesApi(request);
    const { status } = await api.get('this_user_does_not_exist_99999');
    expect(status).toBe(404);
  });

  test('POST /api/profiles/:username/follow — follows a user when authenticated', async ({ playwright }) => {
    const targetUsername = await createTargetUser(playwright);
    const authCtx = await createAuthContext(playwright);
    const api = new ProfilesApi(authCtx);

    const { status, profile } = await api.follow(targetUsername);
    expect(status).toBe(200);
    expect(profile.following).toBe(true);
    expect(profile.username).toBe(targetUsername);

    await api.unfollow(targetUsername);
    await authCtx.dispose();
  });

  test('DELETE /api/profiles/:username/follow — unfollows a user when authenticated', async ({ playwright }) => {
    const targetUsername = await createTargetUser(playwright);
    const authCtx = await createAuthContext(playwright);
    const api = new ProfilesApi(authCtx);

    await api.follow(targetUsername);

    const { status, profile } = await api.unfollow(targetUsername);
    expect(status).toBe(200);
    expect(profile.following).toBe(false);

    await authCtx.dispose();
  });

  test('POST /api/profiles/:username/follow — returns 401 without token', async ({ request }) => {
    const api = new ProfilesApi(request);
    const { status } = await api.follow('any-user');
    expect(status).toBe(401);
  });

  test('DELETE /api/profiles/:username/follow — returns 401 without token', async ({ request }) => {
    const { status } = await new ProfilesApi(request).unfollow('any-user');
    expect(status).toBe(401);
  });
});
