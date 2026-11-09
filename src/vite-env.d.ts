/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional: URL of the live ghost agent (an LLM behind a serverless proxy
   * or an MCP bridge). Unset = the built-in scripted ghost. See src/utils/ghostAgent.ts.
   */
  readonly VITE_GHOST_AGENT_URL?: string
}
