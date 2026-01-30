#!/usr/bin/env node
/**
 * MemData MCP Server
 *
 * A thin client that exposes memory ingestion and query tools via MCP.
 * Connects to the hosted MemData API (memdata.ai).
 *
 * Usage:
 *   npx memdata-mcp
 *
 * Environment Variables:
 *   MEMDATA_API_KEY - Your MemData API key (required, starts with md_)
 *   MEMDATA_API_URL - API URL (optional, defaults to https://memdata.ai)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Configuration
const MEMDATA_API_KEY = process.env.MEMDATA_API_KEY;
const MEMDATA_API_URL = process.env.MEMDATA_API_URL || 'https://memdata.ai';

if (!MEMDATA_API_KEY) {
  console.error('Error: MEMDATA_API_KEY environment variable is required');
  console.error('');
  console.error('Get your API key at: https://memdata.ai/dashboard/api-keys');
  console.error('');
  console.error('Then add to your MCP config:');
  console.error(JSON.stringify({
    mcpServers: {
      memdata: {
        command: 'npx',
        args: ['memdata-mcp'],
        env: {
          MEMDATA_API_KEY: 'md_your_key_here'
        }
      }
    }
  }, null, 2));
  process.exit(1);
}

/**
 * Call the MemData API (POST)
 */
async function callAPI(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${MEMDATA_API_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MEMDATA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }

  return response.json();
}

/**
 * Call the MemData API (GET)
 */
async function callAPIGet(endpoint: string): Promise<unknown> {
  const response = await fetch(`${MEMDATA_API_URL}${endpoint}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${MEMDATA_API_KEY}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }

  return response.json();
}

/**
 * Call the MemData API (DELETE)
 */
async function callAPIDelete(endpoint: string): Promise<unknown> {
  const response = await fetch(`${MEMDATA_API_URL}${endpoint}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${MEMDATA_API_KEY}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }

  return response.json();
}

/**
 * Ingest text content into memory
 */
async function ingestContent(
  content: string,
  name: string
): Promise<{ success: boolean; artifactId?: string; chunkCount?: number; message?: string }> {
  const result = (await callAPI('/api/memdata/ingest', {
    content,
    sourceName: name,
  })) as { success: boolean; artifact_id?: string; chunk_count?: number; error?: string };

  if (!result.success) {
    return { success: false, message: result.error || 'Unknown error' };
  }

  return {
    success: true,
    artifactId: result.artifact_id,
    chunkCount: result.chunk_count,
  };
}

/**
 * Query memory for relevant context
 */
async function queryMemory(
  query: string,
  limit: number = 5
): Promise<{ success: boolean; results?: Array<{ text: string; source: string; score: number }>; message?: string }> {
  const result = (await callAPI('/api/memdata/query', {
    query,
    limit,
  })) as {
    success: boolean;
    results?: Array<{ chunk_text: string; source_name: string; similarity_score: number }>;
    error?: string;
  };

  if (!result.success) {
    return { success: false, message: result.error || 'Unknown error' };
  }

  return {
    success: true,
    results: (result.results || []).map((r) => ({
      text: r.chunk_text,
      source: r.source_name,
      score: Math.round(r.similarity_score * 1000) / 1000,
    })),
  };
}

/**
 * List all artifacts in memory
 */
async function listArtifacts(
  limit: number = 20
): Promise<{
  success: boolean;
  artifacts?: Array<{ id: string; name: string; type: string; chunks: number; date: string }>;
  message?: string;
}> {
  const result = (await callAPIGet(`/api/memdata/artifacts?limit=${limit}`)) as {
    success: boolean;
    artifacts?: Array<{ id: string; source_name: string; type: string; chunk_count: number; created_at: string }>;
    error?: string;
  };

  if (!result.success) {
    return { success: false, message: result.error || 'Unknown error' };
  }

  return {
    success: true,
    artifacts: (result.artifacts || []).map((a) => ({
      id: a.id,
      name: a.source_name,
      type: a.type,
      chunks: a.chunk_count,
      date: a.created_at.split('T')[0],
    })),
  };
}

/**
 * Delete an artifact from memory
 */
async function deleteArtifact(
  artifactId: string
): Promise<{ success: boolean; deletedChunks?: number; message?: string }> {
  const result = (await callAPIDelete(`/api/memdata/artifacts/${artifactId}`)) as {
    success: boolean;
    deleted_chunks?: number;
    error?: string;
    message?: string;
  };

  if (!result.success) {
    return { success: false, message: result.error || 'Unknown error' };
  }

  return {
    success: true,
    deletedChunks: result.deleted_chunks,
    message: result.message,
  };
}

/**
 * Get memory status and usage
 */
