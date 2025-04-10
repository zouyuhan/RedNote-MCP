# RedNote MCP

[简体中文](../README.md) | English

A Model Context Protocol implementation for accessing Xiaohongshu (RED) content.

## Features

- Authentication management (with Cookie persistence)
- Note search by keywords
- Access note content via URL
- Access comments via URL
- Command-line initialization tool

## Installation

```bash
# Clone the project
git clone https://github.com/yourusername/rednote-mcp.git
cd rednote-mcp

# Install dependencies
npm install

# Global installation (optional, for convenient CLI usage)
npm install -g .
```

## Usage

### 1. Initialize Login

First-time users need to initialize login:

```bash
npm run dev -- init
```

After executing this command:
1. A browser window will open automatically
2. You'll be redirected to the Xiaohongshu login page
3. Complete the login process manually
4. After successful login, cookies will be automatically saved to `cookies.json`

### 2. Configure MCP Server in Cursor

Add the following configuration to Cursor's settings.json:

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

Or use npx method:

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

Configuration notes:
- `command`: Can be either the globally installed `rednote-mcp` command or use `npx` directly
- `args`: Must include `--stdio` parameter to support Cursor's communication method

## Development and Debugging

### Using MCP Inspector for Debugging

MCP Inspector is a tool for debugging MCP servers that helps developers inspect and verify MCP server behavior. Start it with:

```bash
npx @modelcontextprotocol/inspector npx rednote-mcp --stdio
```

This command will:
1. Launch the MCP Inspector tool
2. Run the rednote-mcp service through Inspector
3. Provide an interactive interface for inspecting requests and responses
4. Help debug and verify MCP protocol implementation

### Development Workflow

```bash
# Build the project
npm run build

# Run in development mode
npm run dev

# Run tests
npm test
```

## Configuration

Create a `.env` file in the project root directory with the following variables:

```
# Cookie storage path
COOKIE_STORAGE_PATH=./cookies.json

# MCP server configuration
PORT=3000
HOST=localhost
```

## Important Notes

1. Must execute `init` command for first-time login
2. Cookie file contains sensitive information, keep it secure
3. Recommended to update cookies periodically to avoid expiration
4. Ensure Node.js environment is properly installed

## Project Structure

```
rednote-mcp/
├── src/
│   ├── auth/           # Authentication related
│   │   ├── authManager.ts
│   │   └── cookieManager.ts
│   ├── cli.ts          # CLI interface
│   └── index.ts        # Main entry
├── .env                # Environment configuration
├── package.json        # Project configuration
└── tsconfig.json       # TypeScript configuration
``` 
