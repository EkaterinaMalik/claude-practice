import { APIRequestContext } from '@playwright/test';
import { Comment } from '../types';

export interface AddCommentResult {
  status: number;
  comment: Comment;
  errors?: Record<string, string[]>;
}

export interface ListCommentsResult {
  status: number;
  comments: Comment[];
}

export class CommentsApi {
  constructor(private readonly request: APIRequestContext) {}

  async list(slug: string): Promise<ListCommentsResult> {
    const response = await this.request.get(`/api/articles/${slug}/comments`);
    const body = await response.json();
    return { status: response.status(), comments: body.comments };
  }

  async create(slug: string, body?: string): Promise<AddCommentResult> {
    const response = await this.request.post(`/api/articles/${slug}/comments`, {
      data: { comment: { body } },
    });
    const res = await response.json();
    return { status: response.status(), comment: res.comment, errors: res.errors };
  }

  async delete(slug: string, id: number): Promise<{ status: number }> {
    const response = await this.request.delete(`/api/articles/${slug}/comments/${id}`);
    return { status: response.status() };
  }
}
