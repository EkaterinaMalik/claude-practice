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
  checks: write
```

The workflow only needs to read the repo checkout; no write access to contents, PRs, or packages is granted. The one exception is `checks: write`, required by the `dorny/test-reporter` step in step 6 to publish its check run — without it the tests pass but that step fails on permissions, which reads like a test problem and isn't.

**`checks: write` only does anything because the step passes `use-actions-summary: false`.** That input defaults to `'true'`, and on that path the action writes the report to the job summary and never calls `checks.create` — no check run on the commit or PR, no inline annotations on failing tests, and this permission unused. The default is `'true'` in the `v1` tag too, so it was never working before 2026-10-17; the v3 bump did not cause it. If you ever see the `Playwright Test Results` check run disappear, look at that input before looking here.

### 5. Configure the job environment

```yaml
runs-on: ubuntu-24.04
timeout-minutes: 15
env:
  API_BASE_URL: ${{ vars.API_BASE_URL }}
  TEST_AVATAR_URL: ${{ vars.TEST_AVATAR_URL }}
  TEST_EMAIL_DOMAIN: ${{ vars.TEST_EMAIL_DOMAIN }}
  TEST_PASSWORD: ${{ secrets.TEST_PASSWORD }}
  TEST_NEW_PASSWORD: ${{ secrets.TEST_NEW_PASSWORD }}
```

**Why `ubuntu-24.04` and not `ubuntu-latest`.** GitHub migrates the `ubuntu-latest` label to
Ubuntu 26 gradually, between 2026-10-19 and 2026-11-19. During that window two runs of the *same
commit* can land on different images, with a different kernel and network stack. `performance.spec.ts`
asserts five 2000 ms thresholds, so a borderline timing could flip and be indistinguishable from a
real API regression. `24.04` is what `ubuntu-latest` resolved to before the rollout, so the pin
changes nothing today.

**The pin is temporary and must be removed.** A pinned image is eventually retired, and the job
then warns and later fails. Revisit after 2026-11-19 — drop the pin, or move to `ubuntu-26.04` and
re-measure the thresholds on purpose. It is the one open item in `TEST_RECOMMENDATIONS.md`.

These mirror the local `.env` file (see `.env.example`), but the values live on GitHub rather than in
this file. They are split by kind:

| Kind | Holds | Visible? | Manage with |
|------|-------|----------|-------------|
| **Variables** (`vars.`) | `API_BASE_URL`, `TEST_AVATAR_URL`, `TEST_EMAIL_DOMAIN` | yes, in plain text | `gh variable list` / `gh variable set NAME` |
| **Secrets** (`secrets.`) | `TEST_PASSWORD`, `TEST_NEW_PASSWORD` | no, masked in logs | `gh secret list` / `gh secret set NAME` |

The split is by *kind of value*, not by sensitivity. A URL or a domain is configuration: you want to
read it, and hiding it only makes debugging harder. A password belongs in Secrets whatever it
protects, so the habit holds when the credential does start to matter.

Nothing here is genuinely confidential — the target is a public demo API and every test registers a
throwaway user — but keeping the shape right means the workflow needs no change on the day it points
at something real.

**Two things to know:**

- **Forked pull requests get no secrets.** GitHub withholds them from `pull_request` runs originating
  in a fork, so `TEST_PASSWORD` arrives empty and the suite fails. Pushes and PRs from branches in
  this repository are unaffected.
- **A missing or misspelled name fails quietly.** `${{ vars.TYPO }}` expands to an empty string, not
  an error. An empty `API_BASE_URL` surfaces as `Invalid URL` from deep inside a request, which points
  nowhere near the real cause.

A 15-minute timeout guards against a hung run consuming Actions minutes indefinitely.

### 6. Add the job steps

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v7

  - name: Setup Node.js
    uses: actions/setup-node@v7
    with:
      node-version: 22
      cache: npm

  - name: Install dependencies
    run: npm ci

  - name: Run Playwright tests
    run: npx playwright test
```

