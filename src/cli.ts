#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { AuthManager } from './auth/authManager'
import { RedNoteTools } from './tools/rednoteTools'
import { Note } from './tools/noteDetail'
import { NoteAction } from './tools/noteAction'
import logger, { LOGS_DIR, packLogs } from './utils/logger'
import { exec } from 'child_process'
import { promisify } from 'util'
import { createStdioLogger } from './utils/stdioLogger'
const execAsync = promisify(exec)

const name = 'rednote'
const description = '抓取小红书的内容的 MCP 服务'
const version = '0.3.1'

// Create server instance
const server = new McpServer({
  name,
  version,
  protocolVersion: '2024-11-05',
  capabilities: {
    tools: true,
    sampling: {},
    roots: {
      listChanged: true
    }
  }
})

function format_note(note: Note[]) {
  type TextContent = { type: 'text'; text: string; [x:string]: unknown };
  type ImageContent = { type: 'image'; data: string; mimeType: string; [x: string]: unknown };
  type Content = TextContent | ImageContent;

  let result: Content[] = [];

  note.forEach((note, i) => {
    const note_head: TextContent = {
      type: 'text',
      text: `以下是第 ${i + 1} 个笔记内容(JSON格式)和用户信息(JSON格式)`
    }
    const note_content: TextContent = {
      type: 'text',
      text: JSON.stringify(note.note_details)
    }
    const user_content: TextContent = {
      type: 'text',
      text: JSON.stringify(note.user_details)
    }

    result.push(note_head, note_content, user_content)

    if (note.note_images) {
      note.note_images.forEach((image, j) => {
        const result_head: TextContent = { // Explicitly type as TextContent
          type: 'text',
          text: `以下是第 ${i+1} 个笔记第 ${j+1}/${note.note_images?.length || 0} 张图片，内容(base64)如下:`
        }
        const result_img: ImageContent = { // Explicitly type as ImageContent
          type: 'image',
          data: image,
          mimeType: 'image/jpeg',
        }
        result.push(result_head, result_img) // Push individual elements
      })
    }
  })

  return result
}

// Register tools
server.tool(
  'search_notes_and_get_contents',
  '根据关键词搜索最相关的笔记，返回笔记的文字内容、图片链接、视频链接、点赞人数、收藏人数、评论人数、笔记链接、博主关注的人数、博主被多少人关注、博主的笔记被点赞和收藏次数',
  {
    keywords: z.string().describe('搜索关键词'),
    sort_type: z.string().optional().describe('搜索结果排序方式（默认default，可选值为default、most_liked、latest）'),
    period: z.string().optional().describe('搜索时间范围（默认all，可选值为all、day、week、half_year）'),
    limit: z.number().optional().describe('返回结果数量限制(默认10条）'),
    with_images: z.boolean().optional().describe('是否返回图片内容(Base64)'),
  },
  async ({ keywords, sort_type = 'default', period = 'all', limit = 10, with_images = false }: { 
    keywords: string; 
    sort_type?: string; 
    period?: string; 
    limit?: number; 
    with_images?: boolean }) => {
    logger.info(`Searching notes with keywords: ${keywords}, limit: ${limit}`)
    try {
      const tools = new RedNoteTools()
      const notes = await tools.searchNotesAndGetContents(keywords, sort_type, period, limit, with_images)
      logger.info(`Found ${notes.length} notes`)
      const result = format_note(notes)
      return {
        content: result 
      }
    } catch (error) {
      logger.error('Error searching notes:', error)
      throw error
    }
  }
)

server.tool(
  'get_user_notes_and_get_contents',
  '获取用戶的所有笔记, 返回笔记的文字内容、图片链接、视频链接、点赞人数、收藏人数、评论人数、笔记链接、博主关注的人数、博主被多少人关注、博主的笔记被点赞和收藏次数',
  {
    url: z.string().describe('用戶主頁 URL'),
    limit: z.number().optional().describe('返回結果数量限制（默认10条）'),
    with_images: z.boolean().optional().describe('是否返回图片内容(Base64)'),
  },
  async ({ url, limit = 10, with_images = false }: { url: string; limit?: number; with_images?: boolean }) => {
    logger.info(`Getting user notes for URL: ${url}, limit: ${limit}`)
    try {
      const tools = new RedNoteTools()
      const notes = await tools.getUserNotesAndGetContents(url, limit, with_images)
      logger.info(`Found ${notes.length} notes`)
      const result = format_note(notes)
      return {
        content: result 
      }
    } catch (error) {
      logger.error('Error getting user notes:', error)
      throw error
    }
  }
)

server.tool(
  'get_note_content',
  '获取具体某个笔记的文字内容、图片链接、图片详情(base64)、视频链接、点赞人数、收藏人数、评论人数、笔记链接',
  {
    url: z.string().describe('笔记 URL')
  },
  async ({ url }: { url: string }) => {
    logger.info(`Getting note images for URL: ${url}`)
    try {
      const tools = new RedNoteTools()
      const note = await tools.getNoteContent(url)
      const result = format_note([note])
      return {content: result}
    } catch (error) {
      logger.error('Error getting note content:', error)
      throw error
    }
  }
)


