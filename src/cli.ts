#!/usr/bin/env node

import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {z} from "zod";
import {AuthManager} from './auth/authManager';
import {RedNoteTools} from './tools/rednoteTools';

const tools = new RedNoteTools();

const name = "rednote";
const description = "A friendly tool to help you access and interact with Xiaohongshu (RedNote) content through Model Context Protocol.";
const version = "0.1.6";

// Create server instance
const server = new McpServer({
  name,
  version,
  protocolVersion: "2024-11-05",
  capabilities: {
    tools: true,
    sampling: {},
    roots: {
      listChanged: true
    }
  }
});

// Register tools
server.tool("search_notes", "根据关键词搜索笔记", {
  keywords: z.string().describe("搜索关键词"),
  limit: z.number().optional().describe("返回结果数量限制"),
}, async ({keywords, limit = 10}: { keywords: string; limit?: number }) => {
  const notes = await tools.searchNotes(keywords, limit);
  return {
    content: notes.map(note => ({
      type: "text",
      text: `标题: ${note.title}\n作者: ${note.author}\n内容: ${note.content}\n点赞: ${note.likes}\n评论: ${note.comments}\n链接: ${note.url}\n---`
    }))
  };
});

server.tool("get_note_content", "获取笔记内容", {
  url: z.string().describe("笔记 URL"),
}, async ({url}: { url: string }) => {
  const note = await tools.getNoteContent(url);
  return {
    content: [{
      type: "text",
      text: `标题: ${note.title}\n作者: ${note.author}\n内容: ${note.content}\n点赞: ${note.likes}\n评论: ${note.comments}\n链接: ${note.url}`
    }]
  };
});

server.tool("get_note_comments", "获取笔记评论", {
  url: z.string().describe("笔记 URL"),
}, async ({url}: { url: string }) => {
  const comments = await tools.getNoteComments(url);
  return {
    content: comments.map(comment => ({
      type: "text",
      text: `作者: ${comment.author}\n内容: ${comment.content}\n点赞: ${comment.likes}\n时间: ${comment.time}\n---`
    }))
  };
});

// Add login tool
server.tool("login", "登录小红书账号", {}, async () => {
  const authManager = new AuthManager();
  try {
    await authManager.login();
    return {
      content: [{
        type: "text",
        text: "登录成功！Cookie 已保存。"
      }]
    };
  } catch (error: any) {
    return {
      content: [{
        type: "text",
        text: `登录失败：${error?.message || '未知错误'}`
      }]
    };
  } finally {
    await authManager.cleanup();
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("RedNote MCP Server running on stdio");
}

// 检查是否在 stdio 模式下运行
if (process.argv.includes('--stdio')) {
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });
} else {
  const {Command} = require('commander');
  const program = new Command();

  program
    .name(name)
    .description(description)
    .version(version);

  program
    .command('init')
    .description('Initialize and login to RedNote')
    .action(async () => {
      try {
        const authManager = new AuthManager();
        await authManager.login();
        await authManager.cleanup();
        console.log('Login successful! Cookie has been saved.');
        process.exit(0);
      } catch (error) {
        console.error('Error during initialization:', error);
        process.exit(1);
      }
    });

  program.parse(process.argv);
}
