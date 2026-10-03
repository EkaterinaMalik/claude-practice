/**
 * Read a required environment variable, or fail with a message that says what to do.
 *
 * These were read as `process.env.X!`. That `!` is a TypeScript assertion and is erased
 * when the code runs, so it checks nothing: a missing value became `undefined` and showed
 * up much later as `TypeError: apiRequestContext.get: Invalid URL` — an error pointing at
 * the request code rather than at the real cause.
 *
 * This lives in its own module so `playwright.config.ts` can use it for `baseURL` without
 * importing the rest of `helpers.ts`. Nothing here runs at import time, so the config can
 * import it above its own `dotenv.config()` call.
 */
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set.\n` +
        `  Locally: copy .env.example to .env (it is gitignored).\n` +
        `  In CI: check the repository Variables and Secrets — see CI_SETUP.md.\n` +
        `  Note a forked pull request receives no Secrets, so TEST_PASSWORD is empty there.`
    );
  }
  return value;
}
