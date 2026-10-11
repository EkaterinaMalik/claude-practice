import { APIResponse, expect } from '@playwright/test';

/**
 * Assert the status of a response, and put the server's own words in the failure message.
 *
 * Every wrapper method calls this before it reads a payload. A bare `expect(status).toBe(201)`
 * tells you the number was wrong and nothing else, while the body usually says exactly why —
 * `{"errors":{"title":["can't be blank"]}}`. Reading the body costs one await and turns a
 * puzzle into an answer.
 *
 * The URL comes from the response, so it cannot drift from the request that was really sent,
 * and it arrives with the query string attached.
 *
 * The body is trimmed to 300 characters. A 500 from this server can carry a whole stack.
 */
export async function expectStatus(response: APIResponse, expected: number): Promise<void> {
  const actual = response.status();
  if (actual === expected) return;

  const body = (await response.text()).slice(0, 300);
  const message = `${response.url()}: expected ${expected}, got ${actual}. Response body: ${body || '<empty>'}`
  expect(actual, message).toBe(expected);
}
