# Add Schema Validation Tests

Generate a zod runtime schema for a response type and a test that validates a real API response against it.

## Usage
`/api-add-schema-tests <TypeName>` — e.g. `/api-add-schema-tests Article`

If no type is given, generate schemas for every type in `support/types.ts` that does not have one yet.

## Steps

1. Read `support/types.ts` for the TypeScript interface.
2. Add a schema to `support/schemas.ts`:
   - `string` → `z.string()`
   - `string | null` → `z.string().nullable()`
   - `boolean` → `z.boolean()`
   - `number` → `z.number()`
   - `string[]` → `z.array(z.string())`
   - nested object → its own schema, referenced by name
3. Add a test to `tests/schema.spec.ts` that fetches a real response through the API layer and parses it.

## Use `z.strictObject`, not `z.object`

**This is the rule that matters most here.** `z.object()` does not reject a key it does not know about — it *removes* it and returns a clean object, so the parse passes. A field the server starts returning would vanish without a word. `z.strictObject()` fails instead.

```typescript
export const AuthorSchema = z.strictObject({
  username: z.string(),
  bio: z.string().nullable(),
  image: z.string().nullable(),
  following: z.boolean(),
});
```

Two consequences worth knowing before you write one:

- **`.omit()` keeps the strictness of the schema it came from** — checked against zod 4.4.3. `LoginUserSchema = UserSchema.omit({ id: true })` is still strict.
- **Keep a `z.record` open on purpose where the keys are the server's to choose.** `ErrorSchema` wraps `errors: z.record(z.string(), z.array(z.string().min(1)).min(1))`: the envelope is strict, the field names inside it cannot be enumerated.

Strictness is what found the envelope inconsistency: `POST /api/users` and `GET /api/user` return a numeric `id`, `POST /api/users/login` does not. That is why there are two schemas rather than one optional field.

## The test goes through the API layer

A wrapper asserts its own status and returns the typed payload, so there is no status line in the test and no envelope to dig out:

```typescript
test('GET /api/articles/:slug — single article matches ArticleSchema', async ({ request }) => {
  // getBySlug() asserts the 200 itself — a bad status fails here with the body attached.
  const article = await new ArticlesApi(request).getBySlug(slug);

  ArticleSchema.parse(article);
});
```

Never call `request.get`/`request.post` from a spec. If you need the untouched response, that is what the `…Raw` method returns.

## Two traps that make a schema test pass while proving nothing

**1. An anonymous read sees only the pre-seeded data.** `GET /api/articles/:slug/comments` returns an empty array to an unauthenticated caller even when the article has comments. A loop over that array runs zero times and the test is green. The comment schema test validated zero comments for months before anyone noticed. Authenticate whenever the test needs to see its own writes:

```typescript
const authCtx = await createAuthContext();
const comments = await new CommentsApi(authCtx).list(slug);
```

**2. A loop needs a non-empty assertion above it.** Always pin that there was something to validate:

```typescript
expect(comments.length, 'no comments returned — the loop below would pass vacuously')
  .toBeGreaterThan(0);
for (const comment of comments) {
  CommentSchema.parse(comment);
}
```

## Steps and placement

If getting the response needs setup — registering a user before fetching their profile, logging in before validating the login envelope — split the test into `test.step` blocks, one per phase. A single call plus a parse stays flat.

Clean up anything the test created with the `cleanup()` helper and a Raw method:

```typescript
await cleanup(`article ${article.slug}`, () => api.deleteRaw(article.slug));
```
