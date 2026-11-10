#!/usr/bin/env node
/**
 * The agent route: the server side of src/utils/agentEngine.ts.
 *
 * The browser must never hold an LLM key, so the radio's agents (the Guide,
 * the Stranger, the Ghost) talk to this small route, which calls an
 * OpenAI-compatible chat model and re-streams the reply as NDJSON:
 *
 *   POST { agent, system, identity, exchange, heard, history, maxExchanges, event, localTime }
 *   ◄─── {"text":"GE OM"}\n ... {"climax":true}\n
 *
 * The ghost signals its attack by ending its text with [[CLIMAX]]; the route
 * strips it and sends {"climax":true}.
 *
 * Default model: Groq, qwen/qwen3.8-27b, one non-streamed reply (the setup
 * play-tested by the author). Any OpenAI-compatible provider works by setting
 * AGENT_LLM_URL / AGENT_LLM_MODEL (and AGENT_LLM_STREAM=true to stream).
 *
 * Run it:  cp .env.example .env   (put your key in it; .env is git-ignored)
 *          node --env-file=.env server/agent-route.mjs        (port 8787)
 * then run the app with VITE_AGENT_URL=http://localhost:8787/agent
 * Also works as a Node / Vercel-style handler (`export default (req, res)`).
 *
 * Environment:
 *   AGENT_LLM_KEY           API key (GROQ_API_KEY / GEMINI_API_KEY also accepted).
 *                           NEVER put a key in this file: the repository is public.
 *   AGENT_LLM_URL           chat completions URL (default Groq)
 *   AGENT_LLM_MODEL         model name (default qwen/qwen3.8-27b)
 *   AGENT_LLM_STREAM        "true" to stream tokens (default false)
 *   AGENT_LLM_REASONING     reasoning_effort to send ("none" by default for Groq
 *                           and Gemini, unset elsewhere; "off" sends nothing).
 *                           Thinking would eat the short reply budget.
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
const MAX_TOKENS = 100
const TEMPERATURE = 0.7
const CLIMAX_TOKEN = '[[CLIMAX]]'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'qwen/qwen3.8-27b'
/** providers where thinking is switched off by default (it would eat the short reply) */
const NO_THINKING_HOSTS = ['api.groq.com', 'generativelanguage.googleapis.com']
/** unprompted ghost turns: what the operator is doing (mirrors agentEngine.HAUNT_EVENT_TEXT) */
const EVENTS = {
  arrival: 'SOMEONE HAS JUST TUNED IN TO YOUR FREQUENCY AND IS LISTENING, BUT HAS NOT SENT ANYTHING. CALL THEM LIKE AN ORDINARY OPERATOR',
  silence: 'THE OPERATOR HAS GONE SILENT AND IS NOT ANSWERING',
  power: 'THE OPERATOR JUST TRIED TO SWITCH THE RADIO OFF, BUT YOU FORCED THE POWER BACK ON',
  dial: 'THE OPERATOR IS DESPERATELY TRYING TO TURN THE TUNING DIAL AWAY FROM YOU',
}
/*
 * Appended to every persona server-side. The first half keeps the character
 * (the author's tested wording); the second keeps it on the air: the radio
 * keys only A-Z 0-9 . , ? / and cuts a reply at 64 characters, so a long
 * sentence would be chopped off mid-word.
 */
const SERVER_RULES =
  'Stay strictly in character as the persona above. Respond directly to what the operator just said, using the conversation so far. ' +
  'You are on the air in Morse code: reply ONLY in upper-case ham CW shorthand (A-Z, 0-9, space, . , ? /), one short line, at most 60 characters. ' +
  `If and only if you are the ghost and the conversation has reached its breaking point of intense confrontation, end your reply with ${CLIMAX_TOKEN}.`

const env = (k, d) => (typeof process !== 'undefined' && process.env[k]) || d

