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

  // Probed 2026-10-17: the server allows it — 200, with following: true. The RealWorld spec
  // does not define self-following, and most implementations reject it, so this pins the
  // leniency rather than asserting a 422 that would fail today. Same reasoning as the
  // `Bearer` scheme in auth.spec.ts: record what the server does, and find out when it changes.
  test('POST /api/profiles/:username/follow — a user is allowed to follow themselves', async () => {
    const authCtx = await createAuthContext();
    const api = new ProfilesApi(authCtx);

    try {
      const self = await new AuthApi(authCtx).getCurrentUser();
      const profile = await api.follow(self.username);

      expect(profile.username).toBe(self.username);
      expect(profile.following, 'this server permits self-following').toBe(true);

      await cleanup(`unfollow self ${self.username}`, () => api.unfollowRaw(self.username));
    } finally {
      await authCtx.dispose();
    }
  });

  // Same bug class as the fractional pagination 500: a reference the server cannot resolve
  // reaches the query layer and Prisma's own error comes back. Probed 2026-10-17 — the body
  // carries "Invalid `prisma.user.update()` invocation". A 404 would be the right answer.
  // The leak itself is tracked in error-response.spec.ts; this pins the status.
  //
  // Both verbs, because they fail through different Prisma operations — connect for follow,
  // disconnect for unfollow — and a fix to one need not fix the other.
  test('POST and DELETE /api/profiles/:username/follow — an unknown username returns 500', async () => {
    const authCtx = await createAuthContext();
    const api = new ProfilesApi(authCtx);

    try {
      for (const [label, call] of Object.entries({
        follow: () => api.followRaw(`ghost_${uniqueId()}`),
        unfollow: () => api.unfollowRaw(`ghost_${uniqueId()}`),
      })) {
        const response = await call();
        expect(response.status(), `${label} an unknown user — known server bug, expected 404`)
          .toBe(500);
      }
    } finally {
      await authCtx.dispose();
    }
  });

  // The counterpart, and the reason the test above says "unknown username" rather than
  // "no such follow". Probed 2026-10-17: unfollowing a real user you never followed is a
  // clean 200 no-op, which is correct and worth pinning so it is not "fixed" into a 404.
  // An earlier version of these tests assumed this case was the 500 and was wrong - the
  // status assertion caught it.
  test('DELETE /api/profiles/:username/follow — unfollowing someone you never followed is a no-op', async ({ playwright }) => {
    const authCtx = await createAuthContext();

    try {
      const stranger = await createTargetUser(playwright);
      const profile = await new ProfilesApi(authCtx).unfollow(stranger);

      expect(profile.username).toBe(stranger);
      expect(profile.following, 'still not following, and no error').toBe(false);
    } finally {
      await authCtx.dispose();
    }
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
