# Add Validation Tests

Generate 422 validation tests for the specified endpoint, covering all required fields.

## Usage
`/api-add-validation-tests <endpoint>` — e.g. `/api-add-validation-tests POST /api/articles`

If no endpoint is given, review all POST/PUT endpoints and add missing validation tests.

## Tests to generate per required field

For each required field on the request body:
1. **Missing field** — omit it entirely. Use `as InputType` cast to bypass TypeScript's required-field check and make the intentional violation visible.
2. **Empty string** — send `""` for string fields.

Also consider:
- **Null value** — send `null` if the API might treat it differently from missing.
- **Wrong type** — send a number where a string is expected, if relevant.

## What to assert

```typescript
expect(status).toBe(422);
expect(errors?.fieldName).toBeDefined(); // field-specific error present
```

If the project has an `ErrorSchema` (Zod), also parse the full body:
```typescript
ErrorSchema.parse(body); // asserts { errors: { field: string[] } } shape
```

## Pattern reference

```typescript
test('POST /api/articles — returns 422 when title is missing', async () => {
  const { status, errors } = await api.create(
    { description: 'No title', body: 'Some body.' } as CreateArticleInput
  );
  expect(status).toBe(422);
  expect(errors).toBeDefined();
});

test('POST /api/articles — returns 422 when body is empty', async () => {
  const { status, errors } = await api.create(
    { title: 'No body', description: 'Some desc.', body: '' }
  );
  expect(status).toBe(422);
  expect(errors?.body).toBeDefined();
});
```

Place tests in the `Authenticated endpoints` describe block of the relevant spec file. Tests require an auth context from `beforeAll`.

These tests are single-phase (one call + assert) — do not wrap them in `test.step`. Reserve `test.step` for tests with 2+ distinct phases (see `/api-add-auth-tests` and `/api-e2e-flow` for examples).
