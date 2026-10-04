import { APIRequestContext } from '@playwright/test';
import { Profile } from '../types';
import { unwrap } from './unwrap';

export interface ProfileResult {
  status: number;
  profile: Profile;
}

export class ProfilesApi {
  constructor(private readonly request: APIRequestContext) {}

  async get(username: string): Promise<ProfileResult> {
    const response = await this.request.get(`/api/profiles/${encodeURIComponent(username)}`);
    const body = await response.json();

    return { 
      status: response.status(), 
      profile: unwrap(body, 'profile', response.status()) 
    };
  }

  async follow(username: string): Promise<ProfileResult> {
    const response = await this.request.post(`/api/profiles/${encodeURIComponent(username)}/follow`);
    const body = await response.json();

    return { 
      status: response.status(), 
      profile: unwrap(body, 'profile', response.status()) 
    };
  }

  async unfollow(username: string): Promise<ProfileResult> {
    const response = await this.request.delete(`/api/profiles/${encodeURIComponent(username)}/follow`);
    const body = await response.json();
    
    return { 
      status: response.status(), 
      profile: unwrap(body, 'profile', response.status()) 
    };
  }
}
