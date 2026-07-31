import type * as playwrightCore from 'playwright-core';
import { APIRequestContext } from '@playwright/test';

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

export async function createAuthContext(
  playwright: typeof playwrightCore
): Promise<APIRequestContext> {
  const id = uniqueId();
  const email = generateEmail('t', id);
  const username = `u_${id}`;

  const tmp = await playwright.request.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
  });

  await tmp.post('/api/users', {
    data: { user: { username, email, password: TEST_PASSWORD } },
  });

  const loginRes = await tmp.post('/api/users/login', {
    data: { user: { email, password: TEST_PASSWORD } },
  });
  const { user } = await loginRes.json();
  await tmp.dispose();

  return playwright.request.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
      Authorization: `Token ${user.token}`,
    },
  });
}
