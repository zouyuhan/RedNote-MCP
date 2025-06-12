import logger from '../utils/logger'
import { Page } from 'playwright'

export interface NoteAction {
    url: string
    title: string
    action: 'like' | 'comment'
    comment?: string
}

export async function postNoteAction(page: Page, noteAction: NoteAction): Promise<boolean> {
    logger.info(`Posting note action: ${noteAction.title} ${noteAction.url} ${noteAction.action} ${noteAction.comment}`)

    await page.waitForSelector('.input-box')
    await page.waitForSelector('.input-box .content-input')

    const delay = Math.random() * (6.0 - 1.0) + 1.0
    await new Promise((resolve) => setTimeout(resolve, delay * 1000)) 

    if (noteAction.action === 'like') {
        const likeWrapper = page.locator('.input-box .like-wrapper.like-active');
        const useElement = likeWrapper.locator('use');
        const xlinkHrefValue = await useElement.getAttribute('xlink:href');

        // 如果已经点赞，则不重复点赞
        if (xlinkHrefValue === '#liked') {
            logger.info(`Already liked: ${noteAction.title} ${noteAction.url}`)
            return true
        }

        const btn_selector = '.input-box .like-wrapper.like-active .like-lottie'
        await page.waitForSelector(btn_selector)
        await page.click(btn_selector)

        await new Promise((resolve) => setTimeout(resolve, 2.0 * 1000))
    } else if (noteAction.action === 'comment') {
        // 焦点到文本框
        await page.click('.input-box .content-edit .inner span')
        await page.waitForTimeout(500) // 等待一下確保焦點已經設置

        await page.waitForSelector('.input-box .content-edit .content-input')
        
        // 控制打字时间，模拟打字效果，每秒2-3个字符
        const comment = noteAction.comment || ''
        for (let i = 0; i < comment.length; i++) {
            await new Promise((resolve) => setTimeout(resolve, 1000 / (Math.random() * (3 - 2) + 2)))
            await page.fill('.input-box .content-input', comment.substring(0, i + 1))
        }
        
        // 等待几秒再发送
        const delay = Math.random() * (1.5 - 0.5) + 0.5
        await page.waitForSelector('.bottom .btn.submit')

        await new Promise((resolve) => setTimeout(resolve, delay * 1000)) 
        await page.click('.bottom .btn.submit')

        await new Promise((resolve) => setTimeout(resolve, 2.0 * 1000)) 
    } else {
        throw new Error(`Invalid action: ${noteAction.action}`)
    }

    return true
}