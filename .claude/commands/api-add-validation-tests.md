# Add Validation Tests

Generate 422 validation tests for an endpoint, covering every required field.

## Usage
`/api-add-validation-tests <endpoint>` — e.g. `/api-add-validation-tests POST /api/articles`

If no endpoint is given, review all POST/PUT endpoints and add what is missing.

## Use the Raw method

Every endpoint has two methods. The wrapper asserts the status that endpoint really returns, so `createArticle()` would fail the test on the 422 you are trying to assert. Use `createArticleRaw()`: it returns the `APIResponse` untouched and asserts nothing, so any status resolves normally and you still have the raw body.

```typescript
// Intentional: a required field is missing. The cast makes the violation deliberate and visible.
// Raw, because createArticle() would assert 201 and fail before the assertion below.
const response = await api.createArticleRaw(
  { description: 'No title', body: 'Some body.' } as CreateArticleInput
);

expect(response.status()).toBe(422);
const { errors } = await response.json();
expect(errors?.title, 'the response should name the missing field').toBeDefined();
```

## Cases to generate per required field

1. **Key omitted entirely** — `as InputType` to bypass the required-field check.
2. **Empty string** — `''` for string fields.

These are **different code paths**: an omitted key arrives as `undefined`, an empty string as `''`, and a server can treat them differently. Probe before assuming. This one returns 422 either way and names each missing field.

Also worth a case when it applies: a `null` value, or a number where a string is expected.

## Table-driven, with the label in the message

When there is more than one case, a `Record` keyed by a human label keeps each failure readable:

```typescript
const cases: Record<string, { input: Partial<RegisterInput>; missing: string[] }> = {
  'all three omitted': { input: {}, missing: ['username', 'email', 'password'] },
  'username omitted': { input: { email, password }, missing: ['username'] },
};

for (const [label, { input, missing }] of Object.entries(cases)) {
  const response = await api.registerRaw(input as RegisterInput);
  expect(response.status(), `${label} — an incomplete registration must not be accepted`).toBe(422);

  const { errors } = await response.json();
  for (const field of missing) {
    expect(errors?.[field], `${label} — the response should name "${field}"`).toBeDefined();
  }
}
```

Without the label in the message, a failure says only that 200 is not 422, and you cannot tell which case produced it.

## What to assert

- the status is 422
- the response **names the field** — `errors?.fieldName` is defined. A bare `expect(errors).toBeDefined()` passes for any error at all, including one about a different field.
- the envelope shape, with `ErrorSchema.parse(await response.json())`, when the point of the test is the shape rather than one field

## Placement

Put them in the `Authenticated endpoints` describe block of the relevant spec, which gets its context from `beforeAll` via `createAuthContext()` — no arguments.

These are single-phase: one call, one assert. Do not wrap them in `test.step`. Reserve that for 2+ distinct phases, as in `/api-add-auth-tests` and `/api-e2e-flow`.