async function getStatus(): Promise<{
  success: boolean;
  healthy?: boolean;
  storage?: { used_mb: number; limit_mb: number; percent: number };
  message?: string;
}> {
  try {
    // Check health
    const health = (await callAPIGet('/api/memdata/health')) as { status: string };
    const isHealthy = health.status === 'ok';

    // Get usage stats
    const usage = (await callAPIGet('/api/memdata/usage')) as {
      success: boolean;
      usage?: { storage_used_mb: number; storage_limit_mb: number };
    };

    const storageUsed = usage.usage?.storage_used_mb || 0;
    const storageLimit = usage.usage?.storage_limit_mb || 0;

    return {
      success: true,
      healthy: isHealthy,
      storage: {
        used_mb: storageUsed,
        limit_mb: storageLimit,
        percent: storageLimit > 0 ? Math.round((storageUsed / storageLimit) * 100) : 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Create MCP server
const server = new McpServer({
  name: 'memdata',
  version: '1.0.0',
});

// Register ingest tool
server.tool(
  'memdata_ingest',
  'Ingest text content into long-term memory for later retrieval. Use this to store important information, notes, decisions, or context that should be remembered across conversations.',
  {
    content: z.string().describe('Text content to store in memory'),
    name: z.string().describe('Source name/identifier for this memory (e.g., "meeting-notes-2024-01-15", "project-decision", "user-preference")'),
  },
  async ({ content, name }) => {
    try {
      const result = await ingestContent(content, name);

      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: `Failed to ingest: ${result.message}` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Successfully stored in memory:\n- Artifact ID: ${result.artifactId}\n- Chunks created: ${result.chunkCount}\n- Source: ${name}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text' as const, text: `Failed to ingest content: ${message}` }],
        isError: true,
      };
    }
  }
);

// Register query tool
server.tool(
  'memdata_query',
  'Search memory for relevant context based on a natural language query. Returns the most semantically similar stored content with similarity scores.',
  {
    query: z.string().describe('Natural language search query (e.g., "What did we decide about the database?", "meeting notes from last week")'),
    limit: z.number().optional().default(5).describe('Maximum number of results to return (default: 5, max: 20)'),
  },
  async ({ query, limit }) => {
    try {
      const result = await queryMemory(query, Math.min(limit, 20));

      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: `Failed to query: ${result.message}` }],
          isError: true,
        };
      }

      if (!result.results || result.results.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No relevant memories found for this query.' }],
        };
      }

      const formatted = result.results
        .map((r, i) => `[${i + 1}] (${(r.score * 100).toFixed(1)}% match) ${r.source}\n${r.text}`)
        .join('\n\n---\n\n');

      return {
        content: [
          {
            type: 'text' as const,
            text: `Found ${result.results.length} relevant memories:\n\n${formatted}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text' as const, text: `Failed to query memory: ${message}` }],
        isError: true,
      };
    }
  }
);

// Register list tool
server.tool(
  'memdata_list',
  'List all stored memories/artifacts. Shows what content has been ingested with chunk counts and dates. Use this to see what is in memory before querying or to find artifact IDs for deletion.',
  {
    limit: z.number().optional().default(20).describe('Maximum number of artifacts to return (default: 20, max: 50)'),
  },
  async ({ limit }) => {
    try {
      const result = await listArtifacts(Math.min(limit, 50));

      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: `Failed to list: ${result.message}` }],
          isError: true,
        };
      }

      if (!result.artifacts || result.artifacts.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No memories stored yet. Use memdata_ingest to add content.' }],
        };
      }

      const formatted = result.artifacts
        .map((a) => `- ${a.name} (${a.chunks} chunks, ${a.date})\n  ID: ${a.id}`)
        .join('\n');

      return {
        content: [
          {
            type: 'text' as const,
            text: `Stored memories (${result.artifacts.length}):\n\n${formatted}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text' as const, text: `Failed to list memories: ${message}` }],
        isError: true,
      };
    }
  }
);

// Register delete tool
server.tool(
  'memdata_delete',
  'Delete a memory/artifact from storage. This permanently removes the content and all associated chunks. Use memdata_list to find artifact IDs.',
  {
    artifact_id: z.string().describe('The UUID of the artifact to delete (get this from memdata_list)'),
  },
  async ({ artifact_id }) => {
    try {
      const result = await deleteArtifact(artifact_id);

      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: `Failed to delete: ${result.message}` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Successfully deleted artifact and ${result.deletedChunks} chunks.`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text' as const, text: `Failed to delete: ${message}` }],
        isError: true,
      };
    }
  }
);

// Register status tool
server.tool(
  'memdata_status',
  'Check the health and storage usage of your MemData account. Shows API connectivity and how much storage space is used.',
  {},
  async () => {
    try {
      const result = await getStatus();

      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: `Failed to get status: ${result.message}` }],
          isError: true,
        };
      }

      const healthStatus = result.healthy ? 'Healthy' : 'Unhealthy';
      const storage = result.storage!;

      return {
        content: [
          {
            type: 'text' as const,
            text: `MemData Status:\n- API: ${healthStatus}\n- Storage: ${storage.used_mb} MB / ${storage.limit_mb} MB (${storage.percent}% used)`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text' as const, text: `Failed to get status: ${message}` }],
        isError: true,
      };
    }
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MemData MCP server running');
  console.error(`API: ${MEMDATA_API_URL}`);
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
