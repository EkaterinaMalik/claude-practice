# Add Schema Validation Tests

Generate Zod runtime schema validation for the specified response type and add tests that validate real API responses against it.

## Usage
`/api-add-schema-tests <TypeName>` — e.g. `/api-add-schema-tests Article`

If no type is given, generate schemas for all types in `support/types.ts` that don't yet have a Zod schema.

## Steps

1. Read `support/types.ts` to find the TypeScript interface for the given type.
2. Add a corresponding Zod schema to `support/schemas.ts`:
   - `string` → `z.string()`
   - `string | null` → `z.string().nullable()`
   - `boolean` → `z.boolean()`
   - `number` → `z.number()`
   - `string[]` → `z.array(z.string())`
   - nested object → define a sub-schema and reference it
3. In `tests/schema.spec.ts` (create if missing), add a test that:
   - Calls the relevant GET endpoint to get a real response
   - Runs `SchemaName.parse(responseObject)` — Zod throws a descriptive error if any field is missing or has the wrong type
   - Asserts `status` is 200 before parsing

If validating the response requires setup beyond a single call (e.g. registering a user before fetching their profile, or logging in before validating the login response), split the test into `test.step` blocks: one step per setup/act/validate phase. If it's a single GET + parse with no setup, leave it flat.

## Pattern reference

```typescript
// support/schemas.ts
export const AuthorSchema = z.object({
  username: z.string(),
  bio: z.string().nullable(),
  image: z.string().nullable(),
  following: z.boolean(),
});

export const ArticleSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  body: z.string(),
  tagList: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  favorited: z.boolean(),
  favoritesCount: z.number(),
  author: AuthorSchema,
});

// tests/schema.spec.ts
test('GET /api/articles/:slug — single article matches ArticleSchema', async ({ request }) => {
  const { status, article } = await new ArticlesApi(request).getBySlug(slug);
  expect(status).toBe(200);
  ArticleSchema.parse(article);
});
```

Also add `ErrorSchema` for validating 422 error response shape:
```typescript
export const ErrorSchema = z.object({
  errors: z.record(z.string(), z.array(z.string().min(1)).min(1)),
});
```
