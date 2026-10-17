# Validation tests (422)

## Use the Raw method

The wrapper asserts the success status, so it fails the test before your assertion runs.

```typescript
// Intentional: a required field is missing. The cast makes the violation deliberate and visible.
const response = await api.createArticleRaw(
  { description: 'No title', body: 'Some body.' } as CreateArticleInput
);

expect(response.status()).toBe(422);
const { errors } = await response.json();
expect(errors?.title, 'the response should name the missing field').toBeDefined();
```

## Cases per required field

1. **Key omitted entirely** — `as InputType` to get past the required-field check.
2. **Empty string** — `''` for string fields.

These are **different code paths**. An omitted key arrives as `undefined`, an empty string as
`''`, and a server can treat them differently. Probe both rather than assuming they agree.

Also when relevant: a `null` value, or a number where a string is expected. For a deliberately
wrong *type*, the cast needs `as unknown as InputType` — a single `as` will not bridge it.

## Assert that the response names the field

```typescript
expect(errors?.title).toBeDefined();     // good
expect(errors).toBeDefined();            // passes for any error at all, including about another field
```

When the point of the test is the envelope rather than one field, parse the whole body with the
error schema instead.

## Table-driven, with the label in the message

```typescript
const cases: Record<string, { input: Partial<RegisterInput>; missing: string[] }> = {
  'all three omitted': { input: {}, missing: ['username', 'email', 'password'] },
  'username omitted': { input: { email, password }, missing: ['username'] },
  'email omitted': { input: { username, password }, missing: ['email'] },
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

`Record<string, T>` keys the cases by a human label. `Partial<T>` lets each input omit fields
without the compiler objecting, and the `as` at the call site is where the violation becomes
deliberate. `errors?.[field]` is optional chaining with a computed key — it yields `undefined`
rather than throwing when `errors` is missing, so the assertion message is the one that fails.

## Boundary values are validation too

Probe and pin the edges, especially pagination, where servers fail in several different ways at
once. On one server: a non-numeric value was ignored and returned the default page, a fraction
returned 500 leaking the ORM's internals, a negative value was ignored, and zero fell back to the
default because it is falsy. Four behaviours, four different tests.

Where the server returns an internal error, that is a bug worth tracking rather than a behaviour
worth blessing — see the `test.fail()` section of `suite-audit.md`.

## Placement

The authenticated describe block of the relevant spec. These are single-phase — one call, one
assert — so do not wrap them in `test.step`.