/** The model settings for this request (read per request, so tests and hosts can change them) */
export function llmConfig() {
  const url = env('AGENT_LLM_URL', GROQ_URL)
  const reasoning = env('AGENT_LLM_REASONING', NO_THINKING_HOSTS.some((h) => url.includes(h)) ? 'none' : '')
  return {
    key: env('AGENT_LLM_KEY', '') || env('GROQ_API_KEY', '') || env('GEMINI_API_KEY', ''),
    url,
    model: env('AGENT_LLM_MODEL', DEFAULT_MODEL),
    stream: env('AGENT_LLM_STREAM', 'false') === 'true',
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

/** Remove a model's private reasoning, if it leaked into the reply (<think>...</think>) */
export function stripThinking(text) {
  return String(text)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '') // cut off mid-thought by max_tokens: nothing of it goes on air
    .replace(/<\/think>/gi, '')
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

/** Write a finished reply: its text (the marker removed), then the climax for the ghost */
function writeReply(res, turn, text) {
  const climax = text.includes(CLIMAX_TOKEN)
  const said = text.split(CLIMAX_TOKEN).join(' ').replace(/\s+/g, ' ').trim()
  if (said) res.write(`${JSON.stringify({ text: said })}\n`)
  if (climax && turn.agent === 'ghost') res.write(`${JSON.stringify({ climax: true })}\n`)
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

  const { key, url, model, stream, reasoning } = llmConfig()
  if (!key) {
    logUpstream('no API key: set AGENT_LLM_KEY (or GROQ_API_KEY) in .env')
    return res.writeHead(503).end('AGENT_LLM_KEY is not set')
  }

  let upstream
  try {
    upstream = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        stream,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        ...(reasoning ? { reasoning_effort: reasoning } : {}),
        messages: buildMessages(turn),
      }),
    })
  } catch (err) {
    logUpstream('could not reach the model', err?.message)
    return res.writeHead(502).end()
  }
  if (!upstream.ok || (stream && !upstream.body)) {
    logUpstream(`the model refused (HTTP ${upstream.status})`, await upstream.text().catch(() => ''))
    return res.writeHead(502).end()
  }

  // one reply (the default): read it whole, then send it
  if (!stream) {
    let text
    try {
      const data = await upstream.json()
      text = stripThinking(data?.choices?.[0]?.message?.content ?? '')
    } catch (err) {
      logUpstream('the model sent something that is not JSON', err?.message)
      return res.writeHead(502).end()
    }
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' })
    writeReply(res, turn, text)
    return res.end()
  }

  // streaming: pass tokens on as they come. The text so far is cleaned whole
  // each time (thinking removed, the marker taken out), and a short tail is
  // held back, so half of "<think>" or "[[CLIMAX]]" can never go out as text.
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' })
  const HOLD = CLIMAX_TOKEN.length
  let raw = ''
  let sent = 0
  const visible = () => stripThinking(raw).split(CLIMAX_TOKEN).join(' ')
  try {
    for await (const piece of deltas(upstream.body)) {
      raw += piece
      const now = visible()
      const upTo = now.length - HOLD
      if (upTo > sent) {
        res.write(`${JSON.stringify({ text: now.slice(sent, upTo) })}\n`)
        sent = upTo
      }
    }
  } catch (err) {
    logUpstream('the stream broke', err?.message) // the app hears QSB... LOST SIG
  }
  const rest = visible().slice(sent).replace(/\s+/g, ' ')
  if (rest.trim()) res.write(`${JSON.stringify({ text: rest })}\n`)
  if (stripThinking(raw).includes(CLIMAX_TOKEN) && turn.agent === 'ghost') res.write(`${JSON.stringify({ climax: true })}\n`)
  res.end()
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(env('PORT', 8787))
  const { key, model, url, stream } = llmConfig()
  http
    .createServer((req, res) => (req.url?.startsWith('/agent') ? handler(req, res) : res.writeHead(404).end()))
    .listen(port, () => {
      console.log(`agent route on http://localhost:${port}/agent  (model ${model} at ${new URL(url).host}${stream ? ', streaming' : ''})`)
      if (!key) console.log('  no API key yet: copy .env.example to .env and fill in AGENT_LLM_KEY')
    })
}
