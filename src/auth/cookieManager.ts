import fs from 'fs';
import path from 'path';
import { Cookie } from 'playwright';

export class CookieManager {
  private readonly cookiePath: string;

  constructor(cookiePath: string) {
    this.cookiePath = cookiePath;
  }

  async saveCookies(cookies: Cookie[]): Promise<void> {
    const dir = path.dirname(this.cookiePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await fs.promises.writeFile(this.cookiePath, JSON.stringify(cookies, null, 2));
  }

  async loadCookies(): Promise<Cookie[]> {
    if (!fs.existsSync(this.cookiePath)) {
      return [];
    }
    const data = await fs.promises.readFile(this.cookiePath, 'utf-8');
    return JSON.parse(data);
  }

  async clearCookies(): Promise<void> {
    if (fs.existsSync(this.cookiePath)) {
      await fs.promises.unlink(this.cookiePath);
    }
  }
}
