# memdata-mcp

MCP server for [MemData](https://memdata.ai) - persistent memory for AI agents.

Give Claude, Cursor, or any MCP-compatible AI long-term memory across conversations.

## Quick Start

### 1. Get your API key

Create an API key at [memdata.ai/dashboard/api-keys](https://memdata.ai/dashboard/api-keys)

### 2. Add to your MCP config

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "memdata": {
      "command": "npx",
      "args": ["memdata-mcp"],
      "env": {
        "MEMDATA_API_KEY": "md_your_key"
      }
    }
  }
}
```

**Claude Code** (`~/.claude.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "memdata": {
      "command": "npx",
      "args": ["memdata-mcp"],
      "env": {
        "MEMDATA_API_KEY": "md_your_key"
      }
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "memdata": {
      "command": "npx",
      "args": ["memdata-mcp"],
      "env": {
        "MEMDATA_API_KEY": "md_your_key"
      }
    }
  }
}
```

### 3. Restart your client

You should now see MemData tools available.

## Tools

| Tool | Description |
|------|-------------|
| `memdata_ingest` | Store text in long-term memory |
| `memdata_query` | Search memory with natural language |
| `memdata_list` | List all stored memories |
| `memdata_delete` | Delete a memory by ID |
| `memdata_status` | Check API health and storage usage |

### `memdata_ingest`

Store text in long-term memory.

```
"Remember that we decided to use PostgreSQL for the new project."
```

**Parameters:**
- `content` (string) - Text to store
- `name` (string) - Source identifier (e.g., "meeting-notes-jan-29")

### `memdata_query`

Search memory with natural language.

```
"What database did we choose?"
```

**Parameters:**
- `query` (string) - Natural language search
- `limit` (number, optional) - Max results (default: 5)

### `memdata_list`

List all stored memories with chunk counts.

### `memdata_delete`

Delete a memory by artifact ID (get IDs from `memdata_list`).

### `memdata_status`

Check API connectivity and storage usage.

## How it works

1. **Ingest**: Text is chunked, embedded, and stored
2. **Query**: Your question is matched against stored memories using semantic similarity
3. **Results**: Returns relevant content with similarity scores

Scores of 30-50% are typical for good matches. Semantic search finds meaning, not keywords.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MEMDATA_API_KEY` | Yes | Your API key from memdata.ai |
| `MEMDATA_API_URL` | No | API URL (default: https://memdata.ai) |

## What this package does

This is a thin MCP client that calls the MemData API. It does not:
- Store any data locally
- Send data anywhere except memdata.ai
- Collect analytics or telemetry

You can inspect the source code in `src/index.ts`.

## Links

- [MemData](https://memdata.ai) - Main site
- [Dashboard](https://memdata.ai/dashboard) - Manage your memory
- [Docs](https://memdata.ai/docs) - Full documentation

## License

MIT
