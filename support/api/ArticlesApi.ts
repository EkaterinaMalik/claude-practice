import { APIRequestContext } from '@playwright/test';
import { Article } from '../types';

export interface CreateArticleInput {
  title: string;
  description: string;
  body: string;
  tagList?: string[];
}

export interface UpdateArticleInput {
  title?: string;
  description?: string;
  body?: string;
}

export interface ListArticlesParams {
  tag?: string;
  author?: string;
  favorited?: string;
  limit?: number;
  offset?: number;
}

export interface FeedParams {
  limit?: number;
  offset?: number;
}

export interface ArticleResult {
  status: number;
  article: Article;
  errors?: Record<string, string[]>;
}

export interface ListArticlesResult {
  status: number;
  articles: Article[];
  articlesCount: number;
}

export class ArticlesApi {
  constructor(private readonly request: APIRequestContext) {}

  async getAll(params?: ListArticlesParams): Promise<ListArticlesResult> {
    const query = new URLSearchParams();
    if (params?.tag) query.set('tag', params.tag);
    if (params?.author) query.set('author', params.author);
    if (params?.favorited) query.set('favorited', params.favorited);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.offset !== undefined) query.set('offset', String(params.offset));
    const qs = query.toString();
    const response = await this.request.get(`/api/articles${qs ? `?${qs}` : ''}`);
    const body = await response.json();
    return { status: response.status(), articles: body.articles, articlesCount: body.articlesCount };
  }

  async getBySlug(slug: string): Promise<ArticleResult> {
    const response = await this.request.get(`/api/articles/${slug}`);
    const body = await response.json();
    return { status: response.status(), article: body.article };
  }

  async create(data: CreateArticleInput): Promise<ArticleResult> {
    const response = await this.request.post('/api/articles', {
      data: { 
        article: data 
      },
    });
    const body = await response.json();

    // return a new object with properties: 
    // { status: value, 
    // article: value,
    //  and errors: value
    //}
    // type: interface 'ArticleResult'
    return {
      status: response.status(),
      article: body.article,
      errors: body.errors
    };
  }

  async update(slug: string, data: UpdateArticleInput): Promise<ArticleResult> {
    const response = await this.request.put(`/api/articles/${slug}`, {
      data: { article: data },
    });
    const body = await response.json();
    return { 
      status: response.status(),
      article: body.article 
    };
  }

  async delete(slug: string): Promise<{ status: number }> {
    const response = await this.request.delete(`/api/articles/${slug}`);
    return { 
      status: response.status() 
    };
  }

  async favorite(slug: string): Promise<ArticleResult> {
    const response = await this.request.post(`/api/articles/${slug}/favorite`);
    const body = await response.json();
    return { 
      status: response.status(),
       article: body.article 
    };
  }

  async unfavorite(slug: string): Promise<ArticleResult> {
    const response = await this.request.delete(`/api/articles/${slug}/favorite`);
    const body = await response.json();
    return { status: response.status(), article: body.article };
  }

  async getFeed(params?: FeedParams): Promise<ListArticlesResult> {
    const query = new URLSearchParams();
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.offset !== undefined) query.set('offset', String(params.offset));
    const qs = query.toString();
    const response = await this.request.get(`/api/articles/feed${qs ? `?${qs}` : ''}`);
    const body = await response.json();
    return { 
      status: response.status(),
      articles: body.articles, 
      articlesCount: body.articlesCount 
    };
  }
}
