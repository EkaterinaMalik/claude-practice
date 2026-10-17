import { test, expect, APIRequestContext, APIResponse } from '@playwright/test';
import { ArticlesApi } from '../support/api/ArticlesApi';
import { AuthApi } from '../support/api/AuthApi';
import { CommentsApi } from '../support/api/CommentsApi';
import { ProfilesApi } from '../support/api/ProfilesApi';
import { createAuthContext, uniqueId, cleanup } from '../support/helpers';
import { ErrorSchema } from '../support/schemas';

const LEAK_PATTERNS = ['PrismaClient', 'prisma.', 'at Object.', 'at Module.', 'node_modules'];

test.describe('Error responses — Shape and safety', () => {
  let authCtx: APIRequestContext;
  let articlesApi: ArticlesApi;
  let articleSlug: string;

  test.beforeAll(async () => {
    authCtx = await createAuthContext();
    articlesApi = new ArticlesApi(authCtx);

    // create() asserts the 201 and returns the article, so a failed setup fails here
    // with the server's own message rather than later as an unrelated TypeError.
    const article = await articlesApi.createArticle({
      title: `ErrTest ${uniqueId()}`,
      description: 'For error response tests',
      body: 'Article body for error response tests.',
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

  // --- Error shape: { errors: { field: string[] } } ---

  test('POST /api/users — 422 body matches ErrorSchema', async ({ request }) => {
    // Raw, because register() would assert the 201 and fail before the 422 below.
    // Empty strings are a valid RegisterInput — the server rejects them, not the compiler.
    const response = await new AuthApi(request).registerRaw({ username: '', email: '', password: '' });

    expect(response.status()).toBe(422);
    ErrorSchema.parse(await response.json());
  });

  test('POST /api/articles — 422 body matches ErrorSchema', async () => {
    const response = await authCtx.post('/api/articles', {
      data: { article: { description: 'no title', body: 'body' } },
    });
    expect(response.status()).toBe(422);
    ErrorSchema.parse(await response.json());
  });

  test('POST /api/articles/:slug/comments — 422 body matches ErrorSchema', async () => {
    const response = await authCtx.post(`/api/articles/${articleSlug}/comments`, {
      data: { comment: { body: '' } },
    });
    expect(response.status()).toBe(422);
    ErrorSchema.parse(await response.json());
  });

  // --- No internal data leak on 422 responses ---

  test('POST /api/users — 422 response does not expose stack trace or internals', async ({ request }) => {
    const response = await new AuthApi(request).registerRaw({ username: '', email: '', password: '' });

    const text = await response.text();
    for (const pattern of LEAK_PATTERNS) {
      expect(text, `Response must not contain "${pattern}"`).not.toContain(pattern);
    }
  });

  test('POST /api/articles — 422 response does not expose stack trace or internals', async () => {
    const response = await authCtx.post('/api/articles', {
      data: { article: { description: 'no title', body: 'body' } },
    });
    const text = await response.text();
    for (const pattern of LEAK_PATTERNS) {
      expect(text, `Response must not contain "${pattern}"`).not.toContain(pattern);
    }
  });

  // --- Known server bug: 500 leaks raw Prisma internals ---

  // This tracker pointed at offset=-1 until 2026-10-17, when CI went red because the server
  // started returning 200 for it — exactly what the tracker exists to report. Re-probed the
  // same day: the leak did not go away, it narrowed. A fractional value still reaches Prisma
  // and the raw error comes back:
  //   "Argument take: Got invalid value 1.5 on prisma.findManyArticle. Provided Float, expected Int."
  // Goes through getAllRaw rather than request.get — a Raw method hands back the APIResponse,
  // so the raw body this test needs is still there.
  test('GET /api/articles — a fractional limit or offset 500 should not expose internals [known server bug]', async ({ request }) => {
    const api = new ArticlesApi(request);

    for (const params of [{ limit: 1.5 }, { offset: 1.5 }]) {
      const response = await api.getAllRaw(params);
      const label = JSON.stringify(params);

      // Asserted BEFORE test.fail() deliberately. test.fail() marks the whole test, so if
      // the status assertion sat under it and the server were fixed to return 400, the
      // failure would be recorded as "expected" and this test would stay green forever -
      // a bug tracker that can never report. Throwing here, before the marker is set,
      // makes that case genuinely red. That is what caught the offset=-1 fix.
      expect(
        response.status(),
        `${label} — status is no longer 500, the server behaviour changed, re-check this known bug`
      ).toBe(500);
    }

    // The leak below is the actual known bug. If the server stops leaking while still
    // returning 500, Playwright reports "Expected to fail, but passed" — also red. So
    // both ways of fixing the server surface here.
    test.fail();

    for (const params of [{ limit: 1.5 }, { offset: 1.5 }]) {
      const text = await (await api.getAllRaw(params)).text();
      for (const pattern of LEAK_PATTERNS) {
        expect(text, `${JSON.stringify(params)} — response must not contain "${pattern}"`)
          .not.toContain(pattern);
      }
    }
  });

  // The same leak, reached three other ways. Probed 2026-10-17: every one of these is an
  // unresolvable reference that reaches Prisma, and Prisma's own message comes back verbatim -
  // table and operation names included. The statuses are pinned in profiles.spec.ts and
  // comments.spec.ts; this tracks the leak.
  test('Unresolvable references leak Prisma internals on 500 [known server bug]', async () => {
    const ctx = await createAuthContext();
    const profilesApi = new ProfilesApi(ctx);

    const cases: Record<string, () => Promise<APIResponse>> = {
      'follow a user who does not exist': () => profilesApi.followRaw(`ghost_${uniqueId()}`),
      'unfollow a user who does not exist': () => profilesApi.unfollowRaw(`ghost_${uniqueId()}`),
      'comment on an article that does not exist': () =>
        new CommentsApi(ctx).createRaw(`no-such-article-${uniqueId()}`, 'orphan'),
    };

    try {
      // Statuses first, above test.fail(), so a server fix is genuinely red rather than
      // recorded as expected. Collected before the marker is set.
      const bodies: Record<string, string> = {};
      for (const [label, call] of Object.entries(cases)) {
        const response = await call();
        expect(response.status(), `${label} — no longer 500, re-check this known bug`).toBe(500);
        bodies[label] = await response.text();
      }

      test.fail();

      for (const [label, text] of Object.entries(bodies)) {
        for (const pattern of LEAK_PATTERNS) {
          expect(text, `${label} — response must not contain "${pattern}"`).not.toContain(pattern);
        }
      }
    } finally {
      await ctx.dispose();
    }
  });

  // The offset=-1 crash this file used to track was fixed on 2026-10-17: it now returns 200
  // with the offset=0 page. A fixed endpoint can regress quietly, so pin that it comes back
  // clean as well as 200. articles.spec.ts asserts the page contents.
  test('GET /api/articles?offset=-1 — the former 500 is now a clean 200', async ({ request }) => {
    const response = await new ArticlesApi(request).getAllRaw({ limit: 1, offset: -1 });

    expect(response.status(), 'offset=-1 crashed with a 500 until 2026-10-17').toBe(200);

    const text = await response.text();
    for (const pattern of LEAK_PATTERNS) {
      expect(text, `Response must not contain "${pattern}"`).not.toContain(pattern);
    }
  });
});
