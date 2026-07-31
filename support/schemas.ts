import { z } from 'zod';

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

export const CommentSchema = z.object({
  id: z.number(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  author: AuthorSchema,
});

export const UserSchema = z.object({
  email: z.string(),
  token: z.string(),
  username: z.string(),
  bio: z.string().nullable(),
  image: z.string().nullable(),
});

export const ProfileSchema = z.object({
  username: z.string(),
  bio: z.string().nullable(),
  image: z.string().nullable(),
  following: z.boolean(),
});

export const TagsSchema = z.array(z.string());

export const ErrorSchema = z.object({
  errors: z.record(z.string(), z.array(z.string().min(1)).min(1)),
});
