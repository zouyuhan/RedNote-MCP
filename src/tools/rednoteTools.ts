import { AuthManager } from '../auth/authManager'
import { Browser, ElementHandle, Page } from 'playwright'
import logger from '../utils/logger'
import { getNoteDetail, getUserDetailInNotePage, getNoteImages, removeDuplicateStrings, NoteTitle} from './noteDetail'
import { NoteDetail, UserDetail, Note, Comment } from './noteDetail'
import { NoteAction, postNoteAction } from './noteAction'
import { boolean } from 'zod'

export class RedNoteTools {
  private authManager: AuthManager
  private browser: Browser | null = null
  private page: Page | null = null

  constructor() {
    logger.info('Initializing RedNoteTools')
    this.authManager = new AuthManager()
  }

  async initialize(headless: boolean = false): Promise<void> {
    logger.info('Initializing browser and page')
    this.browser = await this.authManager.getBrowser(headless)
    if (!this.browser) {
      throw new Error('Failed to initialize browser')
    }
    
    try {
      this.page = await this.browser.newPage()
      
      // Load cookies if available
      const cookies = await this.authManager.getCookies()
      if (cookies.length > 0) {
        logger.info(`Loading ${cookies.length} cookies`)
        await this.page.context().addCookies(cookies)
      }

      // Check login status
      logger.info('Checking login status')
      await this.page.goto('https://www.xiaohongshu.com')
      const isLoggedIn = await this.page.evaluate(() => {
        const sidebarUser = document.querySelector('.user.side-bar-component .channel')
        return sidebarUser?.textContent?.trim() === '我'
      })

      // If not logged in, perform login
      if (!isLoggedIn) {
        logger.error('Not logged in, please login first')
        throw new Error('Not logged in')
      }
      logger.info('Login status verified')
    } catch (error) {
      // 初始化过程中出错，确保清理资源
      await this.cleanup()
      throw error
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up browser resources')
    try {
      if (this.page) {
        await this.page.close().catch(err => logger.error('Error closing page:', err))
        this.page = null
      }
      
      if (this.browser) {
        await this.browser.close().catch(err => logger.error('Error closing browser:', err))
        this.browser = null
      }
    } catch (error) {
      logger.error('Error during cleanup:', error)
    } finally {
      this.page = null
      this.browser = null
    }
  }

  extractRedBookUrl(shareText: string): string {
    // 匹配 http://xhslink.com/ 开头的链接
    const xhslinkRegex = /(https?:\/\/xhslink\.com\/[a-zA-Z0-9\/]+)/i
    const xhslinkMatch = shareText.match(xhslinkRegex)

    if (xhslinkMatch && xhslinkMatch[1]) {
      return xhslinkMatch[1]
    }

    // 匹配 https://www.xiaohongshu.com/ 开头的链接
    const xiaohongshuRegex = /(https?:\/\/(?:www\.)?xiaohongshu\.com\/[^，\s]+)/i
    const xiaohongshuMatch = shareText.match(xiaohongshuRegex)

    if (xiaohongshuMatch && xiaohongshuMatch[1]) {
      return xiaohongshuMatch[1]
    }

    return shareText
  }

  async searchNotesAndGetContents(
    keywords: string,
    sort_type: string = 'default',
    period: string = 'all',
    limit: number = 10,
    with_images: boolean = false): Promise<Note[]> {
    logger.info(`Searching notes with keywords: ${keywords}, limit: ${limit}`)

    try {
      await this.initialize()
      if (!this.page) throw new Error('Page not initialized')

      // Navigate to search page
      logger.info('Navigating to search page')
      await this.page.goto(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keywords)}&source=web_explore_feed`)

      // Wait for search results to load
      logger.info('Waiting for search results')
      await this.page.waitForSelector('.feeds-container', {
        timeout: 60000
      })

      await this.randomDelay(0.5, 1.5)
      
      async function clickSearchFilter(page: Page, filter_tag: string) {
        try {
          logger.info(`Waiting for use filter "${filter_tag}"`)

          // 悬停"筛选"在上，获取用户数据
          const filterButtonSelector = '.search-layout .filter'
          await page.waitForSelector(filterButtonSelector, {
            timeout: 30000
          })
          await page.hover(filterButtonSelector)

          const wait_time = Math.random() * (1500 - 500) + 500
          await new Promise((resolve) => setTimeout(resolve, wait_time))

          const filterSelector = '.search-layout .filter-panel .filter-container' // 根據實際彈窗 class 調整
          await page.waitForSelector(filterSelector, {
            timeout: 3000
          })

          logger.info(`Use filter "${filter_tag}"`)

          const filterSpan = await page.getByText(filter_tag)
          if (filterSpan) {
            await filterSpan.click()
          }

          await new Promise((resolve) => setTimeout(resolve, wait_time))

          page.mouse.move(0, 0)

          await new Promise((resolve) => setTimeout(resolve, wait_time))

          logger.info(`Waiting for search results after filter "${filter_tag}"`)
          await page.waitForSelector('.feeds-container', {
            timeout: 60000
          })

        } catch (error) {
          logger.error(`Error applying search filter "${filter_tag}":`, error)
          // Continue execution despite filter error
        }
      }

      if (sort_type === 'most_liked') {
        await clickSearchFilter(this.page, '最多点赞')
      } else if (sort_type === 'latest') {
        await clickSearchFilter(this.page, '最新')
      }

      if (period === 'day') {
        await clickSearchFilter(this.page, '一天内')
      } else if (period === 'week') {
        await clickSearchFilter(this.page, '一周内')
      } else if (period === 'half_year') {
        await clickSearchFilter(this.page, '半年内')
      }

      // Get all note items
      let note_titles: NoteTitle[] = []
      let notes: Note[] = []

      let scrollHeight = await this.page.evaluate(() => document.body.scrollHeight);
      let currentScrollY = await this.page.evaluate(() => window.scrollY);
      let lastScrollY = -1;

      while (notes.length < limit && currentScrollY != lastScrollY && currentScrollY < scrollHeight) {
        await this.page.waitForSelector('.feeds-container .note-item')

        let noteItems = await this.page.$$('.feeds-container .note-item')
        // 每次最多抓取12篇笔记
        for (let i = 0, j = 0; i < noteItems.length && j < 12; i++, j++) {
          const is_added = await this.addNoteItemToList(note_titles, noteItems[i])
          if (is_added) {
            await this.moveMouseRandomly(this.page)

            const note = await this.getNoteContentInNotePage(this.page, noteItems[i], with_images)
            if (note) {
              notes.push(note)
            }
          }
        }

        logger.info(`Scrolling page down, currentScrollY: ${currentScrollY}, scrollHeight: ${scrollHeight}`)
        const scroll_step = Math.random() * 500 + 500
        await this.page.mouse.wheel(0, scroll_step);
        await this.page.waitForTimeout(1000);

        lastScrollY = currentScrollY;
        scrollHeight = await this.page.evaluate(() => document.body.scrollHeight);
        currentScrollY = await this.page.evaluate(() => window.scrollY);
      }

      logger.info(`Successfully processed ${notes.length} notes`)
      return notes
    } catch (error) {
      logger.error('Error searching notes:', error)
      throw error
    } finally {
      await this.cleanup()
    }
  }

  async getUserNotesAndGetContents(
    userUrl: string, 
    limit: number = 10,
    with_images: boolean = false): Promise<Note[]> {
    logger.info(`Getting user notes list for URL: ${userUrl} with limit: ${limit}`)

    try {
      await this.initialize()
      if (!this.page) throw new Error('Page not initialized')

      // 訪問用戶主頁
      await this.page.goto(userUrl)
      
      // 等待文章列表加載
      logger.info('Waiting for user notes to load')
      await this.page.waitForSelector('.feeds-container')

      // Get all note items
      let note_titles: NoteTitle[] = []
      let notes: Note[] = []

      let scrollHeight = await this.page.evaluate(() => document.body.scrollHeight);
      let currentScrollY = await this.page.evaluate(() => window.scrollY);
      let lastScrollY = -1;

      while (notes.length < limit && currentScrollY != lastScrollY && currentScrollY < scrollHeight) {
        await this.page.waitForSelector('.feeds-container .note-item')

        let noteItems = await this.page.$$('.feeds-container .note-item')
        // 每次最多抓取10篇笔记，就翻页一下
        for (let i = 0, j = 0; i < noteItems.length && j < 5; i++, j++) {
          const is_added = await this.addNoteItemToList(note_titles, noteItems[i])
          if (is_added) {
            await this.moveMouseRandomly(this.page)

            const note = await this.getNoteContentInNotePage(this.page, noteItems[i], with_images)
            if (note) {
              notes.push(note)
            }
          }
        }

        logger.info(`Scrolling page down, currentScrollY: ${currentScrollY}, scrollHeight: ${scrollHeight}`)
        const scroll_step = Math.random() * 300 + 200
        await this.page.mouse.wheel(0, scroll_step);
        await this.page.waitForTimeout(1000);

        lastScrollY = currentScrollY;
        scrollHeight = await this.page.evaluate(() => document.body.scrollHeight);
        currentScrollY = await this.page.evaluate(() => window.scrollY);
      }

      logger.info(`Successfully processed ${notes.length} notes`)
      return notes
    } catch (error) {
      logger.error('Error getting user notes list:', error)
      throw error
    } finally {
      await this.cleanup()
    }
  }

  // async getUserNotesAndGetContents(userUrl: string, limit: number = 10, with_images: boolean = false): Promise<Note[]> {
  //   logger.info(`Getting user notes for URL: ${userUrl} with limit: ${limit}`)
  //   try {
  //     await this.initialize()
  //     if (!this.page) throw new Error('Page not initialized')

  //     // 訪問用戶主頁
  //     await this.page.goto(userUrl)
  //     
  //     // 等待文章列表加載
  //     logger.info('Waiting for user notes to load')
  //     await this.page.waitForSelector('.feeds-container')

  //     // Get all note items
  //     let noteItems = await this.page.$$('.feeds-container .note-item')
  //     logger.info(`Found ${noteItems.length} note items`)
  //     const notes: Note[] = []

  //     while (notes.length < limit) {
  //       // Process each note
  //       for (let i = 0; i < Math.min(noteItems.length, limit); i++) {
  //         logger.info(`Processing note ${i + 1}/${Math.min(noteItems.length, limit)}`)

  //         try {
  //           logger.info(noteItems[i])
  //           // Click on the note cover to open detail
  //           await noteItems[i].$eval('a.cover.mask.ld', (el: HTMLElement) => el.click())

  //           // Wait for the note page to load
  //           logger.info('Waiting for note page to load')
  //           await this.page.waitForSelector('#noteContainer', {
  //             timeout: 30000
  //           })

  //           await this.randomDelay(0.5, 1.5)

  //           // Extract note content
  //           const note_details = await getNoteDetail(this.page) 
  //           if (note_details) {
  //             let user_details = await getUserDetailInNotePage(this.page)

  //             let note_images: string[] = []
  //             if (with_images) {
  //               note_images = await getNoteImages(note_details.imgs_url || [])
  //             }

  //             notes.push({
  //               user_details: user_details,
  //               note_details: note_details,
  //               note_images: note_images,
  //             })
  //           }

  //           // Add random delay before closing
  //           await this.randomDelay(1.0, 2.5)

  //           // Close note by clicking the close button
  //           const closeButton = await this.page.$('.close-circle')
  //           if (closeButton) {
  //             logger.info('Closing note dialog')
  //             await closeButton.click()

  //             // Wait for note dialog to disappear
  //             await this.page.waitForSelector('#noteContainer', {
  //               state: 'detached',
  //               timeout: 30000
  //             })
  //           }
  //         } catch (error) {
  //           logger.error(`Error processing note ${i + 1}:`, error)
  //           const closeButton = await this.page.$('.close-circle')
  //           if (closeButton) {
  //             logger.info('Attempting to close note dialog after error')
  //             await closeButton.click()

  //             // Wait for note dialog to disappear
  //             await this.page.waitForSelector('#noteContainer', {
  //               state: 'detached',
  //               timeout: 30000
  //             })
  //           }
  //         } finally {
  //           // Add random delay before next note
  //           await this.randomDelay(0.5, 1.5)
  //         }

  //         if (notes.length >= limit) {
  //           logger.info('Reached limit of search results')
  //           break
  //         }
  //       } 

  //       // // 滾動到頁面底部以加載更多文章
  //       // await this.page.evaluate(() => {
  //       //   window.scrollTo(0, document.body.scrollHeight)
  //       // })

  //       // // 等待新內容加載
  //       // await this.page.waitForTimeout(1000)

  //       // // 檢查是否已經到底部
  //       // const isBottom = await this.page.evaluate(() => {
  //       //   return window.innerHeight + window.scrollY >= document.body.scrollHeight
  //       // })

  //       // if (isBottom) {
  //       //   logger.info('Reached end of user notes')
  //       //   break
  //       // }
  //     }

  //     logger.info(`Successfully retrieved ${notes.length} user notes`)
  //     return notes
  //   } catch (error) {
  //     logger.error('Error getting user notes:', error)
  //     throw error
  //   } finally {
  //     await this.cleanup()
  //   }
  // }

  async getUserNotes(userUrl: string, limit: number = 10): Promise<NoteDetail[]> {
    logger.info(`Getting user notes for URL: ${userUrl} with limit: ${limit}`)
    try {
      await this.initialize()
      if (!this.page) throw new Error('Page not initialized')

      // 訪問用戶主頁
      await this.page.goto(userUrl)
      
      // 等待文章列表加載
      logger.info('Waiting for user notes to load')
      await this.page.waitForSelector('.feeds-container')

      // Get all note items
      let noteItems = await this.page.$$('.feeds-container .note-item')
      logger.info(`Found ${noteItems.length} note items`)
      const notes: NoteDetail[] = []

      while (notes.length < limit) {
        // Process each note
        for (let i = 0; i < Math.min(noteItems.length, limit); i++) {
          logger.info(`Processing note ${i + 1}/${Math.min(noteItems.length, limit)}`)

          try {
            logger.info(noteItems[i])
            // Click on the note cover to open detail
            await noteItems[i].$eval('a.cover.mask.ld', (el: HTMLElement) => el.click())

            // Wait for the note page to load
            logger.info('Waiting for note page to load')
            await this.page.waitForSelector('#noteContainer', {
              timeout: 30000
            })

            await this.randomDelay(0.5, 1.5)

            // Extract note content
            const note = await this.page.evaluate(() => {
              const article = document.querySelector('#noteContainer')
              if (!article) return null

              // Get title
              const titleElement = article.querySelector('#detail-title')
              const title = titleElement?.textContent?.trim() || ''

              // Get content
              const contentElement = article.querySelector('#detail-desc .note-text')
              const content = contentElement?.textContent?.trim() || ''

              // Get author info
              const authorElement = article.querySelector('.author-wrapper .username')
              const author = authorElement?.textContent?.trim() || ''

              // Get interaction counts from engage-bar
              const engageBar = document.querySelector('.engage-bar-style')
              const likesElement = engageBar?.querySelector('.like-wrapper .count')
              const likes = parseInt(likesElement?.textContent?.replace(/[^\d]/g, '') || '0')

              const collectElement = engageBar?.querySelector('.collect-wrapper .count')
              const collects = parseInt(collectElement?.textContent?.replace(/[^\d]/g, '') || '0')

              const commentsElement = engageBar?.querySelector('.chat-wrapper .count')
              const comments = parseInt(commentsElement?.textContent?.replace(/[^\d]/g, '') || '0')

              const imgs_url = Array.from(document.querySelectorAll('.media-container img')).map((img) => {
                return img.getAttribute('src') || ''
              })

              const videos_url = Array.from(document.querySelectorAll('.media-container video')).map((video) => {
                return video.getAttribute('src') || ''
              })

              return {
                title,
                content,
                url: window.location.href,
                author,
                likes,
                collects,
                comments,
                imgs_url,
                videos_url,
              } as NoteDetail
            })

            if (note) {
              if (note.imgs_url) note.imgs_url = removeDuplicateStrings(note.imgs_url)
              if (note.videos_url) note.videos_url = removeDuplicateStrings(note.videos_url)

              logger.info(`Extracted note: ${note.title}`)
              notes.push(note as NoteDetail)
            }

            // Add random delay before closing
            await this.randomDelay(1.0, 2.5)

            // Close note by clicking the close button
            const closeButton = await this.page.$('.close-circle')
            if (closeButton) {
              logger.info('Closing note dialog')
              await closeButton.click()

              // Wait for note dialog to disappear
              await this.page.waitForSelector('#noteContainer', {
                state: 'detached',
                timeout: 30000
              })
            }
          } catch (error) {
            logger.error(`Error processing note ${i + 1}:`, error)
            const closeButton = await this.page.$('.close-circle')
            if (closeButton) {
              logger.info('Attempting to close note dialog after error')
              await closeButton.click()

              // Wait for note dialog to disappear
              await this.page.waitForSelector('#noteContainer', {
                state: 'detached',
                timeout: 30000
              })
            }
          } finally {
            // Add random delay before next note
            await this.randomDelay(0.5, 1.5)
          }

          if (notes.length >= limit) {
            logger.info('Reached limit of user notes')
            break
          }
        } 
        
        // 滾動到頁面底部以加載更多文章
        await this.page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight)
        })

        // 等待新內容加載
        await this.page.waitForTimeout(1000)

        // 檢查是否已經到底部
        const isBottom = await this.page.evaluate(() => {
          return window.innerHeight + window.scrollY >= document.body.scrollHeight
        })

        if (isBottom) {
          logger.info('Reached end of user notes')
          break
        }
      }

      logger.info(`Successfully retrieved ${notes.length} user notes`)
      return notes
    } catch (error) {
      logger.error('Error getting user notes:', error)
      throw error
    } finally {
      await this.cleanup()
    }
  }

  async getNoteContent(url: string): Promise<Note> {
    logger.info(`Getting note content for URL: ${url}`)
    try {
      await this.initialize()
      if (!this.page) throw new Error('Page not initialized')

      const actualURL = this.extractRedBookUrl(url)
      await this.page.goto(actualURL)
      let note = await getNoteDetail(this.page)
      note.url = url
      let user = await getUserDetailInNotePage(this.page)
      const imageBase64Array: string[] = await getNoteImages(note.imgs_url || [])
      logger.info(`Successfully extracted note: ${note.title}`)
      return {
        user_details: user,
        note_details: note,
        note_images: imageBase64Array,
      }
    } catch (error) {
      logger.error('Error getting note content:', error)
      throw error
    } finally {
      await this.cleanup()
    }
  }

  async postNoteActionList(noteActionList: NoteAction[]): Promise<boolean[]> {
    logger.info(`Posting note action list: ${noteActionList.length}`)

    try {
      await this.initialize()
      if (!this.page) throw new Error('Page not initialized')

      const result: boolean[] = []
      for (const action of noteActionList) {
        try {
            await this.page.goto(action.url)
            const res = await postNoteAction(this.page, action)
            result.push(res)

            logger.info(`Post note action: ${action.title} ${action.url} ${action.action} ${action.comment} ${res}`)
        } catch (error) {
            logger.error(`Error posting note action: ${error}`)
            result.push(false)
        }
      }
      return result
    } catch (error) {
      logger.error('Error posting note action list:', error)
      throw error
    } finally {
      await this.cleanup()
    }
  }

  async getNoteComments(url: string): Promise<Comment[]> {
    logger.info(`Getting comments for URL: ${url}`)
    try {
      await this.initialize()
      if (!this.page) throw new Error('Page not initialized')

      await this.page.goto(url)

      // Wait for comments to load
      logger.info('Waiting for comments to load')
      await this.page.waitForSelector('[role="dialog"] [role="list"]')

      // Extract comments
      const comments = await this.page.evaluate(() => {
        const items = document.querySelectorAll('[role="dialog"] [role="list"] [role="listitem"]')
        const results: Comment[] = []

        items.forEach((item) => {
          const author = item.querySelector('[data-testid="user-name"]')?.textContent?.trim() || ''
          const content = item.querySelector('[data-testid="comment-content"]')?.textContent?.trim() || ''
          const likes = parseInt(item.querySelector('[data-testid="likes-count"]')?.textContent || '0')
          const time = item.querySelector('time')?.textContent?.trim() || ''

          results.push({ author, content, likes, time })
        })

        return results
      })

      logger.info(`Successfully extracted ${comments.length} comments`)
      return comments
    } catch (error) {
      logger.error('Error getting note comments:', error)
      throw error
    } finally {
      await this.cleanup()
    }
  }

  /**
   * Wait for a random duration between min and max seconds
   * @param min Minimum seconds to wait
   * @param max Maximum seconds to wait
   */
  private async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.random() * (max - min) + min
    logger.debug(`Adding random delay of ${delay.toFixed(2)} seconds`)
    await new Promise((resolve) => setTimeout(resolve, delay * 1000))
  }

  private async moveMouseRandomly(page: Page): Promise<void> {
    logger.info(`Moving mouse randomly`)
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const numberOfMoves = Math.random() * (8 - 3) + 3
    for (let i = 0; i < numberOfMoves; i++) {
      // 生成随机 X 坐标 (0 到页面宽度之间)
      const randomX = Math.floor(Math.random() * pageWidth);
      // 生成随机 Y 坐标 (0 到页面高度之间)
      const randomY = Math.floor(Math.random() * pageHeight);

      // 使用 page.mouse.move() 模拟鼠标移动
      // steps 参数可以控制移动的平滑度，增加 steps 会使移动看起来更自然，但会耗费更多时间
      await page.mouse.move(randomX, randomY, { steps: 5 });

      const delayBetweenMoves = Math.random() * (500 - 100) + 100
      // 每次移动后添加一个延迟，模拟更真实的鼠标行为
      await page.waitForTimeout(delayBetweenMoves);
    }
  }
  
  private async addNoteItemToList(
      note_titles: NoteTitle[], 
      noteItem: ElementHandle<Element>): Promise<boolean> {
    // 搜索结果中有时候会插入别的内容
    const maskElement = await noteItem.$('a.cover.mask.ld');
    if (!maskElement) {
      return false;
    }

    const note_url = await noteItem.$eval('a.cover.mask.ld', (el: HTMLElement) => el.getAttribute('href'))
    const note_title = await noteItem.$eval('a.title', (el: HTMLElement) => el.textContent?.trim() || '')

    if (note_url && note_title) {
      for (let i = 0; i < note_titles.length; i++) {
        if (note_titles[i].url == note_url) {
          return false
        }
      }
      note_titles.push({
        title: note_title,
        url: note_url,
      })
      return true
    }
    return false
  }

  private async getNoteContentInNotePage(
      page: Page,
      noteItem: ElementHandle<Element>,
      with_images: boolean = false): Promise<Note> {
    // Click on the note cover to open detail
    await noteItem.$eval('a.cover.mask.ld', (el: HTMLElement) => el.click())

    // Wait for the note page to load
    logger.info('Waiting for note page to load')
    await page.waitForSelector('#noteContainer', {
      timeout: 30000
    })

    const delay = Math.random() * (1.5 - 0.5) + 1.0
    await new Promise((resolve) => setTimeout(resolve, delay * 1000))

    // Extract note content
    const note_details = await getNoteDetail(page)
    if (!note_details) {
      throw new Error('Note detail not found')
    }
    let user_details = await getUserDetailInNotePage(page)

    let note_images: string[] = []
    if (with_images) {
      note_images = await getNoteImages(note_details.imgs_url || [])
    }

    let note = {
      user_details: user_details,
      note_details: note_details,
      note_images: note_images,
    } as Note

    await new Promise((resolve) => setTimeout(resolve, delay * 1000))

    // Close note by clicking the close button
    const closeButton = await page.$('.close-circle')
    if (closeButton) {
      logger.info('Closing note dialog')
      await closeButton.click()

      // Wait for note dialog to disappear
      await page.waitForSelector('#noteContainer', {
        state: 'detached',
        timeout: 30000
      })
    }

    return note
  }
}
