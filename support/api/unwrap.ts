/**
 * Pull a payload out of a response envelope, failing clearly when it is not there.
 *
 * Every API class reads `body.article`, `body.tags` and so on. If the server renamed one
 * of those keys, the value would quietly become `undefined` and the failure would appear
 * somewhere far away — "Expected array, received undefined" out of a zod parse, or a
 * TypeError on `.length` inside a test that looks unrelated. This names the problem at
 * the point it happens.
 *
 * Only 2xx responses are checked. A 404 or 422 from this server carries
 * `{ errors: ... }` and no payload key, which is correct, so those return undefined.
 *
 * Lives in its own file because all five API classes need it.
 */
export function unwrap<T>(body: unknown, key: string, status: number): T {
  if (status < 200 || status >= 300) {
    return undefined as T;
  }
  if (body === null || typeof body !== 'object' || !(key in body)) {
    const seen =
      body && typeof body === 'object' ? Object.keys(body).join(', ') || '<empty object>' : String(body);
    throw new Error(
      `Response envelope changed: a ${status} response should carry "${key}", but the body ` +
        `has [${seen}]. If the API changed, update the API class and support/schemas.ts together.`
    );
  }
  return (body as Record<string, T>)[key];
}
