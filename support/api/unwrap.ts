/**
 * Pull a payload out of a response envelope, failing clearly when it is not there.
 *
 * Every wrapper method reads `body.article`, `body.tags` and so on. If the server renamed one
 * of those keys, the value would quietly become `undefined` and the failure would appear
 * somewhere far away — "Expected array, received undefined" out of a zod parse, or a
 * TypeError on `.length` inside a test that looks unrelated. This names the problem at
 * the point it happens.
 *
 * It takes no status, because only the wrapper methods call it, and they assert the status
 * first. A non-2xx body never reaches here.
 */
export function unwrap<T>(body: unknown, key: string): T {
  if (body === null || typeof body !== 'object' || !(key in body)) {
    const seen =
      body && typeof body === 'object' ? Object.keys(body).join(', ') || '<empty object>' : String(body);
    throw new Error(
      `Response envelope changed: the body should carry "${key}", but it ` +
        `has [${seen}]. If the API changed, update the API class and support/schemas.ts together.`
    );
  }
  return (body as Record<string, T>)[key];
}
