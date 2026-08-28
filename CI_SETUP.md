# CI/CD Setup: GitHub Actions

How the API test suite was wired up to run automatically on GitHub Actions.

## Goal

Run the full Playwright API test suite on every push and pull request to `master`, without needing a browser (these are pure API tests), and keep the HTML/Allure reports available for download after each run.

## Steps

### 1. Create the workflow file

Added `.github/workflows/api-tests.yml`. GitHub Actions auto-discovers any workflow file under `.github/workflows/`, so no separate registration step is needed — pushing the file to the repo is enough to activate it.

### 2. Define triggers

```yaml
on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
  workflow_dispatch:
```

- `push`/`pull_request` on `master` — runs the suite on every change to or against the main branch.
- `workflow_dispatch` — allows triggering a run manually from the GitHub Actions UI, useful for re-running against the live API without a code change.

### 3. Avoid overlapping runs

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

If a new commit lands on a branch while a previous run is still in progress, the older run is cancelled instead of both running to completion — saves minutes and avoids stale results.

### 4. Lock down permissions

```yaml
permissions:
  contents: read
```

The workflow only needs to read the repo checkout; no write access to contents, PRs, or packages is granted.

### 5. Configure the job environment

```yaml
runs-on: ubuntu-latest
timeout-minutes: 15
env:
  API_BASE_URL: https://conduit-api.bondaracademy.com
  TEST_PASSWORD: TestPass123!
  TEST_NEW_PASSWORD: NewPass456!
  TEST_AVATAR_URL: https://example.com/avatar.png
  TEST_EMAIL_DOMAIN: example.com
```

These mirror the local `.env` file (see `.env.example`). Since the target is a public demo API with no real secrets involved, the values are inlined directly as job-level env vars rather than stored in GitHub Secrets. **If this suite ever points at an API with real credentials, move these to repo/organization Secrets and reference them as `${{ secrets.NAME }}` instead.**

A 15-minute timeout guards against a hung run consuming Actions minutes indefinitely.

### 6. Add the job steps

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4

  - name: Setup Node.js
    uses: actions/setup-node@v4
    with:
      node-version: 22
      cache: npm

  - name: Install dependencies
    run: npm ci

  - name: Run Playwright tests
    run: npx playwright test
```

- `actions/checkout@v4` — pulls the repo.
- `actions/setup-node@v4` with `node-version: 22` — matches the local dev Node version; `cache: npm` caches `~/.npm` keyed on `package-lock.json` so subsequent runs install faster.
- `npm ci` — clean, reproducible install from the lockfile (not `npm install`).
- `npx playwright test` — no browsers to install via `playwright install`, since these are API-only tests (`support/api/` classes hitting the REST API directly, no `page` fixture).

Playwright itself already detects the `CI` env var (set automatically by GitHub Actions) — `playwright.config.ts` uses that to switch to serial workers, enable retries, and forbid `.only` in CI:

```ts
forbidOnly: !!process.env.CI,
retries: process.env.CI ? 2 : 0,
workers: process.env.CI ? 1 : undefined,
```

No extra CI-detection logic was needed in the workflow itself — the config already handled it.

### 7. Upload reports as build artifacts

```yaml
- name: Upload Playwright HTML report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: playwright-report/
    retention-days: 7

- name: Upload Allure results
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: allure-results
    path: allure-results/
    retention-days: 7
```

`if: always()` ensures reports are uploaded even when tests fail (the default is to skip subsequent steps after a failure). Both directories are gitignored locally and only produced at test-run time, so uploading them as artifacts is the only way to inspect a CI run's results afterward — they're downloadable from the run's Summary page for 7 days.

Only the raw `allure-results/` are uploaded, not a generated `allure-report/` — generating the HTML Allure report requires the `allure` CLI, which isn't installed in this workflow. Add an `allure generate` step (and install the CLI) if a rendered Allure report in CI becomes worth the added run time.

### 8. Commit and push

```
git add .github/workflows/api-tests.yml
git commit -m "ci: add GitHub Actions workflow to run API tests on push/PR"
git push
```

No manual enablement was required on GitHub's side — Actions is on by default for repos, and any `.yml` under `.github/workflows/` is picked up on the next push.

## Verifying it works

- Push a commit or open a PR against `master` and check the **Actions** tab on GitHub — a run should appear for the `API Tests` workflow.
- Or trigger it manually: **Actions → API Tests → Run workflow** (uses `workflow_dispatch`).
- On completion, `playwright-report` and `allure-results` artifacts are attached to the run for download.

## Full workflow file

See `.github/workflows/api-tests.yml` in the repo root for the current version — this document explains the choices behind it, not a copy to keep in sync by hand.
