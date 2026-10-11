import { APIRequestContext, APIResponse } from '@playwright/test';
import { Article } from '../types';
import { unwrap } from './unwrap';
import { expectStatus } from './expectStatus';

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

/** What a list endpoint returns once the status has been checked. */
export interface ArticleList {
  articles: Article[];
  articlesCount: number;
}

/**
 * Two methods per endpoint.
 *
 * `xxxRaw()` returns the response untouched. Negative tests use it: they want the status, the
 * raw text, the error envelope — things a parsed payload has thrown away.
 *
 * `xxx()` is for happy paths. It calls the Raw method, asserts the status that endpoint really
 * returns, and hands back the payload. Because the status is checked first, the payload is
 * always there, so nothing downstream has to ask whether it exists.
 */
export class ArticlesApi {
  constructor(private readonly request: APIRequestContext) {}

  private static buildParamsForURL(params?: ListArticlesParams | FeedParams): string {
    const query = new URLSearchParams();
    const p = params as ListArticlesParams | undefined;
    if (p?.tag) query.set('tag', p.tag);
    if (p?.author) query.set('author', p.author);
    if (p?.favorited) query.set('favorited', p.favorited);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.offset !== undefined) query.set('offset', String(params.offset));
    const qs = query.toString();
    return qs ? `?${qs}` : '';
  }

  async getAllRaw(params?: ListArticlesParams): Promise<APIResponse> {
    return await this.request.get(`/api/articles${ArticlesApi.buildParamsForURL(params)}`);
  }

  async getAll(params?: ListArticlesParams): Promise<ArticleList> {
    const response = await this.getAllRaw(params);
    await expectStatus(response, 200);
    // The body already is { articles, articlesCount } — nothing to dig out.
    return await response.json();
  }

  async getBySlugRaw(slug: string): Promise<APIResponse> {
    return await this.request.get(`/api/articles/${slug}`);
  }

  async getBySlug(slug: string): Promise<Article> {
    const response = await this.getBySlugRaw(slug);
    await expectStatus(response, 200);
    return unwrap(await response.json(), 'article');
  }

  async createArticleRaw(data: CreateArticleInput): Promise<APIResponse> {
    return await this.request.post('/api/articles', { data: { article: data } });
  }

  async createArticle(data: CreateArticleInput): Promise<Article> {
    const response = await this.createArticleRaw(data);
    await expectStatus(response, 201);
    return unwrap(await response.json(), 'article');
  }

  async updateRaw(slug: string, data: UpdateArticleInput): Promise<APIResponse> {
    return await this.request.put(`/api/articles/${slug}`, { data: { article: data } });
  }

  /** Changing the title changes the slug. Use the returned article's slug afterwards. */
  async update(slug: string, data: UpdateArticleInput): Promise<Article> {
    const response = await this.updateRaw(slug, data);
    await expectStatus(response, 200);
    return unwrap(await response.json(), 'article');
  }

  async deleteRaw(slug: string): Promise<APIResponse> {
    return await this.request.delete(`/api/articles/${slug}`);
  }

  async delete(slug: string): Promise<void> {
    const response = await this.deleteRaw(slug);
    await expectStatus(response, 204);
  }

  async favoriteRaw(slug: string): Promise<APIResponse> {
    return await this.request.post(`/api/articles/${slug}/favorite`);
  }

  async favorite(slug: string): Promise<Article> {
    const response = await this.favoriteRaw(slug);
    await expectStatus(response, 200);
    return unwrap(await response.json(), 'article');
  }

  async unfavoriteRaw(slug: string): Promise<APIResponse> {
    return await this.request.delete(`/api/articles/${slug}/favorite`);
  }

  async unfavorite(slug: string): Promise<Article> {
    const response = await this.unfavoriteRaw(slug);
    await expectStatus(response, 200);
    return unwrap(await response.json(), 'article');
  }

  async getFeedRaw(params?: FeedParams): Promise<APIResponse> {
    return await this.request.get(`/api/articles/feed${ArticlesApi.buildParamsForURL(params)}`);
  }

  async getFeed(params?: FeedParams): Promise<ArticleList> {
    const response = await this.getFeedRaw(params);
    await expectStatus(response, 200);
    return await response.json();
  }
}
