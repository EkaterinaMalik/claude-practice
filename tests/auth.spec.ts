import { test, expect, APIRequestContext } from '@playwright/test';
import { AuthApi, RegisterInput } from '../support/api/AuthApi';
import { ArticlesApi } from '../support/api/ArticlesApi';
import { API_BASE, TEST_PASSWORD, TEST_NEW_PASSWORD, TEST_AVATAR_URL, uniqueId, generateEmail, createAuthContext, cleanup } from '../support/helpers';

test.describe('Authentication', () => {
  let ctx: APIRequestContext;
  let api: AuthApi;
  let registeredEmail: string;
  const password = TEST_PASSWORD;

  test.beforeAll(async ({ playwright }) => {
    ctx = await playwright.request.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { 'Content-Type': 'application/json' },
    });
    api = new AuthApi(ctx);

    const id = uniqueId();
    registeredEmail = generateEmail('a', id);
    await api.register({
      username: `u_${id}`,
      email: registeredEmail,
      password,
    });
  });

  test.afterAll(async () => {
    // `?.` so a failed beforeAll reports its own error, not a second TypeError here.
    await ctx?.dispose();
  });

  test('POST /api/users — registers a new user successfully', async ({ request }) => {
    const freshApi = new AuthApi(request);
    const id = uniqueId();
    const email = generateEmail('a', id);

    const user = await freshApi.register({
      username: `u_${id}`,
      email,
      password: TEST_PASSWORD,
    });

    expect(user.email).toBe(email);
    expect(user.token).toBeTruthy();
    expect((user as any).password).toBeUndefined();
  });

  test('POST /api/users — returns 422 when required fields are missing', async () => {
    const response = await api.registerRaw({ username: '', email: '', password: '' });
    expect(response.status()).toBe(422);
    expect((await response.json()).errors).toBeDefined();
  });

  // Remaining Work item 4. The test above sends empty strings. Omitting a key is a different
  // code path: the value arrives as undefined rather than '', and a server can easily treat the
  // two differently. Probed 2026-10-11 — this one does not, and names each missing field.
  test('POST /api/users — returns 422 and names the field when a required key is omitted', async () => {
    const id = uniqueId();
    const cases: Record<string, { input: Partial<RegisterInput>; missing: string[] }> = {
      'all three omitted': { input: {}, missing: ['username', 'email', 'password'] },
      'username omitted': { input: { email: generateEmail('om', id), password: TEST_PASSWORD }, missing: ['username'] },
      'email omitted': { input: { username: `u_${id}`, password: TEST_PASSWORD }, missing: ['email'] },
      'password omitted': { input: { username: `u_${id}`, email: generateEmail('op', id) }, missing: ['password'] },
    };

    for (const [label, { input, missing }] of Object.entries(cases)) {
      // Deliberate violation: the cast makes the incomplete payload visible, per CLAUDE.md.
      const response = await api.registerRaw(input as RegisterInput);
      expect(response.status(), `${label} — an incomplete registration must not be accepted`).toBe(422);

      const { errors } = await response.json();
      for (const field of missing) {
        expect(errors?.[field], `${label} — the response should name "${field}"`).toBeDefined();
      }
    }
  });

  // Remaining Work item 1. The RealWorld spec says `Authorization: Token <jwt>`. This server also
  // accepts `Bearer`, so the test pins the leniency — asserting 401 here would fail. Probed
  // 2026-10-11 on a read and a write. The scheme is case-sensitive: `token` and `bearer` give 401.
  test('Authorization header — accepts Token and Bearer, and is case-sensitive', async ({ playwright }) => {
    let token: string;

    await test.step('Log in to obtain a token', async () => {
      token = (await api.login({ email: registeredEmail, password })).token;
    });

    const contextFor = (scheme: string) => playwright.request.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { 'Content-Type': 'application/json', Authorization: `${scheme} ${token}` },
    });

    await test.step('Token and Bearer both work, on a read and on a write', async () => {
      for (const scheme of ['Token', 'Bearer']) {
        const ctx = await contextFor(scheme);
        try {
          const user = await new AuthApi(ctx).getCurrentUser();
          expect(user.email, `${scheme} — read should be accepted`).toBe(registeredEmail);

          // A write too: a server can accept a scheme on reads and reject it on writes.
          const article = await new ArticlesApi(ctx).createArticle({
            title: `Scheme ${scheme} ${uniqueId()}`,
            description: 'Auth scheme test',
            body: 'Created to prove the scheme is accepted on a write.',
          });
          await cleanup(`article ${article.slug}`, () => new ArticlesApi(ctx).deleteRaw(article.slug));
        } finally {
          await ctx.dispose();
        }
      }
    });

    await test.step('A lowercase scheme is rejected', async () => {
      for (const scheme of ['token', 'bearer']) {
        const ctx = await contextFor(scheme);
        try {
          const response = await new AuthApi(ctx).getCurrentUserRaw();
          expect(response.status(), `"${scheme}" is not the same as "${scheme[0].toUpperCase()}${scheme.slice(1)}"`)
            .toBe(401);
        } finally {
          await ctx.dispose();
        }
      }
    });
  });

  test('POST /api/users/login — returns token for valid credentials', async () => {
    const user = await api.login({ email: registeredEmail, password });
    expect(user.email).toBe(registeredEmail);
    expect(user.token).toBeTruthy();
    expect(typeof user.token).toBe('string');
  });

  test('POST /api/users/login — returns error for wrong password', async () => {
    const response = await api.loginRaw({ email: registeredEmail, password: 'definitely_wrong' });
    expect([403, 422]).toContain(response.status());
  });

  test('GET /api/user — returns current user when authenticated', async ({ playwright }) => {
    let authCtx: APIRequestContext;

    await test.step('Log in to obtain token', async () => {
      const loggedIn = await api.login({ email: registeredEmail, password });
      authCtx = await playwright.request.newContext({
        baseURL: API_BASE,
        extraHTTPHeaders: {
          'Content-Type': 'application/json',
          Authorization: `Token ${loggedIn.token}`,
        },
      });
    });

    await test.step('Fetch current user with token', async () => {
      const user = await new AuthApi(authCtx).getCurrentUser();
      expect(user.email).toBe(registeredEmail);
      expect(user.token).toBeTruthy();
    });

    await test.step('Cleanup: dispose context', async () => {
      await authCtx.dispose();
    });
  });

  test('GET /api/user — returns 401 without token', async () => {
    const response = await api.getCurrentUserRaw();
    expect(response.status()).toBe(401);
  });

  test('GET /api/user — returns 401 with malformed token', async ({ playwright }) => {
    let badCtx: APIRequestContext;

    await test.step('Create context with malformed token', async () => {
      badCtx = await playwright.request.newContext({
        baseURL: API_BASE,
        extraHTTPHeaders: {
          'Content-Type': 'application/json',
          Authorization: 'Token not-a-real-token',
        },
      });
    });

    await test.step('Verify request is rejected', async () => {
      const response = await new AuthApi(badCtx).getCurrentUserRaw();
      expect(response.status()).toBe(401);
    });

    await test.step('Cleanup: dispose context', async () => {
      await badCtx.dispose();
    });
  });

  test('PUT /api/user — returns 401 without token', async () => {
    const response = await api.updateCurrentUserRaw({ bio: 'should fail' });
    expect(response.status()).toBe(401);
  });

  test('PUT /api/user — updates all user attributes', async ({ playwright }) => {
    let authCtx: APIRequestContext;

    await test.step('Register a dedicated user and log in', async () => {
      // Dedicated user so updating email/password doesn't affect shared test state
      const id = uniqueId();
      const originalEmail = generateEmail('a', id);
      const originalPassword = TEST_PASSWORD;

      const tmpCtx = await playwright.request.newContext({
        baseURL: API_BASE,
        extraHTTPHeaders: { 'Content-Type': 'application/json' },
      });
      const tmpApi = new AuthApi(tmpCtx);
      await tmpApi.register({ username: `u_${id}`, email: originalEmail, password: originalPassword });
      const loggedIn = await tmpApi.login({ email: originalEmail, password: originalPassword });
      await tmpCtx.dispose();

      authCtx = await playwright.request.newContext({
        baseURL: API_BASE,
        extraHTTPHeaders: {
          'Content-Type': 'application/json',
          Authorization: `Token ${loggedIn.token}`,
        },
      });
    });

    const newId = uniqueId();
    const updates = {
      email: generateEmail('upd', newId),
      username: `upd_${newId}`,
      bio: 'Updated bio from Playwright',
      image: TEST_AVATAR_URL,
      password: TEST_NEW_PASSWORD,
    };

    await test.step('Update all user attributes', async () => {
      const user = await new AuthApi(authCtx).updateCurrentUser(updates);
      expect(user.email).toBe(updates.email);
      expect(user.username).toBe(updates.username);
      expect(user.bio).toBe(updates.bio);
      expect(user.image).toBe(updates.image);
    });

    await test.step('Verify non-password changes persisted via a separate fetch', async () => {
      const fetched = await new AuthApi(authCtx).getCurrentUser();
      expect(fetched.email).toBe(updates.email);
      expect(fetched.username).toBe(updates.username);
      expect(fetched.bio).toBe(updates.bio);
      expect(fetched.image).toBe(updates.image);
    });

    await test.step('Verify new password works by logging in with updated credentials', async () => {
      const verifyCtx = await playwright.request.newContext({
        baseURL: API_BASE,
        extraHTTPHeaders: { 'Content-Type': 'application/json' },
      });
      // login() asserts the 200 itself — reaching the next line is the assertion.
      await new AuthApi(verifyCtx).login({
        email: updates.email,
        password: updates.password,
      });
      await verifyCtx.dispose();
    });

    await test.step('Cleanup: dispose context', async () => {
      await authCtx.dispose();
    });
  });
});
