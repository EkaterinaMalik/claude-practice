import { APIRequestContext, APIResponse } from '@playwright/test';
import { unwrap } from './unwrap';
import { expectStatus } from './expectStatus';

/** See ArticlesApi for why every endpoint has a Raw method and a wrapper. */
export class TagsApi {
  constructor(private readonly request: APIRequestContext) {}

  async getAllRaw(): Promise<APIResponse> {
    return await this.request.get('/api/tags');
  }

  async getAll(): Promise<string[]> {
    const response = await this.getAllRaw();
    await expectStatus(response, 200);
    return unwrap(await response.json(), 'tags');
  }
}
