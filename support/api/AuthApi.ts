import { APIRequestContext } from '@playwright/test';
import { User } from '../types';

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

// ?: optional fields, could be omitted
export interface UpdateUserInput {
  email?: string;
  username?: string;
  password?: string;
  bio?: string;
  image?: string;
}

export interface AuthResult {
  status: number;
  user?: User;
  errors?: Record<string, string[]>;
}

export class AuthApi {
  constructor(private readonly request: APIRequestContext) {}

  async register(data: RegisterInput): Promise<AuthResult> {
    const response = await this.request.post('/api/users', {
      data: { user: data },
    });
    const body = await response.json();
    return { status: response.status(), user: body.user, errors: body.errors };
  }

  async login(data: LoginInput): Promise<AuthResult> {
    const response = await this.request.post('/api/users/login', {
      data: { user: data },
    });
    const body = await response.json();
    return { status: response.status(), user: body.user, errors: body.errors };
  }

  async getCurrentUser(): Promise<AuthResult> {
    const response = await this.request.get('/api/user');
    const body = await response.json();
    return {
       status: response.status(), 
       user: body.user 
    };
  }

  async updateCurrentUser(data: UpdateUserInput): Promise<AuthResult> {
    const response = await this.request.put('/api/user', {
      data: { user: data },
    });
    const body = await response.json();
    return { status: response.status(), user: body.user, errors: body.errors };
  }
}
