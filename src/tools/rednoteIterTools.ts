import { Browser, ElementHandle, Page } from 'playwright'
import logger from '../utils/logger'
import { getNoteDetail, getUserDetailInNotePage, getNoteImages, removeDuplicateStrings, NoteTitle} from './noteDetail'
import { NoteDetail, UserDetail, Note, Comment } from './noteDetail'
import { NoteAction, NoteActionIterative, postNoteAction } from './noteAction'
import { RedNoteTools, RedNoteUtils } from './rednoteTools'

// 迭代狀態管理
export interface IterationState {
  noteItems: ElementHandle<Element>[] | null,
  currentNoteIndex: number,
  totalNoteCount: number,
  note_titles: NoteTitle[]
  rednoteTool: RedNoteTools | null
}

export const defaultIterationState: IterationState = {
  noteItems: null,
  currentNoteIndex: 0,
  totalNoteCount: 0,
  note_titles: [],
  rednoteTool: null
};

export class RedNoteIterTools {
    private iterationState: IterationState = defaultIterationState
    private rednoteTool: RedNoteTools | null = null

    private static instance: RedNoteIterTools = new RedNoteIterTools()

    private constructor() {
    }

    public static getInstance(): RedNoteIterTools {
        return RedNoteIterTools.instance
    }

    // 初始化迭代器
    async initUserNotesIteration(userUrl: string): Promise<boolean> {
        logger.info(`Initializing iteration for user notes: ${userUrl}`);

        try {
            // 重置狀態
            this.iterationState = {
                noteItems: null,
                currentNoteIndex: 0,
                totalNoteCount: 0,
                rednoteTool: null, 
                note_titles: []
            };

            // 初始化瀏覽器和頁面
            this.iterationState.rednoteTool = new RedNoteTools();
            await this.iterationState.rednoteTool.initialize();
            if (!this.iterationState.rednoteTool.getPage()) throw new Error('Page not initialized');

            const page = await this.iterationState.rednoteTool.getPage()
            // 訪問用戶主頁
            await page.goto(userUrl);

            // 等待文章列表加載
            logger.info('Waiting for user notes to load');
            await page.waitForSelector('.feeds-container');

            // 獲取筆記列表
            this.iterationState.noteItems = await page.$$('.feeds-container .note-item');
            if (!this.iterationState.noteItems) throw new Error('Note items not found');
            logger.info(`Found ${this.iterationState.noteItems.length} note items for iteration`);

            return true;
        } catch (error) {
            logger.error('Error initializing user notes iteration:', error);
            await this.cleanupIteration();
            throw error;
        }
    }

    // 初始化迭代器
    async initSearchNotesIteration(
            keywords: string,
            sort_type: string = 'default',
            period: string = 'all',
            ): Promise<boolean> {
        logger.info(`Initializing iteration for search notes: keywords: ${keywords}, sort_type: ${sort_type}, period: ${period}`);

        try {
            // 重置狀態
            this.iterationState = {
                noteItems: null,
                currentNoteIndex: 0,
                totalNoteCount: 0,
                rednoteTool: null, 
                note_titles: []
            };

            // 初始化瀏覽器和頁面
            this.iterationState.rednoteTool = new RedNoteTools();
            await this.iterationState.rednoteTool.initialize();
            if (!this.iterationState.rednoteTool.getPage()) throw new Error('Page not initialized');

            const page = await this.iterationState.rednoteTool.getPage()
            await RedNoteUtils.navigateToSearchPage(page, keywords, sort_type, period)

            this.iterationState.noteItems = await page.$$('.feeds-container .note-item');
            if (!this.iterationState.noteItems) throw new Error('Note items not found');
            logger.info(`Found ${this.iterationState.noteItems.length} note items for iteration`);

            return true;
        } catch (error) {
            logger.error('Error initializing search notes iteration:', error);
            await this.cleanupIteration();
            throw error;
        }
    }

    getNoteCount(): number {
        return this.iterationState.totalNoteCount
    }

