import logger from '../utils/logger'
import { Page } from 'playwright'

export interface UserDetail {
  follows_count: number
  fans_count: number
  be_liked_count: number
}

export interface NoteDetail {
  title: string
  content: string
  tags: string[]
  imgs_url?: string[]
  videos_url?: string[]
  url: string
  author: string
  likes?: number
  collects?: number
  comments?: number
  user_follows_count?: number
  user_fans_count?: number
  user_be_liked_count?: number
}

export interface Note {
  user_details: UserDetail
  note_details: NoteDetail
  note_images?: string[],
}

export interface NoteTitle {
  title: string
  url: string
}

export interface Comment {
  author: string
  content: string
  likes: number
  time: string
}

export function removeDuplicateStrings(arr: string[]): string[] {
  return [...new Set(arr)]
}

export async function getNoteDetail(page: Page): Promise<NoteDetail> {
  // Wait for content to load
  logger.info('Waiting for content to load')
  await page.waitForSelector('.note-container')
  await page.waitForSelector('.media-container')

  async function getContent() {
    function ChineseUnitStrToNumber(str: string) {
      if (str.includes('万')) {
        return Number(str.replace('万', '').trim()) * 10000
      } else {
        return Number(str)
      }
    }
    // Get main article content
    const article = document.querySelector('.note-container')
    if (!article) throw new Error('Article not found')

    // Get title from h1 or first text block
    const title =
      article.querySelector('#detail-title')?.textContent?.trim() ||
      article.querySelector('.title')?.textContent?.trim() ||
      ''

    // Get content from article text
    const contentBlock = article.querySelector('.note-scroller')
    if (!contentBlock) throw new Error('Content block not found')
    const content = contentBlock.querySelector('.note-content .note-text span')?.textContent?.trim() || ''
    // Get tags from article text
    const tags = Array.from(contentBlock?.querySelectorAll('.note-content .note-text a')).map((tag) => {
      return tag.textContent?.trim().replace('#', '') || ''
    })

    // Get author info
    const authorElement = article.querySelector('.author-container .info')
    const author = authorElement?.querySelector('.username')?.textContent?.trim() || ''

    const engageBar = document.querySelector('.engage-bar-style')
    const likesElement = engageBar?.querySelector('.like-wrapper .count')
    const likesNumber = likesElement?.textContent?.replace(/[^\d]/g, '') || '0'

    const collectElement = engageBar?.querySelector('.collect-wrapper .count')
    const collectsNumber = collectElement?.textContent?.replace(/[^\d]/g, '') || '0'

    const commentsElement = engageBar?.querySelector('.chat-wrapper .count')
    const commentsNumber = commentsElement?.textContent?.replace(/[^\d]/g, '') || '0'

    const imgs_url = Array.from(document.querySelectorAll('.media-container img')).map((img) => {
      return img.getAttribute('src') || ''
    })

    const videos_url = Array.from(document.querySelectorAll('.media-container video')).map((video) => {
      return video.getAttribute('src') || ''
    })

    return {
      title,
      content,
      tags,
      author,
      imgs_url,
      videos_url,
      url: '',
      likes: ChineseUnitStrToNumber(likesNumber),
      collects: ChineseUnitStrToNumber(collectsNumber),
      comments: ChineseUnitStrToNumber(commentsNumber),
    } as NoteDetail
  }

  let note = await page.evaluate(getContent)

  if (note) {
    note.url = page.url()
    if (note.imgs_url) note.imgs_url = removeDuplicateStrings(note.imgs_url)
    if (note.videos_url) note.videos_url = removeDuplicateStrings(note.videos_url)
  }
  return note
}

export async function getUserDetailInNotePage(page: Page): Promise<UserDetail> {
  // 悬停在用户名称上，获取用户数据
  const authorNameSelector = '.author-container .username'
  await page.waitForSelector(authorNameSelector, {
    timeout: 30000
  })
  await page.hover(authorNameSelector)

  // 假設懸停後會出現一個用戶卡片，選擇器如 .user-card
  const userCardSelector = '.user-content .interaction-info' // 根據實際彈窗 class 調整
  await page.waitForSelector(userCardSelector, {
    timeout: 30000
  })

  const delay = Math.random() * (1.5 - 0.5) + 0.5
  await new Promise((resolve) => setTimeout(resolve, delay * 1000))

  // 從用戶卡片中提取數據
  const userData = await page.evaluate(() => {
    const card = document.querySelector('.user-content .interaction-info')
    if (!card) throw new Error('User card not found')

    const interaction_items = card.querySelectorAll('a.interaction')
    if (!interaction_items) throw new Error('User card is invalid')
    if (interaction_items.length < 3) throw new Error('User card is invalid')

    function extractNumber(str: string) {
      const match = str.match(/\d+/); // 匹配一个或多个数字
      if (!match) return null
      let result = parseInt(match[0], 10);
      if (str.includes('万')) result = result * 10000
      return Number(result)
    }

    // 這裡根據實際 DOM 結構提取需要的資料
    const follows_count = extractNumber(interaction_items[0].textContent || '') || 0
    const fans_count = extractNumber(interaction_items[1].textContent || '') || 0
    const be_liked_count = extractNumber(interaction_items[2].textContent || '') || 0

    return {
      follows_count,
      fans_count,
      be_liked_count,
    }
  }, userCardSelector)

  return userData as UserDetail
}

export async function getNoteImages(imgs_url: string[]): Promise<string[]> {
  const images: string[] = []
  for (const img_url of imgs_url) {
    const response = await fetch(img_url)
    const buffer = await response.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    images.push(base64)
  }
  return images
}