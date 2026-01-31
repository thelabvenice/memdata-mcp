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
interface NarrativeInsight {
  type: string;
  content: string;
  confidence: number;
  evidence: string;
  chunk_id: string;
}

interface NarrativeLayer {
  decisions?: NarrativeInsight[];
  causality?: NarrativeInsight[];
  patterns?: NarrativeInsight[];
  implications?: NarrativeInsight[];
  gaps?: NarrativeInsight[];
}

interface QueryResult {
  success: boolean;
  results?: Array<{ text: string; source: string; score: number }>;
  narrative?: NarrativeLayer;
  narrative_count?: number;
  message?: string;
}

async function queryMemory(
  query: string,
  limit: number = 5
): Promise<QueryResult> {
  const result = (await callAPI('/api/memdata/query', {
    query,
    limit,
  })) as {
    success: boolean;
    results?: Array<{ chunk_text: string; source_name: string; similarity_score: number }>;
    narrative?: NarrativeLayer;
    narrative_count?: number;
    error?: string;
  };

  if (!result.success) {
    return { success: false, message: result.error || 'Unknown error' };
  }

  return {
    success: true,
    narrative: result.narrative,
    narrative_count: result.narrative_count,
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
 * Get agent identity (who am I)
 */
async function getIdentity(): Promise<{
  success: boolean;
  identity?: {
    agent_name: string | null;
    identity_summary: string | null;
    session_count: number;
  };
  last_session?: Record<string, unknown>;
  working_on?: string | null;
  memory_stats?: {
    total_memories: number;
    oldest_memory: string | null;
    newest_memory: string | null;
  };
  recent_activity?: Array<{ source: string; date: string }>;
  message?: string;
}> {
  try {
    const result = (await callAPIGet('/api/memdata/identity')) as {
      success: boolean;
      identity?: {
        agent_name: string | null;
        identity_summary: string | null;
        session_count: number;
      };
      last_session?: Record<string, unknown>;
      working_on?: string | null;
      memory_stats?: {
        total_memories: number;
        oldest_memory: string | null;
        newest_memory: string | null;
      };
      recent_activity?: Array<{ source: string; date: string }>;
      error?: string;
    };

    if (!result.success) {
      return { success: false, message: result.error || 'Unknown error' };
    }

    return {
      success: true,
      identity: result.identity,
      last_session: result.last_session,
      working_on: result.working_on,
      memory_stats: result.memory_stats,
      recent_activity: result.recent_activity,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * End session with handoff
 */
async function endSession(
  summary: string,
  working_on?: string,
  context?: Record<string, unknown>
): Promise<{ success: boolean; message?: string }> {
  try {
    const result = (await callAPI('/api/memdata/identity', {
      working_on,
      session_handoff: {
        summary,
        context: context || {},
        ended_at: new Date().toISOString(),
      },
    })) as { success: boolean; error?: string; message?: string };

    if (!result.success) {
      return { success: false, message: result.error || 'Unknown error' };
    }

    return { success: true, message: result.message };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Update agent identity
 */
async function updateIdentity(
  agent_name?: string,
  identity_summary?: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const result = (await callAPI('/api/memdata/identity', {
      agent_name,
      identity_summary,
    })) as { success: boolean; error?: string; message?: string };

    if (!result.success) {
      return { success: false, message: result.error || 'Unknown error' };
    }

    return { success: true, message: result.message };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Query with date filtering
 */
async function queryMemoryWithDates(
  queryText: string,
  limit: number = 5,
  since?: string,
  until?: string
): Promise<{ success: boolean; results?: Array<{ text: string; source: string; score: number; date: string }>; message?: string }> {
  const body: Record<string, unknown> = { query: queryText, limit };
  if (since) body.since = since;
  if (until) body.until = until;

  const result = (await callAPI('/api/memdata/query', body)) as {
    success: boolean;
    results?: Array<{ chunk_text: string; source_name: string; similarity_score: number; created_at: string }>;
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
      date: r.created_at.split('T')[0],
    })),
  };
}

/**
 * Get relationships for an entity
 */
async function getRelationships(
  entity: string,
  type?: string,
  limit: number = 10
): Promise<{
  success: boolean;
  entity_name?: string;
  entity_type?: string;
  relationships?: Array<{ name: string; type: string; strength: number }>;
  message?: string;
}> {
  try {
    const result = (await callAPI('/api/memdata/relationships', {
      entity,
      type,
      limit,
    })) as {
      success: boolean;
      entity?: string;
      entity_type?: string;
      results?: Array<{ name: string; type: string; co_occurrence_count: number }>;
      error?: string;
      message?: string;
    };

    if (!result.success) {
      return { success: false, message: result.error || result.message || 'Unknown error' };
    }

    return {
      success: true,
      entity_name: result.entity,
      entity_type: result.entity_type,
      relationships: (result.results || []).map((r) => ({
        name: r.name,
        type: r.type,
        strength: r.co_occurrence_count,
      })),
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
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
            text: `✅ Stored in memory:\n- Source: ${name}\n- Chunks: ${result.chunkCount}\n- ID: ${result.artifactId}\n\n🏷️ AI tagging & narrative extraction will run in background (~2 min).`,
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

      // Add match quality indicator based on score
      const getMatchQuality = (score: number): string => {
        if (score >= 0.7) return '🟢'; // Strong match
        if (score >= 0.5) return '🟡'; // Good match
        if (score >= 0.35) return '🟠'; // Partial match
        return '🔴'; // Weak match
      };

      const formatted = result.results
        .map((r, i) => `[${i + 1}] ${getMatchQuality(r.score)} ${(r.score * 100).toFixed(1)}% | ${r.source}\n${r.text}`)
        .join('\n\n---\n\n');

      // Format narrative layer if present
      let narrativeSection = '';
      if (result.narrative && (result.narrative_count ?? 0) > 0) {
        const parts: string[] = [];

        if (result.narrative.decisions?.length) {
          parts.push('DECISIONS:\n' + result.narrative.decisions
            .map((n: { content: string; confidence: number }) => `  • ${n.content} (${Math.round(n.confidence * 100)}%)`)
            .join('\n'));
        }
        if (result.narrative.causality?.length) {
          parts.push('CAUSALITY:\n' + result.narrative.causality
            .map((n: { content: string; confidence: number }) => `  • ${n.content} (${Math.round(n.confidence * 100)}%)`)
            .join('\n'));
        }
        if (result.narrative.patterns?.length) {
          parts.push('PATTERNS:\n' + result.narrative.patterns
            .map((n: { content: string; confidence: number }) => `  • ${n.content} (${Math.round(n.confidence * 100)}%)`)
            .join('\n'));
        }
        if (result.narrative.implications?.length) {
          parts.push('IMPLICATIONS:\n' + result.narrative.implications
            .map((n: { content: string; confidence: number }) => `  • ${n.content} (${Math.round(n.confidence * 100)}%)`)
            .join('\n'));
        }
        if (result.narrative.gaps?.length) {
          parts.push('GAPS:\n' + result.narrative.gaps
            .map((n: { content: string; confidence: number }) => `  • ${n.content} (${Math.round(n.confidence * 100)}%)`)
            .join('\n'));
        }

        if (parts.length > 0) {
          narrativeSection = '\n\n═══ NARRATIVE INSIGHTS ═══\n' + parts.join('\n\n');
        }
      }

      // Add score legend for first-time users
      const scoreLegend = '\n\n---\n_Match quality: 🟢 >70% strong | 🟡 >50% good | 🟠 >35% partial | 🔴 weak_';

      return {
        content: [
          {
            type: 'text' as const,
            text: `Found ${result.results.length} relevant memories:\n\n${formatted}${narrativeSection}${scoreLegend}`,
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

      const countNote = result.artifacts.length >= limit
        ? `\n\n_Showing ${result.artifacts.length} memories. Use \`limit\` param for more._`
        : '';

      return {
        content: [
          {
            type: 'text' as const,
            text: `Stored memories (${result.artifacts.length}):\n\n${formatted}${countNote}`,
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

// Register whoami tool
server.tool(
  'memdata_whoami',
  'Get your agent identity and context at session start. Returns your name, identity summary, what you were working on, recent activity, and memory stats. Call this at the beginning of each session to remember who you are.',
  {},
  async () => {
    try {
      const result = await getIdentity();

      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: `Failed to get identity: ${result.message}` }],
          isError: true,
        };
      }

      const identity = result.identity!;
      const stats = result.memory_stats!;
      const recent = result.recent_activity || [];

      let response = `# Who Am I\n\n`;
      response += `**Name:** ${identity.agent_name || 'Not set'}\n`;
      response += `**Identity:** ${identity.identity_summary || 'Not set'}\n`;
      response += `**Session #:** ${identity.session_count}\n`;

      // Prompt to set identity if not configured
      if (!identity.agent_name && !identity.identity_summary) {
        response += `\n> 💡 **First time?** Set your identity with \`memdata_set_identity\` to personalize your memory.\n`;
      }

      response += `\n`;

      // Prioritize showing what we were working on - this is the most important continuity info
      if (result.working_on) {
        response += `## 🎯 Continue Working On\n${result.working_on}\n\n`;
      }

      if (result.last_session && Object.keys(result.last_session).length > 0) {
        response += `## Last Session Handoff\n${JSON.stringify(result.last_session, null, 2)}\n\n`;
      }

      response += `## Memory Stats\n`;
      response += `- Total memories: ${stats.total_memories}\n`;
      response += `- Oldest: ${stats.oldest_memory || 'None'}\n`;
      response += `- Newest: ${stats.newest_memory || 'None'}\n\n`;

      // Deduplicate recent activity by source name (chunks from same artifact appear once)
      if (recent.length > 0) {
        const seen = new Set<string>();
        const uniqueRecent = recent.filter((r) => {
          if (seen.has(r.source)) return false;
          seen.add(r.source);
          return true;
        });

        response += `## Recent Activity\n`;
        uniqueRecent.slice(0, 5).forEach((r) => {
          response += `- ${r.source} (${r.date})\n`;
        });
      }

      // Remind about session_end if this isn't the first session
      if (identity.session_count > 1 && !result.working_on) {
        response += `\n> 💡 **Tip:** Use \`memdata_session_end\` before ending to preserve context for next time.\n`;
      }

      return {
        content: [{ type: 'text' as const, text: response }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text' as const, text: `Failed to get identity: ${message}` }],
        isError: true,
      };
    }
  }
);

// Register session end tool
server.tool(
  'memdata_session_end',
  'Save a session handoff before ending. Stores what you were working on and context for the next session. Call this before context compression or when ending a work session.',
  {
    summary: z.string().describe('Brief summary of what happened this session'),
    working_on: z.string().optional().describe('What you are currently working on (will be shown at next session start)'),
    context: z.record(z.unknown()).optional().describe('Additional context to preserve (JSON object)'),
  },
  async ({ summary, working_on, context }) => {
    try {
      const result = await endSession(summary, working_on, context as Record<string, unknown>);

      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: `Failed to save handoff: ${result.message}` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Session handoff saved.\n\nNext session will see:\n- Working on: ${working_on || 'Not specified'}\n- Summary: ${summary.substring(0, 100)}...`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text' as const, text: `Failed to save handoff: ${message}` }],
        isError: true,
      };
    }
  }
);

// Register identity update tool
server.tool(
  'memdata_set_identity',
  'Set or update your agent identity. Use this to establish who you are and your purpose.',
  {
    agent_name: z.string().optional().describe('Your agent name (e.g., "MemBrain", "ResearchBot")'),
    identity_summary: z.string().optional().describe('Brief description of who you are and your purpose'),
  },
  async ({ agent_name, identity_summary }) => {
    try {
      const result = await updateIdentity(agent_name, identity_summary);

      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: `Failed to update identity: ${result.message}` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Identity updated:\n- Name: ${agent_name || '(unchanged)'}\n- Summary: ${identity_summary || '(unchanged)'}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text' as const, text: `Failed to update identity: ${message}` }],
        isError: true,
      };
    }
  }
);

// Register relationships tool
server.tool(
  'memdata_relationships',
  'Find entities related to a person, company, or concept in your memory. Shows who/what appears together in the same context.',
  {
    entity: z.string().describe('Name of the entity to find relationships for (e.g., "John Smith", "Acme Corp", "authentication")'),
    type: z.string().optional().describe('Filter to specific entity type (person, company, project, topic, concept)'),
    limit: z.number().optional().default(10).describe('Maximum relationships to return (default: 10)'),
  },
  async ({ entity, type, limit }) => {
    try {
      const result = await getRelationships(entity, type, limit);

      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: `Failed to get relationships: ${result.message}` }],
          isError: true,
        };
      }

      if (!result.relationships || result.relationships.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No relationships found for "${entity}".` }],
        };
      }

      let response = `# Relationships for ${result.entity_name} (${result.entity_type})\n\n`;
      result.relationships.forEach((r) => {
        response += `- **${r.name}** (${r.type}) - ${r.strength} co-occurrences\n`;
      });

      return {
        content: [{ type: 'text' as const, text: response }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text' as const, text: `Failed to get relationships: ${message}` }],
        isError: true,
      };
    }
  }
);

// Register time-aware query tool
server.tool(
  'memdata_query_timerange',
  'Search memory within a specific time range. Use for queries like "what did I work on last week" or "meetings from January".',
  {
    query: z.string().describe('Natural language search query'),
    since: z.string().optional().describe('ISO date string - only return results after this date (e.g., "2026-01-01")'),
    until: z.string().optional().describe('ISO date string - only return results before this date (e.g., "2026-01-31")'),
    limit: z.number().optional().default(5).describe('Maximum number of results (default: 5, max: 20)'),
  },
  async ({ query, since, until, limit }) => {
    try {
      const result = await queryMemoryWithDates(query, Math.min(limit, 20), since, until);

      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: `Failed to query: ${result.message}` }],
          isError: true,
        };
      }

      if (!result.results || result.results.length === 0) {
        let msg = `No memories found for "${query}"`;
        if (since || until) {
          msg += ` in date range ${since || 'start'} to ${until || 'now'}`;
        }
        return {
          content: [{ type: 'text' as const, text: msg }],
        };
      }

      // Add match quality indicator based on score
      const getMatchQuality = (score: number): string => {
        if (score >= 0.7) return '🟢';
        if (score >= 0.5) return '🟡';
        if (score >= 0.35) return '🟠';
        return '🔴';
      };

      const formatted = result.results
        .map((r, i) => `[${i + 1}] ${getMatchQuality(r.score)} ${(r.score * 100).toFixed(1)}% | ${r.date} | ${r.source}\n${r.text}`)
        .join('\n\n---\n\n');

      return {
        content: [
          {
            type: 'text' as const,
            text: `Found ${result.results.length} memories:\n\n${formatted}`,
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
