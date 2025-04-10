# RedNote MCP

[English](./docs/README.en.md) | 简体中文

小红书内容访问的 Model Context Protocol 实现。

## 功能特性

- 认证管理（支持 Cookie 持久化）
- 关键词搜索笔记
- 通过 URL 访问笔记内容
- 通过 URL 访问评论内容
- 命令行初始化工具

## 安装

```bash
# 克隆项目
git clone https://github.com/yourusername/rednote-mcp.git
cd rednote-mcp

# 安装依赖
npm install

# 全局安装（可选，方便命令行调用）
npm install -g .
```

## 使用说明

### 1. 初始化登录

首次使用需要先进行登录初始化：

```bash
npm run dev -- init
```

执行此命令后：
1. 会自动打开浏览器窗口
2. 跳转到小红书登录页面
3. 请手动完成登录操作
4. 登录成功后会自动保存 Cookie 到 `cookies.json` 文件

### 2. 在 Cursor 中配置 MCP Server

在 Cursor 的 settings.json 中添加以下配置：

```json
{
  "mcpServers": {
    "RedNote MCP": {
      "command": "rednote-mcp",
      "args": ["--stdio"]
    }
  }
}
```

或者使用 npx 方式：

```json
{
  "mcpServers": {
    "RedNote MCP": {
      "command": "npx",
      "args": ["rednote-mcp", "--stdio"]
    }
  }
}
```

配置说明：
- `command`: 可以是全局安装后的 `rednote-mcp` 命令，或使用 `npx` 直接运行
- `args`: 必须包含 `--stdio` 参数以支持 Cursor 的通信方式

## 开发调试

### 使用 MCP Inspector 进行调试

MCP Inspector 是一个用于调试 MCP 服务器的工具，可以帮助开发者检查和验证 MCP 服务器的行为。使用以下命令启动：

```bash
npx @modelcontextprotocol/inspector npx rednote-mcp --stdio
```

这个命令会：
1. 启动 MCP Inspector 工具
2. 通过 Inspector 运行 rednote-mcp 服务
3. 提供一个交互式界面来检查请求和响应
4. 帮助调试和验证 MCP 协议的实现

### 开发流程

```bash
# 构建项目
npm run build

# 开发模式运行
npm run dev

# 运行测试
npm test
```

## 配置

在项目根目录创建 `.env` 文件，配置以下变量：

```
# Cookie 存储路径
COOKIE_STORAGE_PATH=./cookies.json

# MCP 服务器配置
PORT=3000
HOST=localhost
```

## 注意事项

1. 首次使用必须执行 `init` 命令进行登录
2. Cookie 文件包含敏感信息，请勿泄露
3. 建议定期更新 Cookie，避免失效
4. 确保已正确安装 Node.js 环境

## 项目结构

```
rednote-mcp/
├── src/
│   ├── auth/           # 认证相关
│   │   ├── authManager.ts
│   │   └── cookieManager.ts
│   ├── cli.ts          # 命令行接口
│   └── index.ts        # 主入口
├── .env                # 环境配置
├── package.json        # 项目配置
└── tsconfig.json       # TypeScript 配置
``` 
