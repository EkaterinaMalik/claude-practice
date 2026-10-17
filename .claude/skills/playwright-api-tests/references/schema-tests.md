# Response schema tests (zod)

## Use `z.strictObject`, not `z.object`

**The rule that matters most here.** `z.object()` does not reject a key it does not know about —
it *removes* it and returns a clean object, so the parse passes. A field the server starts
returning vanishes without a word. Missing and mistyped fields are caught either way; strictness
closes the additive case.

```typescript
export const AuthorSchema = z.strictObject({
  username: z.string(),
  bio: z.string().nullable(),
  image: z.string().nullable(),
  following: z.boolean(),
});
```

Two consequences:

- **`.omit()` keeps the strictness of the schema it came from** — checked against zod 4.4.3. So
  `LoginUserSchema = UserSchema.omit({ id: true })` is still strict.
- **Keep a `z.record` open where the keys are the server's to choose.** An error envelope's field
  names cannot be enumerated, so make the envelope strict and leave the record inside it open:

```typescript
export const ErrorSchema = z.strictObject({
  errors: z.record(z.string(), z.array(z.string().min(1)).min(1)),
});
```

**Strictness earns its keep by finding inconsistencies.** On one server, register and
get-current-user returned a numeric `id` while login did not — invisible until the schemas went
strict. The fix is two schemas rather than one optional field, so each shape is pinned: if login
starts returning `id`, or register stops, a test says so instead of accepting either.

## Mapping types to schemas

| TypeScript | zod |
|---|---|
| `string` | `z.string()` |
| `string \| null` | `z.string().nullable()` |
| `boolean` | `z.boolean()` |
| `number` | `z.number()` |
| `string[]` | `z.array(z.string())` |
| nested object | its own schema, referenced by name |

## The test goes through the API layer

A wrapper asserts its own status and returns the typed payload, so there is no status line and no
envelope to dig out:

```typescript
test('GET /api/articles/:slug — matches ArticleSchema', async ({ request }) => {
  const article = await new ArticlesApi(request).getBySlug(slug);
  ArticleSchema.parse(article);
});
```

Never call `request.get`/`request.post` from a spec. If you need the untouched response, that is
what the Raw method returns.

## Two traps that make a schema test green while proving nothing

**1. The response may be empty for the caller you used.** A server can return an empty array to an
unauthenticated caller even when the resource has children. The loop then runs zero times and the
test passes. One suite validated zero comments for months this way. Authenticate whenever the test
needs to see its own writes:

```typescript
const authCtx = await createAuthContext();
const comments = await new CommentsApi(authCtx).list(slug);
```

**2. A loop needs a non-empty assertion above it**, with a message that says why:

```typescript
expect(comments.length, 'no comments returned — the loop below would pass vacuously')
  .toBeGreaterThan(0);
for (const comment of comments) {
  CommentSchema.parse(comment);
}
```

## Placement

If getting the response needs setup — registering before fetching a profile, logging in before
validating the login envelope — split into `test.step` blocks, one per phase. A single call plus a
parse stays flat. Clean up anything created with `cleanup()` and a Raw method.
