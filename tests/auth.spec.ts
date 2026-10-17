import { test, expect, APIRequestContext } from '@playwright/test';
import { AuthApi, RegisterInput } from '../support/api/AuthApi';
import { ArticlesApi } from '../support/api/ArticlesApi';
import { API_BASE, TEST_PASSWORD, TEST_NEW_PASSWORD, TEST_AVATAR_URL, uniqueId, generateEmail, createAuthContext, cleanup } from '../support/helpers';

test.describe('Authentication', () => {
  let ctx: APIRequestContext;
  let api: AuthApi;
  let registeredEmail: string;
  let registeredUsername: string;
  const password = TEST_PASSWORD;

  test.beforeAll(async ({ playwright }) => {
    ctx = await playwright.request.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { 'Content-Type': 'application/json' },
    });
    api = new AuthApi(ctx);

    const id = uniqueId();
    registeredEmail = generateEmail('a', id);
    registeredUsername = `u_${id}`;
    await api.register({
      username: registeredUsername,
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

  // The test above sends empty strings. Omitting a key is a different
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

  // The RealWorld spec says `Authorization: Token <jwt>`. This server also
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

  // Probed 2026-10-17. The server rejects a duplicate on either field and names the one that
  // clashes, so a client can tell the user which to change.
  test('POST /api/users — returns 422 and names the field that is already taken', async () => {
    const id = uniqueId();
    const cases: Record<string, { input: RegisterInput; taken: string[] }> = {
      'both already taken': {
        input: { username: registeredUsername, email: registeredEmail, password },
        taken: ['username', 'email'],
      },
      'email taken, username free': {
        input: { username: `u_${id}`, email: registeredEmail, password },
        taken: ['email'],
      },
      'username taken, email free': {
        input: { username: registeredUsername, email: generateEmail('dup', id), password },
        taken: ['username'],
      },
    };

    for (const [label, { input, taken }] of Object.entries(cases)) {
      const response = await api.registerRaw(input);
      expect(response.status(), `${label} — a duplicate must not be accepted`).toBe(422);

      const { errors } = await response.json();
      for (const field of taken) {
        expect(errors?.[field], `${label} — the response should name "${field}"`).toBeDefined();
      }
      // The free field must NOT be reported, or the message misdirects the user.
      for (const field of ['username', 'email'].filter(f => !taken.includes(f))) {
        expect(errors?.[field], `${label} — "${field}" is free and should not be reported`)
          .toBeUndefined();
      }
    }
  });

  // CLAUDE.md records a 20-character username limit, and uniqueId() is sized to fit it
  // (`u_${uniqueId()}` is 14 characters at most). Nothing tested the limit itself, so if the
  // server raised or dropped it, the constraint the helper is built around would go stale
  // silently. Probed 2026-10-17: 21 characters is rejected and the message states the maximum.
  test('POST /api/users — rejects a username longer than 20 characters', async () => {
    const id = uniqueId();

    const tooLong = await api.registerRaw({
      username: 'u'.repeat(21),
      email: generateEmail('long', id),
      password,
    });
    expect(tooLong.status(), '21 characters must be rejected').toBe(422);

    const { errors } = await tooLong.json();
    expect(errors?.username, 'the response should name the username field').toBeDefined();
    expect(
      JSON.stringify(errors.username),
      'the message should state the limit, so a change to it is visible here'
    ).toContain('20');

    // The boundary itself must still work, or the limit has moved the other way.
    const atLimit = `u_${id}`.padEnd(20, 'x').slice(0, 20);
    const ok = await api.register({ username: atLimit, email: generateEmail('lim', id), password });
    expect(ok.username, 'exactly 20 characters must still be accepted').toBe(atLimit);
  });

  test('POST /api/users — rejects a malformed email', async () => {
    const id = uniqueId();

    const response = await api.registerRaw({
      username: `u_${id}`,
      email: 'not-an-email',
      password,
    });

    expect(response.status()).toBe(422);
    expect((await response.json()).errors?.email, 'the response should name the email field')
      .toBeDefined();
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

  // A login failure must not reveal whether the account exists. If a wrong password and an
  // unknown address answered differently, anyone could test a list of addresses against this
  // server and learn which are registered. Probed 2026-10-17: both return 403 with the same
  // body, `{"errors":{"email or password":["is invalid"]}}` — note the single combined key.
  //
  // Comparing the two responses is the point. Asserting 403 on each separately would still
  // pass if one later started saying "email not found".
  test('POST /api/users/login — a wrong password and an unknown email are indistinguishable', async () => {
    const wrongPassword = await api.loginRaw({ email: registeredEmail, password: 'definitely_wrong' });
    const unknownEmail = await api.loginRaw({
      email: generateEmail('ghost', uniqueId()),
      password,
    });

    expect(
      unknownEmail.status(),
      'an unknown email must answer exactly as a wrong password does'
    ).toBe(wrongPassword.status());

    expect(
      await unknownEmail.json(),
      'the bodies must match too, or the difference identifies registered accounts'
    ).toEqual(await wrongPassword.json());
  });

  // An empty password is a different path again: it fails validation before credentials are
  // ever checked, so it names the field rather than giving the combined message above.
  test('POST /api/users/login — returns 422 and names the field for an empty password', async () => {
    const response = await api.loginRaw({ email: registeredEmail, password: '' });

    expect(response.status()).toBe(422);
    expect((await response.json()).errors?.password).toBeDefined();
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

  // The update path has the same uniqueness constraints as registration, and they are enforced
  // by a different code path - an UPDATE rather than an INSERT. Probed 2026-10-17: taking
  // another account's email is rejected the same way, naming the field.
  test('PUT /api/user — returns 422 when the new email is already taken', async ({ playwright }) => {
    const authCtx = await createAuthContext();

    try {
      const before = await new AuthApi(authCtx).getCurrentUser();

      const response = await new AuthApi(authCtx).updateCurrentUserRaw({
        email: registeredEmail,   // belongs to this block's shared user
      });
      expect(response.status(), 'taking another account\'s email must be rejected').toBe(422);
      expect((await response.json()).errors?.email, 'the response should name the email field')
        .toBeDefined();

      // The rejection must leave the account alone. A 422 that still wrote the value would be
      // worse than no validation at all.
      const after = await new AuthApi(authCtx).getCurrentUser();
      expect(after.email, 'a rejected update must not change the stored email').toBe(before.email);
    } finally {
      await authCtx.dispose();
    }
  });
});
