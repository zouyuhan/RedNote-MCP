import {Browser, BrowserContext, chromium, Cookie, Page} from 'playwright';
import {CookieManager} from './cookieManager';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

dotenv.config();

export class AuthManager {
  private browser: Browser | null;
  private context: BrowserContext | null;
  private page: Page | null;
  private cookieManager: CookieManager;

  constructor(cookiePath?: string) {
    this.browser = null;
    this.context = null;
    this.page = null;

    // Set default cookie path to ~/.mcp/rednote/cookies.json
    if (!cookiePath) {
      const homeDir = os.homedir();
      const mcpDir = path.join(homeDir, '.mcp');
      const rednoteDir = path.join(mcpDir, 'rednote');

      // Create directories if they don't exist
      if (!fs.existsSync(mcpDir)) {
        fs.mkdirSync(mcpDir);
      }
      if (!fs.existsSync(rednoteDir)) {
        fs.mkdirSync(rednoteDir);
      }

      cookiePath = path.join(rednoteDir, 'cookies.json');
    }

    this.cookieManager = new CookieManager(cookiePath);
  }

  async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: false,
      });
    }
    return this.browser;
  }

  async getCookies(): Promise<Cookie[]> {
    return await this.cookieManager.loadCookies();
  }

  async login(): Promise<void> {
    this.browser = await chromium.launch({headless: false});
    if (!this.browser) {
      throw new Error('Failed to launch browser');
    }

    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        this.context = await this.browser.newContext();
        this.page = await this.context.newPage();

        // Load existing cookies if available
        const cookies = await this.cookieManager.loadCookies();
        if (cookies && cookies.length > 0) {
          await this.context.addCookies(cookies);
        }

        // Navigate to explore page
        await this.page.goto('https://www.xiaohongshu.com/explore', {
          waitUntil: 'domcontentloaded',
          timeout: 10000
        });

        // Check if already logged in
        const userSidebar = await this.page.$('.user.side-bar-component .channel');
        if (userSidebar) {
          const isLoggedIn = await this.page.evaluate(() => {
            const sidebarUser = document.querySelector('.user.side-bar-component .channel');
            return sidebarUser?.textContent?.trim() === '我';
          });

          if (isLoggedIn) {
            // Already logged in, save cookies and return
            const newCookies = await this.context.cookies();
            await this.cookieManager.saveCookies(newCookies);
            return;
          }
        }

        // Wait for login dialog if not logged in
        await this.page.waitForSelector('.login-container', {
          timeout: 10000
        });

        // Wait for QR code image
        const qrCodeImage = await this.page.waitForSelector('.qrcode-img', {
          timeout: 10000
        });

        // Wait for user to complete login
        await this.page.waitForSelector('.user.side-bar-component .channel', {
          timeout: 60000
        });

        // Verify the text content
        const isLoggedIn = await this.page.evaluate(() => {
          const sidebarUser = document.querySelector('.user.side-bar-component .channel');
          return sidebarUser?.textContent?.trim() === '我';
        });

        if (!isLoggedIn) {
          throw new Error('Login verification failed');
        }

        // Save cookies after successful login
        const newCookies = await this.context.cookies();
        await this.cookieManager.saveCookies(newCookies);
        return;
      } catch (error) {
        // Clean up current session
        if (this.page) await this.page.close();
        if (this.context) await this.context.close();

        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          throw new Error('Login failed after maximum retries');
        }
      }
    }
  }

  async cleanup(): Promise<void> {
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}
