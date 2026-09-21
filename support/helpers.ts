import { test, request, APIRequestContext, APIResponse } from '@playwright/test';

export const API_BASE = process.env.API_BASE_URL!;
export const TEST_PASSWORD = process.env.TEST_PASSWORD!;
export const TEST_NEW_PASSWORD = process.env.TEST_NEW_PASSWORD!;
export const TEST_AVATAR_URL = process.env.TEST_AVATAR_URL!;
export const TEST_EMAIL_DOMAIN = process.env.TEST_EMAIL_DOMAIN!;

export function uniqueId(): string {
  return `${Date.now().toString().slice(-10)}_${Math.random().toString(36).slice(2, 5)}`;
}

export function generateEmail(prefix: string, id: string): string {
  return `${prefix}_${id}@${TEST_EMAIL_DOMAIN}`;
}

/**
 * Read a response body for an error message without throwing on non-JSON
 * (the server can return HTML from a proxy on a 5xx).
 */
async function describeResponse(response: APIResponse): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return '<body could not be read>';
  }
}

/**
 * Run a cleanup call and report it when it does not succeed.
 *
 * The API classes return `{ status }` and do NOT throw on a non-2xx response —
 * Playwright's `failOnStatusCode` defaults to false. So the older pattern,
 *
 *     await api.delete(slug).catch(e => console.warn('Cleanup failed:', e));
 *
 * only ever fired on a transport error. A 403 (wrong owner) or 404 resolved
 * normally, the `.catch` never ran, and the resource stayed on the shared
 * server with nothing logged — the exact silent failure the cleanup rule exists
 * to prevent.
 *
 * This checks the status as well as catching throws, and records an annotation
 * so the failure shows up in the HTML and Allure reports, not just in stdout.
 * It never rethrows: a cleanup problem must not mask the real test result.
 */
export async function cleanup(
  label: string,
  action: () => Promise<{ status: number }>
): Promise<void> {
  let problem: string | undefined;

  try {
   // const result = await action();
   // const status = result.status;
    const { status } = await action();
    if (status < 200 || status >= 300) {
      problem = `${label} — server returned ${status}`;
    }
  } catch (error) {
    problem = `${label} — ${(error as Error).message ?? error}`;
  }

  if (!problem) return;

  console.warn(`Cleanup failed: ${problem}`);
  try {
    // Not available in beforeAll/afterAll; the report entry is a bonus, not the point.
    test.info().annotations.push({ type: 'cleanup-failed', description: problem });
  
  } catch {
    /* outside a running test — the console warning above still stands */
  }
}

export async function createAuthContext(): Promise<APIRequestContext> {
  const id = uniqueId();
  const email = generateEmail('t', id);
  const username = `u_${id}`;

  // Create a new context 'tmp' to create a new user
  const tmp = await request.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
  });

  try {
    //Create a new user, check status is 201, success
    const registerRes = await tmp.post('/api/users', {
      data: { user: { username, email, password: TEST_PASSWORD } },
    });
    if (registerRes.status() !== 201) {
      throw new Error(
        `createAuthContext: could not register "${username}" — expected 201, got ` +
          `${registerRes.status()}. Body: ${await describeResponse(registerRes)}`
      );
    }

   // Login using new user and get token
    const loginRes = await tmp.post('/api/users/login', {
      data: { user: { email, password: TEST_PASSWORD } },
    });
    if (loginRes.status() !== 200) {
      throw new Error(
        `createAuthContext: could not log in as "${username}" — expected 200, got ` +
          `${loginRes.status()}. Body: ${await describeResponse(loginRes)}`
      );
    }

    const body = await loginRes.json();
    const token = body?.user?.token;

    // Check if a new token really exists
    if (!token) {
      throw new Error(
        `createAuthContext: login for "${username}" returned 200 but no token. ` +
          `Body: ${JSON.stringify(body).slice(0, 300)}`
      );
    }

    // return: created new context which contains Authorization Token
    // further requests will be run using this Authorized user 
    return await request.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
        Authorization: `Token ${token}`,
      },
    });
  } finally {
    // Dispose even when a step above threw, so a failed setup does not leak a context.
    await tmp.dispose();
  }
}
