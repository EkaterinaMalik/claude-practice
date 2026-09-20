import { request, APIRequestContext, APIResponse } from '@playwright/test';

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
