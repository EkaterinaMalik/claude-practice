import { APIRequestContext, APIResponse } from '@playwright/test';
import { User } from '../types';
import { unwrap } from './unwrap';
import { expectStatus } from './expectStatus';

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateUserInput {
  email?: string;
  username?: string;
  password?: string;
  bio?: string;
  image?: string;
}

/** See ArticlesApi for why every endpoint has a Raw method and a wrapper. */
export class AuthApi {
  constructor(private readonly request: APIRequestContext) {}

  async registerRaw(data: RegisterInput): Promise<APIResponse> {
    return await this.request.post('/api/users', { data: { user: data } });
  }

  async register(data: RegisterInput): Promise<User> {
    const response = await this.registerRaw(data);
    await expectStatus(response, 201);
    return unwrap(await response.json(), 'user');
  }

  async loginRaw(data: LoginInput): Promise<APIResponse> {
    return await this.request.post('/api/users/login', { data: { user: data } });
  }

  async login(data: LoginInput): Promise<User> {
    const response = await this.loginRaw(data);
    await expectStatus(response, 200);
    return unwrap(await response.json(), 'user');
  }

  async getCurrentUserRaw(): Promise<APIResponse> {
    return await this.request.get('/api/user');
  }

  async getCurrentUser(): Promise<User> {
    const response = await this.getCurrentUserRaw();
    await expectStatus(response, 200);
    return unwrap(await response.json(), 'user');
  }

  async updateCurrentUserRaw(data: UpdateUserInput): Promise<APIResponse> {
    return await this.request.put('/api/user', { data: { user: data } });
  }

  async updateCurrentUser(data: UpdateUserInput): Promise<User> {
    const response = await this.updateCurrentUserRaw(data);
    await expectStatus(response, 200);
    return unwrap(await response.json(), 'user');
  }
}
