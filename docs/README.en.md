# RedNote MCP

[简体中文](https://github.com/iFurySt/RedNote-MCP) | English

A Model Context Protocol implementation for accessing Xiaohongshu (RedNote) content.

https://github.com/user-attachments/assets/06b2c67f-d9ed-4a30-8f1d-9743f3edaa3a

## Quick Start

### NPM Global Installation

```bash
# Install globally
npm install -g rednote-mcp

# Initialize login
rednote-mcp init
```

### Install from Source

```bash
# Clone the project
git clone https://github.com/ifuryst/rednote-mcp.git
cd rednote-mcp

# Install dependencies
npm install

# Global installation (optional, for convenient CLI usage)
npm install -g .

# Initialize login
npm run dev -- init
```

## Features

- Authentication management (with Cookie persistence)
- Note search by keywords
- Access note content via URL
- Access comments via URL
- Command-line initialization tool

## Usage

### 1. Initialize Login

First-time users need to initialize login:

```bash
rednote-mcp init
# Or if installed from source:
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

## Development Guide

### Requirements

- Node.js >= 16
- npm >= 7

### Development Workflow

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev

# Run tests
npm test
```

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

## Configuration

Create a `.env` file in the project root directory with the following variables:

```
# Cookie storage path
COOKIE_STORAGE_PATH=./cookies.json

# MCP server configuration
PORT=3000
HOST=localhost
```

## Project Structure

```
rednote-mcp/
├── src/              # Source code directory
│   ├── auth/         # Authentication related
│   │   ├── authManager.ts
│   │   └── cookieManager.ts
│   ├── cli.ts        # CLI interface
│   └── index.ts      # Main entry
├── docs/             # Documentation directory
│   └── README.en.md  # English documentation
├── tests/            # Test directory
├── .env              # Environment configuration
├── package.json      # Project configuration
└── tsconfig.json     # TypeScript configuration
```

## Important Notes

1. Must execute `init` command for first-time login
2. Cookie file contains sensitive information, keep it secure
3. Recommended to update cookies periodically to avoid expiration
4. Ensure Node.js environment is properly installed

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

MIT License - see the [LICENSE](LICENSE) file for details 