- `actions/checkout@v7` — pulls the repo.
- `actions/setup-node@v7` with `node-version: 22` — matches the local dev Node version; `cache: npm` caches `~/.npm` keyed on `package-lock.json` so subsequent runs install faster.
- `npm ci` — clean, reproducible install from the lockfile (not `npm install`).
- `npx playwright test` — no browsers to install via `playwright install`, since these are API-only tests (`support/api/` classes hitting the REST API directly, no `page` fixture).
- `dorny/test-reporter` — reads `junit-results/results.xml` and publishes the `Playwright Test Results` check run. `if: ${{ !cancelled() }}` so a *failing* suite is still reported, while a run cancelled by `cancel-in-progress` is not — there is no complete report to publish on a cancelled run. `fail-on-error: false` and `fail-on-empty: false` so this step never decides the job: the suite step already did. Both defaults are the opposite — `fail-on-empty` in particular would fire whenever an earlier step fails and the suite is skipped, since this step runs anyway and there is no `results.xml` to read. `use-actions-summary: false` is load-bearing — see step 4. **Every action is pinned to a commit SHA, with a `# vX.Y.Z` comment.** A tag like `@v7` can be moved by its owner at any time, and this job puts `TEST_PASSWORD` in the environment of every step — so a moved tag would run with those secrets in scope. A SHA cannot move. The version comment is not decoration: Dependabot reads it to know the current version and rewrites both parts, so keep the format. `.github/dependabot.yml` proposes the bumps monthly. **A Dependabot PR cannot run the live suite** — see below — so typecheck and `npm run check:commands` are the signal there, and the suite runs on `master` after merge. Before the pin, four actions sat on the deprecated `node20` runtime until someone went looking.

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
  if: ${{ !cancelled() }}
  uses: actions/upload-artifact@v7
  with:
    name: playwright-report
    path: playwright-report/
    retention-days: 7

- name: Upload Allure results
  if: ${{ !cancelled() }}
  uses: actions/upload-artifact@v7
  with:
    name: allure-results
    path: allure-results/
    retention-days: 7
```

`if: ${{ !cancelled() }}` ensures reports are uploaded even when tests fail — the default is to skip the remaining steps after a failure, which is precisely when you want the report. It is `!cancelled()` rather than `always()` because `cancel-in-progress` can kill a run mid-suite, and a half-written report is worse than none. Both directories are gitignored locally and only produced at test-run time, so uploading them as artifacts is the only way to inspect a CI run's results afterward — they're downloadable from the run's Summary page for 7 days.

Only the raw `allure-results/` are uploaded, not a generated `allure-report/` — generating the HTML Allure report requires the `allure` CLI, which isn't installed in this workflow. Add an `allure generate` step (and install the CLI) if a rendered Allure report in CI becomes worth the added run time.

**Viewing a CI run's Allure report locally.** Because the raw results are uploaded, any run can be rendered on your machine without re-running the suite — the repo's containerized Allure CLI does the rendering, so no local Java or `allure` install is needed:

```bash
gh run list --limit 5                        # find the run id
gh run download <run-id> -n allure-results -D /tmp/ci-results

docker run --rm -p 5252:5252 -u $(id -u):$(id -g) \
  -v /tmp/ci-results:/work/allure-results:ro \
  conduit-api-tests-allure                   # then open http://localhost:5252
```

Downloading into `/tmp` rather than the repo keeps your own `allure-results/` intact. See CLAUDE.md for the `allure` service the image comes from.

### 7b. Runs without secrets — Dependabot and forked PRs

**GitHub withholds repository Secrets from Dependabot pull requests and from forked pull
requests.** That is deliberate: a dependency update, or a stranger's branch, must not be able to
read your credentials. Those runs get an empty secrets scope, so `${{ secrets.TEST_PASSWORD }}`
evaluates to an empty string.

This suite hits a live API, so without a guard the job died at the first spec with:

```
Error: TEST_PASSWORD is not set.
  Note a forked pull request receives no Secrets, so TEST_PASSWORD is empty there.
```

That reads like a broken suite and is not. So the workflow checks first:

```yaml
- name: Check whether the live suite can run
  id: creds
  run: |
    if [ -n "$TEST_PASSWORD" ]; then
      echo "available=true" >> "$GITHUB_OUTPUT"
    else
      echo "available=false" >> "$GITHUB_OUTPUT"
      # ... and writes an explanation to $GITHUB_STEP_SUMMARY
    fi

- name: Run Playwright tests
  if: steps.creds.outputs.available == 'true'
  run: npx playwright test
```

The reporter and both upload steps carry the same condition — with no run there is nothing to
publish or upload.

**What such a PR still proves.** `npm ci`, `npm run typecheck` and `npm run check:commands` all
run, and all three need no secrets. For a dependency or action bump that is most of the signal.
The suite runs on `master` after merge, so check there before trusting a green Dependabot PR.

**Do not "fix" this by adding the secrets to the Dependabot scope.** `gh secret set --app
dependabot` would make the suite run, and would also hand live credentials to every dependency
update — precisely what the default prevents.

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
- From the terminal with `gh`: `gh run list --limit 5` for recent runs, `gh run watch` to follow one live, and `gh run view --log-failed <run-id>` to read only the failing step's log.

**The workflow does not use the Docker services.** It runs `npx playwright test` directly on the GitHub-hosted runner, which already has Node. Routing CI through the `tests` compose service would add an image build to every run for no gain — and because each run starts from a fresh checkout, the `pretest` hook that clears `allure-results/` locally has nothing to clear there.

## Full workflow file

See `.github/workflows/api-tests.yml` in the repo root for the current version — this document explains the choices behind it, not a copy to keep in sync by hand.
