import { AuthManager } from '../auth/authManager';
import { Browser, Page } from 'playwright';

interface Note {
  title: string;
  content: string;
  url: string;
  author: string;
  likes: number;
  collects: number;
  comments: number;
}

interface Comment {
  author: string;
  content: string;
  likes: number;
  time: string;
}

export class RedNoteTools {
  private authManager: AuthManager;
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor() {
    this.authManager = new AuthManager();
  }

  /**
   * Wait for a random duration between min and max seconds
   * @param min Minimum seconds to wait
   * @param max Maximum seconds to wait
   */
  private async randomDelay(min: number, max: number): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    const ms = Math.floor(Math.random() * (max - min) * 1000) + min * 1000;
    await this.page.waitForTimeout(ms);
  }

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await this.authManager.getBrowser();
      this.page = await this.browser.newPage();

      // Load cookies if available
      const cookies = await this.authManager.getCookies();
      if (cookies.length > 0) {
        await this.page.context().addCookies(cookies);
      }

      // Check login status
      await this.page.goto('https://www.xiaohongshu.com');
      const isLoggedIn = await this.page.evaluate(() => {
        const sidebarUser = document.querySelector('.user.side-bar-component .channel');
        return sidebarUser?.textContent?.trim() === '我';
      });

      // If not logged in, perform login
      if (!isLoggedIn) {
        console.error('需要登录小红书账号，请使用 login 进行登录');
        throw new Error('Not logged in');
      }
    }
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  async searchNotes(keywords: string, limit: number = 10): Promise<Note[]> {
    await this.initialize();
    if (!this.page) throw new Error('Page not initialized');

    try {
      // Navigate to search page
      await this.page.goto(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keywords)}`);

      // Wait for search results to load
      await this.page.waitForSelector('.feeds-container', {
        timeout: 30000
      });

      // Get all note items
      let noteItems = await this.page.$$('.feeds-container .note-item');
      const notes: Note[] = [];

      // Process each note
      for (let i = 0; i < Math.min(noteItems.length, limit); i++) {
        try {
          // Click on the note cover to open detail
          await noteItems[i].$eval('a.cover.mask.ld', (el: HTMLElement) => el.click());

          // Wait for the note page to load
          await this.page.waitForSelector('#noteContainer', {
            timeout: 30000
          });
          
          await this.randomDelay(0.5, 1.5);

          // Extract note content
          const note = await this.page.evaluate(() => {
            const article = document.querySelector('#noteContainer');
            if (!article) return null;

            // Get title
            const titleElement = article.querySelector('#detail-title');
            const title = titleElement?.textContent?.trim() || '';

            // Get content
            const contentElement = article.querySelector('#detail-desc .note-text');
            const content = contentElement?.textContent?.trim() || '';

            // Get author info
            const authorElement = article.querySelector('.author-wrapper .username');
            const author = authorElement?.textContent?.trim() || '';

            // Get interaction counts from engage-bar
            const engageBar = document.querySelector('.engage-bar-style');
            const likesElement = engageBar?.querySelector('.like-wrapper .count');
            const likes = parseInt(likesElement?.textContent?.replace(/[^\d]/g, '') || '0');

            const collectElement = engageBar?.querySelector('.collect-wrapper .count');
            const collects = parseInt(collectElement?.textContent?.replace(/[^\d]/g, '') || '0');

            const commentsElement = engageBar?.querySelector('.chat-wrapper .count');
            const comments = parseInt(commentsElement?.textContent?.replace(/[^\d]/g, '') || '0');

            return {
              title,
              content,
              url: window.location.href,
              author,
              likes,
              collects,
              comments
            };
          });

          if (note) {
            notes.push(note);
          }

          // Add random delay before closing
          await this.randomDelay(0.5, 1);

          // Close note by clicking the close button
          const closeButton = await this.page.$('.close-circle');
          if (closeButton) {
            await closeButton.click();

            // Wait for note dialog to disappear
            await this.page.waitForSelector('#noteContainer', {
              state: 'detached',
              timeout: 30000
            });
          }
        } catch (error) {
          const closeButton = await this.page.$('.close-circle');
          if (closeButton) {
            await closeButton.click();

            // Wait for note dialog to disappear
            await this.page.waitForSelector('#noteContainer', {
              state: 'detached',
              timeout: 30000
            });
          }
        } finally {
          // Add random delay before next note
          await this.randomDelay(0.5, 1.5);
        }
      }

      return notes;
    } finally {
      await this.cleanup();
    }
  }

  async getNoteContent(url: string): Promise<Note> {
    await this.initialize();
    if (!this.page) throw new Error('Page not initialized');

    try {
      await this.page.goto(url);

      // Wait for content to load
      await this.page.waitForSelector('main article');

      // Extract note content
      const note = await this.page.evaluate(() => {
        // Get main article content
        const article = document.querySelector('main article');
        if (!article) throw new Error('Article not found');

        // Get title from h1 or first text block
        const title = article.querySelector('h1')?.textContent?.trim() ||
                     article.querySelector('.title')?.textContent?.trim() || '';

        // Get content from article text
        const contentBlocks = Array.from(article.querySelectorAll('p, .content'));
        const content = contentBlocks.map(block => block.textContent?.trim()).filter(Boolean).join('\n');

        // Get author info
        const authorElement = article.querySelector('.author, [data-testid="author-name"]');
        const author = authorElement?.textContent?.trim() || '';

        // Get interaction counts
        const likesElement = article.querySelector('.like-count, [data-testid="likes-count"]');
        const likes = parseInt(likesElement?.textContent || '0');

        const commentsElement = article.querySelector('.comment-count, [data-testid="comments-count"]');
        const comments = parseInt(commentsElement?.textContent || '0');

        return {
          title,
          content,
          url: window.location.href,
          author,
          likes,
          collects: 0,
          comments
        };
      });

      return note;
    } finally {
      await this.cleanup();
    }
  }

  async getNoteComments(url: string): Promise<Comment[]> {
    await this.initialize();
    if (!this.page) throw new Error('Page not initialized');

    try {
      await this.page.goto(url);

      // Wait for comments to load
      await this.page.waitForSelector('[role="dialog"] [role="list"]');

      // Extract comments
      const comments = await this.page.evaluate(() => {
        const items = document.querySelectorAll('[role="dialog"] [role="list"] [role="listitem"]');
        const results: Comment[] = [];

        items.forEach(item => {
          const author = item.querySelector('[data-testid="user-name"]')?.textContent?.trim() || '';
          const content = item.querySelector('[data-testid="comment-content"]')?.textContent?.trim() || '';
          const likes = parseInt(item.querySelector('[data-testid="likes-count"]')?.textContent || '0');
          const time = item.querySelector('time')?.textContent?.trim() || '';

          results.push({ author, content, likes, time });
        });

        return results;
      });

      return comments;
    } finally {
      await this.cleanup();
    }
  }
}
