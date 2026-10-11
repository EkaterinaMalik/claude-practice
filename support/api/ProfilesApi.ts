import { APIRequestContext, APIResponse } from '@playwright/test';
import { Profile } from '../types';
import { unwrap } from './unwrap';
import { expectStatus } from './expectStatus';

/** See ArticlesApi for why every endpoint has a Raw method and a wrapper. */
export class ProfilesApi {
  constructor(private readonly request: APIRequestContext) {}

  private static path(username: string): string {
    return `/api/profiles/${encodeURIComponent(username)}`;
  }

  async getRaw(username: string): Promise<APIResponse> {
    return await this.request.get(ProfilesApi.path(username));
  }

  async get(username: string): Promise<Profile> {
    const response = await this.getRaw(username);
    await expectStatus(response, 200);
    return unwrap(await response.json(), 'profile');
  }

  async followRaw(username: string): Promise<APIResponse> {
    return await this.request.post(`${ProfilesApi.path(username)}/follow`);
  }

  async follow(username: string): Promise<Profile> {
    const response = await this.followRaw(username);
    await expectStatus(response, 200);
    return unwrap(await response.json(), 'profile');
  }

  async unfollowRaw(username: string): Promise<APIResponse> {
    return await this.request.delete(`${ProfilesApi.path(username)}/follow`);
  }

  async unfollow(username: string): Promise<Profile> {
    const response = await this.unfollowRaw(username);
    await expectStatus(response, 200);
    return unwrap(await response.json(), 'profile');
  }
}
