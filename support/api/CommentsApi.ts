import { APIRequestContext, APIResponse } from '@playwright/test';
import { Comment } from '../types';
import { unwrap } from './unwrap';
import { expectStatus } from './expectStatus';

/** See ArticlesApi for why every endpoint has a Raw method and a wrapper. */
export class CommentsApi {
  constructor(private readonly request: APIRequestContext) {}

  async listRaw(slug: string): Promise<APIResponse> {
    return await this.request.get(`/api/articles/${slug}/comments`);
  }

  async list(slug: string): Promise<Comment[]> {
    const response = await this.listRaw(slug);
    await expectStatus(response, 200);
    return unwrap(await response.json(), 'comments');
  }

  // body is optional so a negative test can send the field empty or missing.
  async createRaw(slug: string, body?: string): Promise<APIResponse> {
    return await this.request.post(`/api/articles/${slug}/comments`, { data: { comment: { body } } });
  }

  async create(slug: string, body: string): Promise<Comment> {
    const response = await this.createRaw(slug, body);
    await expectStatus(response, 200);
    return unwrap(await response.json(), 'comment');
  }

  async deleteRaw(slug: string, id: number): Promise<APIResponse> {
    return await this.request.delete(`/api/articles/${slug}/comments/${id}`);
  }

  async delete(slug: string, id: number): Promise<void> {
    const response = await this.deleteRaw(slug, id);
    await expectStatus(response, 200);
  }
}
