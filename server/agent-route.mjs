#!/usr/bin/env node
/**
 * The agent route: the server side of src/utils/agentEngine.ts.
 *
 * The browser must never hold an LLM key, so the radio's agents (the Guide,
 * the Stranger, the Ghost) talk to this small route, which calls an
 * OpenAI-compatible chat model with streaming and re-streams the reply as
 * NDJSON, one line per token:
 *
 *   POST { agent, system, identity, exchange, heard, history, maxExchanges, event, localTime }
 *   ◄─── {"text":"GE "}\n{"text":"OM"}\n ... {"climax":true}\n
 *
 * The ghost signals its attack by ending its text with [[CLIMAX]]; the route
 * strips it and sends {"climax":true}.
 *
 * Default model: Google Gemini through its OpenAI-compatible endpoint. Any
 * other OpenAI-compatible provider works by setting AGENT_LLM_URL / MODEL.
 *
 * Standalone:  cp .env.example .env   (put your key in it, never commit it)
 *              node --env-file=.env server/agent-route.mjs        (port 8787)
 * then run the app with VITE_AGENT_URL=http://localhost:8787/agent
 * Also works as a Node / Vercel-style handler (`export default (req, res)`).
 *
 * Environment:
 *   AGENT_LLM_KEY           API key (GEMINI_API_KEY / GROQ_API_KEY also accepted)
 *   AGENT_LLM_URL           chat completions URL (default: Gemini's OpenAI endpoint)
 *   AGENT_LLM_MODEL         model name (default gemini-3.8-flash)
 *   AGENT_LLM_REASONING     reasoning_effort to send (default "none" for Gemini,
 *                           unset otherwise; "off" sends nothing). Gemini counts
 *                           thinking inside max_tokens, and our replies are 40
 *                           tokens: without this the ghost can think and say nothing.
 *   AGENT_ALLOWED_ORIGIN    CORS origin (default *; set it to your site in production)
 *   PORT                    standalone port (default 8787)
 *
 * Guard rails: only the three agent ids are served, the prompt and history
 * are size-capped, replies are capped (max_tokens), and the on-air rules are
 * always appended server-side, so the route can't be used as a general LLM
 * proxy. The key is never logged or sent to the browser.
 */
import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const AGENTS = new Set(['guide', 'stranger', 'ghost'])
const MAX_SYSTEM = 2000
const MAX_HEARD = 200
const MAX_HISTORY = 12
const MAX_TOKENS = 40
const CLIMAX_TOKEN = '[[CLIMAX]]'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
const DEFAULT_MODEL = 'gemini-3.8-flash'
/** unprompted ghost turns: what the operator is doing (mirrors agentEngine.HAUNT_EVENT_TEXT) */
const EVENTS = {
  silence: 'THE OPERATOR HAS GONE SILENT AND IS NOT ANSWERING',
  power: 'THE OPERATOR JUST TRIED TO SWITCH THE RADIO OFF, BUT YOU FORCED THE POWER BACK ON',
  dial: 'THE OPERATOR IS DESPERATELY TRYING TO TURN THE TUNING DIAL AWAY FROM YOU',
}
const SERVER_RULES =
  'Reply ONLY in upper-case ham CW shorthand (A-Z, 0-9, space, . , ? /), at most 60 characters. ' +
  `If and only if you are the ghost and you attack now, end your reply with ${CLIMAX_TOKEN}.`

const env = (k, d) => (typeof process !== 'undefined' && process.env[k]) || d

/** The model settings for this request (read per request, so tests and hosts can change them) */
export function llmConfig() {
  const url = env('AGENT_LLM_URL', GEMINI_URL)
  const reasoning = env('AGENT_LLM_REASONING', url.includes('generativelanguage.googleapis.com') ? 'none' : '')
  return {
    key: env('AGENT_LLM_KEY', '') || env('GEMINI_API_KEY', '') || env('GROQ_API_KEY', ''),
    url,
    model: env('AGENT_LLM_MODEL', DEFAULT_MODEL),
    reasoning: reasoning === 'off' ? '' : reasoning,
  }
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', env('AGENT_ALLOWED_ORIGIN', '*'))
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body // frameworks that pre-parse
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 64_000) throw new Error('too large')
  }
  return JSON.parse(raw || '{}')
}

