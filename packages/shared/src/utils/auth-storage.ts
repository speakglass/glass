import type { StorageAdapter } from './storage';

const TOKEN_KEY = 'glass:auth:token';
const USER_KEY = 'glass:auth:user';

export interface StoredUser {
  id: string;
  email: string;
  name?: string | null;
}

export class AuthStorage {
  constructor(private storage: StorageAdapter) {}

  async getToken(): Promise<string | null> {
    return this.storage.getItem(TOKEN_KEY);
  }

  async setToken(token: string): Promise<void> {
    await this.storage.setItem(TOKEN_KEY, token);
  }

  async removeToken(): Promise<void> {
    await this.storage.removeItem(TOKEN_KEY);
  }

  async getUser(): Promise<StoredUser | null> {
    const json = await this.storage.getItem(USER_KEY);
    if (!json) return null;
    try {
      return JSON.parse(json) as StoredUser;
    } catch {
      return null;
    }
  }

  async setUser(user: StoredUser): Promise<void> {
    await this.storage.setItem(USER_KEY, JSON.stringify(user));
  }

  async removeUser(): Promise<void> {
    await this.storage.removeItem(USER_KEY);
  }

  async clear(): Promise<void> {
    await this.removeToken();
    await this.removeUser();
  }
}
