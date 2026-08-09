import { test, expect, APIRequestContext } from '@playwright/test';
import { AuthApi } from '../support/api/AuthApi';
import { API_BASE, TEST_PASSWORD, TEST_NEW_PASSWORD, TEST_AVATAR_URL, uniqueId, generateEmail, createAuthContext } from '../support/helpers';

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
    const { status } = await api.register({
      username: `u_${id}`,
      email: registeredEmail,
      password,
    });
    expect(status).toBe(201);
  });

  test.afterAll(async () => {
    await ctx.dispose();
  });

  test('POST /api/users — registers a new user successfully', async ({ request }) => {
    const freshApi = new AuthApi(request);
    const id = uniqueId();
    const email = generateEmail('a', id);

    const { status, user } = await freshApi.register({
      username: `u_${id}`,
      email,
      password: TEST_PASSWORD,
    });

    expect(status).toBe(201);
    expect(user!.email).toBe(email);
    expect(user!.token).toBeTruthy();
    expect((user as any).password).toBeUndefined();
  });

  test('POST /api/users — returns 422 when required fields are missing', async () => {
    const { status, errors } = await api.register({ username: '', email: '', password: '' });
    expect(status).toBe(422);
    expect(errors).toBeDefined();
  });

  test('POST /api/users/login — returns token for valid credentials', async () => {
    const { status, user } = await api.login({ email: registeredEmail, password });
    expect(status).toBe(200);
    expect(user!.email).toBe(registeredEmail);
    expect(user!.token).toBeTruthy();
    expect(typeof user!.token).toBe('string');
  });

  test('POST /api/users/login — returns error for wrong password', async () => {
    const { status } = await api.login({ email: registeredEmail, password: 'definitely_wrong' });
    expect([403, 422]).toContain(status);
  });

  test('GET /api/user — returns current user when authenticated', async ({ playwright }) => {
    let authCtx: APIRequestContext;

    await test.step('Log in to obtain token', async () => {
      const { user: loggedIn } = await api.login({ email: registeredEmail, password });
      authCtx = await playwright.request.newContext({
        baseURL: API_BASE,
        extraHTTPHeaders: {
          'Content-Type': 'application/json',
          Authorization: `Token ${loggedIn!.token}`,
        },
      });
    });

    await test.step('Fetch current user with token', async () => {
      const { status, user } = await new AuthApi(authCtx).getCurrentUser();
      expect(status).toBe(200);
      expect(user!.email).toBe(registeredEmail);
      expect(user!.token).toBeTruthy();
    });

    await test.step('Cleanup: dispose context', async () => {
      await authCtx.dispose();
    });
  });

  test('GET /api/user — returns 401 without token', async () => {
    const { status } = await api.getCurrentUser();
    expect(status).toBe(401);
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
      const { status } = await new AuthApi(badCtx).getCurrentUser();
      expect(status).toBe(401);
    });

    await test.step('Cleanup: dispose context', async () => {
      await badCtx.dispose();
    });
  });

  test('PUT /api/user — returns 401 without token', async () => {
    const { status } = await api.updateCurrentUser({ bio: 'should fail' });
    expect(status).toBe(401);
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
      const { user: loggedIn } = await tmpApi.login({ email: originalEmail, password: originalPassword });
      await tmpCtx.dispose();

      authCtx = await playwright.request.newContext({
        baseURL: API_BASE,
        extraHTTPHeaders: {
          'Content-Type': 'application/json',
          Authorization: `Token ${loggedIn!.token}`,
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
      //user! - user is not null and not undefined
      const { status, user } = await new AuthApi(authCtx).updateCurrentUser(updates);
      expect(status).toBe(200);
      expect(user!.email).toBe(updates.email);
      expect(user!.username).toBe(updates.username);
      expect(user!.bio).toBe(updates.bio);
      expect(user!.image).toBe(updates.image);
    });

    await test.step('Verify non-password changes persisted via a separate fetch', async () => {
      const { user: fetched } = await new AuthApi(authCtx).getCurrentUser();
      expect(fetched!.email).toBe(updates.email);
      expect(fetched!.username).toBe(updates.username);
      expect(fetched!.bio).toBe(updates.bio);
      expect(fetched!.image).toBe(updates.image);
    });

    await test.step('Verify new password works by logging in with updated credentials', async () => {
      const verifyCtx = await playwright.request.newContext({
        baseURL: API_BASE,
        extraHTTPHeaders: { 'Content-Type': 'application/json' },
      });
      const { status: loginStatus } = await new AuthApi(verifyCtx).login({
        email: updates.email,
        password: updates.password,
      });
      expect(loginStatus).toBe(200);
      await verifyCtx.dispose();
    });

    await test.step('Cleanup: dispose context', async () => {
      await authCtx.dispose();
    });
  });
});