    // 獲取下一個筆記
    async getNextNoteIteratively(with_images: boolean = false): Promise<Note | null> {
        logger.info(`Getting next user note, current index: ${this.iterationState.currentNoteIndex}, total count: ${this.iterationState.totalNoteCount}`);

        const page = await this.iterationState.rednoteTool?.getPage()
        if (!page) throw new Error('Page not initialized')

        if (!this.iterationState.noteItems) throw new Error('Note items not found')

        // 尝试关闭上一轮打开的笔记页面
        RedNoteUtils.closeNoteDialog(page)

        while (true) {
            if (this.iterationState.currentNoteIndex >= this.iterationState.noteItems.length
                    || this.iterationState.currentNoteIndex >= this.iterationState.noteItems.length / 2) {
                try {
                    await RedNoteUtils.moveMouseRandomly(page)

                    let scrollHeight = await page.evaluate(() => document.body.scrollHeight);
                    let lastScrollHeight = scrollHeight 

                    logger.info(`Starts to scrolling page down scrollHeight: ${scrollHeight}`)

                    for (let scroll_i = 0; scroll_i < 10; scroll_i++) {
                        await page.mouse.wheel(0, 120);
                        await page.waitForTimeout(1000);

                        await page.waitForSelector('.feeds-container .note-item')

                        scrollHeight = await page.evaluate(() => document.body.scrollHeight);

                        logger.info(`Scrolling page down for a small step, scrollHeight: ${scrollHeight} lastScrollHeight: ${lastScrollHeight}`)

                        if (scrollHeight > lastScrollHeight) {
                            break;
                        }
                    }

                    if (scrollHeight == lastScrollHeight) {
                        logger.info(`No more notes to load, ending iteration. scrollY: ${scrollY}, scrollHeight: ${scrollHeight} lastScrollHeight: ${lastScrollHeight}`)
                        await this.cleanupIteration();
                        return null;
                    }

                    this.iterationState.noteItems = await page.$$('.feeds-container .note-item');
                    if (!this.iterationState.noteItems) throw new Error('Note items not found')
                    logger.info(`Loaded more notes, now have ${this.iterationState.noteItems.length} notes`)

                    this.iterationState.currentNoteIndex = 0
                } catch (error) {
                    logger.error('Error loading more notes:', error);
                    await this.cleanupIteration();
                    return null;
                }

                continue
            }

            let note = null
            let is_added = false

            while (!is_added && this.iterationState.currentNoteIndex < this.iterationState.noteItems.length) {
                try {
                    is_added = await RedNoteUtils.addNoteItemToList(
                        this.iterationState.note_titles, 
                        this.iterationState.noteItems[this.iterationState.currentNoteIndex])

                    if (is_added) {
                        await RedNoteUtils.moveMouseRandomly(page)
                        note = await RedNoteUtils.getNoteContentInNotePage(
                            page, 
                            this.iterationState.noteItems[this.iterationState.currentNoteIndex], 
                            with_images=false)
                        await RedNoteUtils.moveMouseRandomly(page)
                        this.iterationState.currentNoteIndex++
                        break
                    } else {
                        this.iterationState.currentNoteIndex++
                    }
                } catch (error) {
                    logger.error('Error reading note item:', error);
                    this.iterationState.currentNoteIndex++
                    continue
                }  
            }

            if (note) {
                this.iterationState.totalNoteCount++
                return note
            }
        }
        return null
    }

    async postNoteAction(noteAction: NoteActionIterative): Promise<boolean> {
        const page = await this.iterationState.rednoteTool?.getPage()
        if (!page) throw new Error('Page not initialized')

        return await postNoteAction(page, noteAction.action, noteAction.comment)
    }

    async cleanupIteration(): Promise<void> {
        logger.info('Cleaning up browser and page')
        if (this.iterationState.rednoteTool) {
            await this.iterationState.rednoteTool.cleanup()
        }
        this.iterationState = defaultIterationState
    }
}