server.tool(
  'get_note_comments',
  '获取笔记评论',
  {
    url: z.string().describe('笔记 URL')
  },
  async ({ url }: { url: string }) => {
    logger.info(`Getting comments for URL: ${url}`)
    try {
      const tools = new RedNoteTools()
      const comments = await tools.getNoteComments(url)
      logger.info(`Found ${comments.length} comments`)
      return {
        content: comments.map((comment) => ({
          type: 'text',
          text: `作者: ${comment.author}\n内容: ${comment.content}\n点赞: ${comment.likes}\n时间: ${comment.time}\n---`
        }))
      }
    } catch (error) {
      logger.error('Error getting note comments:', error)
      throw error
    }
  }
)

server.tool(
  'post_note_action_list',
  '点赞或评论笔记',
  {
    note_action_list: z.array(z.object({
      title: z.string().describe('笔记标题'),
      url: z.string().describe('笔记 URL'),
      action: z.enum(['like', 'comment']).describe('操作类型：like(点赞) 或 comment(评论)'),
      comment: z.string().optional().describe('评论内容，当 action 为 comment 时必填')
    })).describe('笔记操作列表')
  },
  async ({ note_action_list }: { note_action_list: NoteAction[] }) => {
    logger.info(`Posting note action list: ${note_action_list.length}`)
    try {
      const tools = new RedNoteTools()
      const result = await tools.postNoteActionList(note_action_list)

      const failedCount = result.filter(r => !r).length
      if (failedCount === 0) {
        return {
          content: [{
            type: 'text',
            text: '全部笔记操作成功'
          }]
        }
      } else {
        const failedActions = note_action_list.filter((_, index) => !result[index])
        return {
          content: [
            {
              type: 'text',
              text: `部分笔记操作成功，${failedCount} 個笔记操作失敗`
            },
            {
              type: 'text',
              text: JSON.stringify(failedActions, null, 2)
            }
          ]
        }
      }      
    } catch (error) {
      logger.error('Error posting note action list:', error)
      throw error
    }
  }
)

// Add login tool
server.tool(
  'login', 
  '登录小红书账号', 
  {}, 
  async () => {
    logger.info('Starting login process')
    const authManager = new AuthManager()
    try {
      await authManager.login()
      logger.info('Login successful')
      return {
        content: [
          {
            type: 'text',
            text: '登录成功！Cookie 已保存。'
          }
        ]
      }
    } catch (error) {
      logger.error('Login failed:', error)
      throw error
    } finally {
      await authManager.cleanup()
    }
  })

// Start the server
async function main() {
  logger.info('Starting RedNote MCP Server')

  // Start stdio logging
  const stopLogging = createStdioLogger(`${LOGS_DIR}/stdio.log`)

  const transport = new StdioServerTransport()
  await server.connect(transport)
  logger.info('RedNote MCP Server running on stdio')

  // Cleanup on process exit
  process.on('exit', () => {
    stopLogging()
  })
}

// 检查是否在 stdio 模式下运行
if (process.argv.includes('--stdio')) {
  main().catch((error) => {
    logger.error('Fatal error in main():', error)
    process.exit(1)
  })
} else {
  const { Command } = require('commander')
  const program = new Command()

  program.name(name).description(description).version(version)

  program
    .command('init [timeout]')
    .description('Initialize and login to RedNote')
    .argument('[timeout]', 'Login timeout in seconds', (value: string) => parseInt(value, 10), 10)
    .usage('[options] [timeout]')
    .addHelpText('after', `
Examples:
  $ rednote-mcp init           # Login with default 10 seconds timeout
  $ rednote-mcp init 30        # Login with 30 seconds timeout
  $ rednote-mcp init --help    # Display help information

Notes:
  This command will launch a browser and open the RedNote login page.
  Please complete the login in the opened browser window.
  After successful login, the cookies will be automatically saved for future operations.
  The [timeout] parameter specifies the maximum waiting time (in seconds) for login, default is 10 seconds.
  The command will fail if the login is not completed within the specified timeout period.`)
    .action(async (timeout: number) => {
      logger.info(`Starting initialization process with timeout: ${timeout}s`)

      try {
        const authManager = new AuthManager()
        await authManager.login({ timeout })
        await authManager.cleanup()
        logger.info('Initialization successful')
        console.log('Login successful! Cookie has been saved.')
        process.exit(0)
      } catch (error) {
        logger.error('Error during initialization:', error)
        console.error('Error during initialization:', error)
        process.exit(1)
      }
    })

  program
    .command('pack-logs')
    .description('Pack all log files into a zip file')
    .action(async () => {
      try {
        const zipPath = await packLogs()
        console.log(`日志已打包到: ${zipPath}`)
        process.exit(0)
      } catch (error) {
        console.error('打包日志失败:', error)
        process.exit(1)
      }
    })

  program
    .command('open-logs')
    .description('Open the logs directory in file explorer')
    .action(async () => {
      try {
        let command
        switch (process.platform) {
          case 'darwin': // macOS
            command = `open "${LOGS_DIR}"`
            break
          case 'win32': // Windows
            command = `explorer "${LOGS_DIR}"`
            break
          case 'linux': // Linux
            command = `xdg-open "${LOGS_DIR}"`
            break
          default:
            throw new Error(`Unsupported platform: ${process.platform}`)
        }

        await execAsync(command)
        console.log(`日志目录已打开: ${LOGS_DIR}`)
        process.exit(0)
      } catch (error) {
        console.error('打开日志目录失败:', error)
        process.exit(1)
      }
    })

  program.parse(process.argv)
}
