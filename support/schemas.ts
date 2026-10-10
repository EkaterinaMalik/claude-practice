import { z } from 'zod';

// strictObject, not object: a plain z.object() strips keys it does not know about and parses
// happily, so a field the server starts returning would vanish without a word. Missing and
// mistyped fields were already caught either way — this closes the additive case.
//
// Turning it on immediately caught one: the user envelope carries an `id` that no schema here
// declared. See UserSchema below. Article, author and comment shapes matched the live server
// field for field, checked 2026-10-10.

export const AuthorSchema = z.strictObject({
  username: z.string(),
  bio: z.string().nullable(),
  image: z.string().nullable(),
  following: z.boolean(),
});

export const ArticleSchema = z.strictObject({
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

export const CommentSchema = z.strictObject({
  id: z.number(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  author: AuthorSchema,
});

// The user envelope is not consistent across endpoints, and strictObject is what found it.
// POST /api/users and GET /api/user both return a numeric `id`; POST /api/users/login does not.
// Two schemas rather than one optional field, so each shape is pinned: if login starts returning
// `id`, or register stops, a test says so instead of quietly accepting either.
export const UserSchema = z.strictObject({
  id: z.number(),
  email: z.string(),
  token: z.string(),
  username: z.string(),
  bio: z.string().nullable(),
  image: z.string().nullable(),
});

// omit() keeps the strictness of the schema it came from — checked against zod 4.4.3.
export const LoginUserSchema = UserSchema.omit({ id: true });

export const ProfileSchema = z.strictObject({
  username: z.string(),
  bio: z.string().nullable(),
  image: z.string().nullable(),
  following: z.boolean(),
});

export const TagsSchema = z.array(z.string());

export const ErrorSchema = z.strictObject({
  // The record stays open on purpose: its keys are field names chosen by the server,
  // so they cannot be enumerated here. Only the envelope around it is strict.
  errors: z.record(z.string(), z.array(z.string().min(1)).min(1)),
});
