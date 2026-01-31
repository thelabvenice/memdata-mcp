# memdata-mcp

[![npm version](https://img.shields.io/npm/v/memdata-mcp.svg)](https://www.npmjs.com/package/memdata-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MCP server for [MemData](https://memdata.ai) - persistent memory for AI agents.

Give Claude, Cursor, or any MCP-compatible AI long-term memory across conversations.

**What it does:** Store notes, decisions, and context → retrieve them semantically later. Your AI remembers everything.

## Why MemData?

AI assistants forget everything between sessions. MemData fixes that:

- **Ingest** → Drop in meeting notes, docs, decisions
- **Chunk & Embed** → Automatically split and vectorize
- **Query** → Ask questions, get relevant context back
- **Tag** → AI auto-tags content for better retrieval

Works with Claude Desktop, Claude Code, Cursor, and any MCP client.

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

### Core Tools

| Tool | Description |
|------|-------------|
| `memdata_ingest` | Store text in long-term memory |
| `memdata_query` | Search memory with natural language |
| `memdata_list` | List all stored memories |
| `memdata_delete` | Delete a memory by ID |
| `memdata_status` | Check API health and storage usage |

### Identity & Session Tools (v1.2.0+)

| Tool | Description |
|------|-------------|
| `memdata_whoami` | Get agent identity at session start - name, context, recent activity |
| `memdata_set_identity` | Set your agent name and identity summary |
| `memdata_session_end` | Save a handoff before session ends - preserved for next session |
| `memdata_query_timerange` | Search with date filters (since/until) |
| `memdata_relationships` | Find related entities (people, companies, projects) |

### v1.4.0 UX Improvements

- **Visual match quality** - Query results show 🟢🟡🟠🔴 indicators for match strength
- **Smarter whoami** - Prompts to set identity on first use, deduplicates recent activity
- **Better ingest feedback** - Shows chunk count and explains async AI tagging
- **Session continuity** - Emphasizes "Continue Working On" and reminds to use `session_end`

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

### `memdata_whoami`

Get your identity and context at session start. Call this first thing each session.

```
"Who am I? What was I working on?"
```

Returns: agent name, identity summary, session count, last session handoff, recent activity.

### `memdata_set_identity`

Set or update your agent identity.

**Parameters:**
- `agent_name` (string, optional) - Your name (e.g., "MemBrain")
- `identity_summary` (string, optional) - Who you are and your purpose

### `memdata_session_end`

Save context before ending a session. Next session will see this handoff.

**Parameters:**
- `summary` (string) - What happened this session
- `working_on` (string, optional) - Current focus
- `context` (object, optional) - Additional context to preserve

### `memdata_query_timerange`

Search memory within a date range.

```
"What did I work on last week?"
```

**Parameters:**
- `query` (string) - Natural language search
- `since` (string, optional) - ISO date (e.g., "2026-01-01")
- `until` (string, optional) - ISO date (e.g., "2026-01-31")
- `limit` (number, optional) - Max results

### `memdata_relationships`

Find entities that appear together in your memory.

```
"Who has John Smith worked with?"
```

**Parameters:**
- `entity` (string) - Name to search for
- `type` (string, optional) - Filter by type (person, company, project)
- `limit` (number, optional) - Max relationships

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

## Example Usage

Once configured, just talk to your AI:

```
You: "Remember that we chose PostgreSQL for the user service"
AI: [calls memdata_ingest] → Stored in memory

... days later ...

You: "What database are we using for users?"
AI: [calls memdata_query] → "PostgreSQL for the user service" (73% match)
```

## Links

- [MemData](https://memdata.ai) - Main site
- [Dashboard](https://memdata.ai/dashboard) - Manage your memory
- [API Docs](https://memdata.ai/docs) - Full documentation
- [GitHub](https://github.com/thelabvenice/memdata-mcp) - This repo

## Contributing

Issues and PRs welcome! This is the open-source MCP client for the hosted MemData service.

## License

MIT