/** The chat messages for one turn */
export function buildMessages(turn) {
  const system = `${String(turn.system ?? '').slice(0, MAX_SYSTEM)} ${SERVER_RULES}`.trim()
  const history = Array.isArray(turn.history) ? turn.history.slice(-MAX_HISTORY) : []
  const said = EVENTS[turn.event] ? `[${EVENTS[turn.event]}]` : String(turn.heard ?? '').slice(0, MAX_HEARD)
  const time = /^\d\d:\d\d$/.test(String(turn.localTime ?? '')) ? `, operator's local time ${turn.localTime}` : ''
  return [
    { role: 'system', content: system },
    ...history.map((m) => ({ role: m.role === 'operator' ? 'user' : 'assistant', content: String(m.text ?? '').slice(0, MAX_HEARD) })),
    { role: 'user', content: `${said} (exchange ${Number(turn.exchange) + 1}${time})` },
  ]
}

/** Pull the text deltas out of an OpenAI-style SSE stream */
export async function* deltas(body) {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const data = line.trim().startsWith('data:') ? line.trim().slice(5).trim() : null
      if (!data || data === '[DONE]') continue
      try {
        const piece = JSON.parse(data)?.choices?.[0]?.delta?.content
        if (typeof piece === 'string' && piece) yield piece
      } catch {
        /* a keep-alive or a partial line */
      }
    }
  }
}

/** Server-side diagnostics: the provider's status and a short reason, never the key */
function logUpstream(what, detail) {
  console.error(`[agent-route] ${what}${detail ? `: ${String(detail).replace(/\s+/g, ' ').slice(0, 300)}` : ''}`)
}

export default async function handler(req, res, { fetchImpl = fetch } = {}) {
  cors(res)
  if (req.method === 'OPTIONS') return res.writeHead(204).end()
  if (req.method !== 'POST') return res.writeHead(405).end()
  let turn
  try {
    turn = await readJson(req)
  } catch {
    return res.writeHead(400).end()
  }
  if (!AGENTS.has(turn.agent)) return res.writeHead(400).end()

  const { key, url, model, reasoning } = llmConfig()
  if (!key) {
    logUpstream('no API key: set AGENT_LLM_KEY (or GEMINI_API_KEY) in .env')
    return res.writeHead(503).end('AGENT_LLM_KEY is not set')
  }

  let upstream
  try {
    upstream = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        stream: true,
        max_tokens: MAX_TOKENS,
        temperature: 0.9,
        ...(reasoning ? { reasoning_effort: reasoning } : {}),
        messages: buildMessages(turn),
      }),
    })
  } catch (err) {
    logUpstream('could not reach the model', err?.message)
    return res.writeHead(502).end()
  }
  if (!upstream.ok || !upstream.body) {
    logUpstream(`the model refused (HTTP ${upstream.status})`, await upstream.text().catch(() => ''))
    return res.writeHead(502).end()
  }

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' })
  // hold back a tail that could be the start of [[CLIMAX]], so the marker never leaks out as text
  let pending = ''
  let climax = false
  try {
    for await (const piece of deltas(upstream.body)) {
      pending += piece
      if (pending.includes(CLIMAX_TOKEN)) {
        climax = true
        pending = pending.replace(CLIMAX_TOKEN, '')
      }
      const safe = pending.length - (CLIMAX_TOKEN.length - 1)
      if (safe > 0) {
        res.write(`${JSON.stringify({ text: pending.slice(0, safe) })}\n`)
        pending = pending.slice(safe)
      }
    }
  } catch (err) {
    logUpstream('the stream broke', err?.message) // the app hears QSB... LOST SIG
  }
  if (pending.includes(CLIMAX_TOKEN)) {
    climax = true
    pending = pending.replace(CLIMAX_TOKEN, '')
  }
  if (pending) res.write(`${JSON.stringify({ text: pending })}\n`)
  if (climax && turn.agent === 'ghost') res.write(`${JSON.stringify({ climax: true })}\n`)
  res.end()
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(env('PORT', 8787))
  const { key, model, url } = llmConfig()
  http
    .createServer((req, res) => (req.url?.startsWith('/agent') ? handler(req, res) : res.writeHead(404).end()))
    .listen(port, () => {
      console.log(`agent route on http://localhost:${port}/agent  (model ${model} at ${new URL(url).host})`)
      if (!key) console.log('  no API key yet: copy .env.example to .env and fill in AGENT_LLM_KEY')
    })
}
