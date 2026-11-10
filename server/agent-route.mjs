#!/usr/bin/env node
import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const AGENTS = new Set(['guide', 'stranger', 'ghost'])
const MAX_SYSTEM = 2000
const MAX_HEARD = 200
const MAX_HISTORY = 12
const CLIMAX_TOKEN = '[[CLIMAX]]'
const EVENTS = {
  silence: 'THE OPERATOR HAS GONE SILENT AND IS NOT ANSWERING',
  power: 'THE OPERATOR JUST TRIED TO SWITCH THE RADIO OFF, BUT YOU FORCED THE POWER BACK ON',
  dial: 'THE OPERATOR IS DESPERATELY TRYING TO TURN THE TUNING DIAL AWAY FROM YOU',
}
const SERVER_RULES =
  'Reply ONLY in upper-case ham CW shorthand (A-Z, 0-9, space, . , ? /), at most 60 characters. ' +
  `If and only if you are the ghost and you attack now, end your reply with ${CLIMAX_TOKEN}.`

const env = (k, d) => (typeof process !== 'undefined' && process.env[k]) || d

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', env('AGENT_ALLOWED_ORIGIN', '*'))
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 64_000) throw new Error('too large')
  }
  return JSON.parse(raw || '{}')
}

export function buildMessages(turn) {
  const system = `${String(turn.system ?? '').slice(0, MAX_SYSTEM)} ${SERVER_RULES}`.trim()
  const history = Array.isArray(turn.history) ? turn.history.slice(-MAX_HISTORY) : []
  return [
    { role: 'system', content: system },
    ...history.map((m) => ({ role: m.role === 'operator' ? 'user' : 'assistant', content: String(m.text ?? '').slice(0, MAX_HEARD) })),
    { role: 'user', content: `${EVENTS[turn.event] ? `[${EVENTS[turn.event]}]` : String(turn.heard ?? '').slice(0, MAX_HEARD)} (exchange ${Number(turn.exchange) + 1})` },
  ]
}

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
      } catch {}
    }
  }
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
  
  const key = process.env.GROQ_API_KEY
  
  let upstream
  try {
    upstream = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'gemini-3.8-flash', stream: true, max_tokens: 40, temperature: 0.9, messages: buildMessages(turn) }),
    })
    
    if (!upstream.ok) {
       console.log("\n❌ GOOGLE REJECTED IT! Reason:", await upstream.text());
       return res.writeHead(502).end();
    }
  } catch (err) {
    console.log("\n❌ SERVER CRASHED! Reason:", err.message);
    return res.writeHead(502).end();
  }

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' })
  let pending = ''
  let climax = false
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
  if (pending.includes(CLIMAX_TOKEN)) {
    climax = true
    pending = pending.replace(CLIMAX_TOKEN, '')
  }
  if (pending) res.write(`${JSON.stringify({ text: pending })}\n`)
  if (climax && turn.agent === 'ghost') res.write(`${JSON.stringify({ climax: true })}\n`)
  res.end()
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = 8787
  http
    .createServer((req, res) => (req.url?.startsWith('/agent') ? handler(req, res) : res.writeHead(404).end()))
    .listen(port, () => console.log(`agent route on http://localhost:${port}/agent`))
}