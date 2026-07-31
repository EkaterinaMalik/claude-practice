export interface Author {
  username: string;
  bio: string | null;
  image: string | null;
  following: boolean;
}

export interface Article {
  slug: string;
  title: string;
  description: string;
  body: string;
  tagList: string[];
  createdAt: string;
  updatedAt: string;
  favorited: boolean;
  favoritesCount: number;
  author: Author;
}

export interface Comment {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: Author;
}

export interface Profile {
  username: string;
  bio: string | null;
  image: string | null;
  following: boolean;
}

export interface User {
  email: string;
  token: string;
  username: string;
  bio: string | null;
  image: string | null;
}
