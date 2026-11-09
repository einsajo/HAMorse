/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional: the agent route that plays every LLM persona (the Guide, the
   * Stranger, the Ghost): an LLM behind a serverless proxy (server/agent-route.mjs)
   * or an MCP / agent bridge. Unset = every persona runs locally, offline.
   * See src/utils/agentEngine.ts.
   */
  readonly VITE_AGENT_URL?: string
  /** Older name for VITE_AGENT_URL (still honoured) */
  readonly VITE_GHOST_AGENT_URL?: string
}
