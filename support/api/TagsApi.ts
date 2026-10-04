import { APIRequestContext } from '@playwright/test';
import { unwrap } from './unwrap';

export interface TagsResult {
  status: number;
  tags: string[];
}

export class TagsApi {
  constructor(private readonly request: APIRequestContext) {}

  async getAll(): Promise<TagsResult> {
    const response = await this.request.get('/api/tags');
    const body = await response.json();

    return { 
      status: response.status(), 
      tags: unwrap(body, 'tags', response.status()) 
    };
  }
}
