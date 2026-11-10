#!/usr/bin/env node
/**
 * live-streams power: provision CORS-friendly live radio for the three
 * RX-only broadcasters and write src/data/liveStreams.ts.
 *
 *   node .kiro/powers/live-streams/skills/fetch-streams/scripts/fetch-streams.mjs [options]
 *
 *   --check              verify what's in src/data/liveStreams.ts now; write nothing
 *   --origin <url>       the Origin to verify CORS for (default https://example.com)
 *   --api <base>         Radio Browser base URL (default: try the public mirrors)
 *   --out <file>         where to write (default src/data/liveStreams.ts)
 *   --prefer <url>       try this candidate first in every slot (repeatable)
 *   --timeout <ms>       per-probe timeout (default 8000)
 *   --allow-http         accept http:// streams (local testing only: browsers block mixed content)
 *   --dry-run            find and verify, but don't write
 *
 * A stream is accepted only if: HTTPS; a GET with an Origin header answers
 * 200/206 with an audio/* (or application/ogg) content type; and the response
 * has Access-Control-Allow-Origin "*" or that origin. createMediaElementSource
 * needs exactly that, or Web Audio hears silence.
 *
 * Node 18+ (global fetch). No dependencies.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The three broadcasters, with curated first choices (verified on every run, never trusted blindly) */
export const SLOTS = [
  {
    freq: '89.30',
    genre: 'news',
    tags: ['news', 'talk'],
    curated: [{ name: 'NPR News', url: 'https://npr-ice.streamguys1.com/live.mp3' }],
  },
  {
    freq: '93.50',
    genre: 'sports',
    tags: ['sports', 'sport'],
    curated: [],
  },
  {
    freq: '98.10',
    genre: 'jazz',
    tags: ['jazz', 'smooth jazz'],
    curated: [
      { name: 'SomaFM Sonic Universe (jazz)', url: 'https://ice1.somafm.com/sonicuniverse-128-mp3' },
      { name: 'SomaFM Sonic Universe (jazz)', url: 'https://ice2.somafm.com/sonicuniverse-128-mp3' },
    ],
  },
]

const MIRRORS = ['https://de1.api.radio-browser.info', 'https://fi1.api.radio-browser.info', 'https://nl1.api.radio-browser.info']
const UA = 'HAMorse-live-streams/1.0 (+https://github.com/einsajo/HAMorse)'
const MAX_TRIES_PER_SLOT = 15

export function parseArgs(argv) {
  const o = { check: false, origin: 'https://example.com', api: null, out: null, prefer: [], timeout: 8000, allowHttp: false, dryRun: false, curated: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--check') o.check = true
    else if (a === '--origin') o.origin = next()
    else if (a === '--api') o.api = next()
    else if (a === '--out') o.out = next()
    else if (a === '--prefer') o.prefer.push(next())
    else if (a === '--timeout') o.timeout = Number(next()) || o.timeout
    else if (a === '--allow-http') o.allowHttp = true
    else if (a === '--dry-run') o.dryRun = true
    else if (a === '--no-curated') o.curated = false // directory only (tests: no real stations)
  }
  return o
}

/** Directory candidates for a genre: most-listened working MP3/AAC stations */
export async function directoryCandidates(tags, { api, timeout = 8000, https = true, fetchImpl = fetch } = {}) {
  const bases = api ? [api] : MIRRORS
  for (const base of bases) {
    const out = []
    try {
      for (const tag of tags) {
        for (const codec of ['MP3', 'AAC']) {
          const q = new URLSearchParams({ tag, hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: '20', codec })
          if (https) q.set('is_https', 'true')
          const res = await fetchImpl(`${base}/json/stations/search?${q}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeout) })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          for (const st of await res.json()) {
            const url = st.url_resolved || st.url
            if (url && st.lastcheckok !== 0) out.push({ name: String(st.name || '').trim() || url, url })
          }
        }
      }
      return out
    } catch {
      /* this mirror is down: try the next */
    }
  }
  return []
}

/** Will this stream play through Web Audio from `origin`? */
export async function probe(url, { origin, timeout = 8000, allowHttp = false, fetchImpl = fetch } = {}) {
  let u
  try {
    u = new URL(url)
  } catch {
    return { ok: false, reason: 'bad url' }
  }
  if (u.protocol !== 'https:' && !(allowHttp && u.protocol === 'http:')) return { ok: false, reason: 'http only' }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeout)
  try {
    const res = await fetchImpl(url, { headers: { Origin: origin, 'User-Agent': UA, 'Icy-MetaData': '0' }, signal: ctl.signal, redirect: 'follow' })
    const type = (res.headers.get('content-type') || '').toLowerCase()
    const cors = res.headers.get('access-control-allow-origin')
    try {
      await res.body?.cancel() // we only wanted the headers: never download the stream
    } catch {
      /* already closed */
    }
    if (res.status !== 200 && res.status !== 206) return { ok: false, reason: `HTTP ${res.status}` }
    if (!(type.startsWith('audio/') || type.startsWith('application/ogg') || type === 'application/octet-stream')) return { ok: false, reason: `not audio (${type || 'no type'})` }
    if (!(cors === '*' || cors === origin)) return { ok: false, reason: 'no CORS' }
    return { ok: true, cors, type }
  } catch (e) {
    return { ok: false, reason: e?.name === 'AbortError' ? 'timeout' : 'error' }
  } finally {
    clearTimeout(timer)
  }
}

/** Find the first candidate that verifies, for one slot */
export async function provisionSlot(slot, opts) {
  const seen = new Set()
  const tried = []
  const queue = [...opts.prefer.map((url) => ({ name: url, url })), ...(opts.curated === false ? [] : slot.curated)]
  const fromDirectory = async () => (await directoryCandidates(slot.tags, { api: opts.api, timeout: opts.timeout, https: !opts.allowHttp, fetchImpl: opts.fetchImpl })) ?? []
  let directoryLoaded = false
  while (tried.length < MAX_TRIES_PER_SLOT) {
    if (!queue.length) {
      if (directoryLoaded) break
      directoryLoaded = true
      queue.push(...(await fromDirectory()))
      if (!queue.length) break
    }
    const c = queue.shift()
    if (seen.has(c.url)) continue
    seen.add(c.url)
    const r = await probe(c.url, opts)
    tried.push({ ...c, ...r })
    if (r.ok) return { stream: { name: c.name, genre: slot.genre, url: c.url, verified: true, checkedAt: new Date().toISOString() }, tried }
  }
  return { stream: null, tried }
}

/** The TypeScript the app imports */
export function renderModule(streams) {
  const entry = (freq) => {
    const s = streams[freq]
    if (!s) return `  '${freq}': null,`
    return `  '${freq}': { name: ${JSON.stringify(s.name)}, genre: '${s.genre}', url: ${JSON.stringify(s.url)}, verified: ${s.verified}, checkedAt: ${s.checkedAt ? JSON.stringify(s.checkedAt) : 'null'} },`
  }
  return `/**
 * The live internet radio behind the three broadcasters (RX only).
 *
 * GENERATED by the live-streams Kiro power:
 *   node .kiro/powers/live-streams/skills/fetch-streams/scripts/fetch-streams.mjs
 * which finds candidate streams (curated + the open Radio Browser directory)
 * and keeps only ones that VERIFY: HTTPS, an audio content type, and CORS
 * headers on a GET with an Origin (createMediaElementSource needs CORS, or
 * Web Audio hears silence). Re-run it before a demo; stations change.
 *
 * \`verified: false\` = a seeded candidate the power has not checked yet. The
 * radio copes either way: a stream that fails, or lacks CORS, leaves that
 * broadcaster as its carrier and static.
 */
export interface LiveStream {
  /** what's on */
  name: string
  genre: 'news' | 'sports' | 'jazz'
  url: string
  /** checked by the power (HTTPS + audio + CORS) */
  verified: boolean
  /** when it was checked (ISO), if it was */
  checkedAt: string | null
}

/** Keyed by the broadcaster's frequency (constants.BROADCAST_STATIONS); null = not provisioned */
export const LIVE_STREAMS: Readonly<Record<string, LiveStream | null>> = Object.freeze({
${SLOTS.map((s) => entry(s.freq)).join('\n')}
})
`
}

/** The URLs in the current file (for --check) */
export function currentUrls(source) {
  const out = {}
  for (const m of source.matchAll(/'(\d+\.\d\d)':\s*\{[^}]*?url:\s*'([^']+)'/g)) out[m[1]] = m[2]
  for (const m of source.matchAll(/'(\d+\.\d\d)':\s*\{[^}]*?url:\s*"([^"]+)"/g)) out[m[1]] = m[2]
  return out
}

function findRoot(start) {
  let dir = start
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const up = dirname(dir)
    if (up === dir) return start
    dir = up
  }
}

export async function main(argv = process.argv.slice(2), log = console.log) {
  const opts = parseArgs(argv)
  const root = findRoot(process.cwd())
  const out = resolve(root, opts.out ?? 'src/data/liveStreams.ts')
  const pad = (s, n) => String(s).padEnd(n)

  if (opts.check) {
    const urls = existsSync(out) ? currentUrls(readFileSync(out, 'utf8')) : {}
    let bad = 0
    for (const slot of SLOTS) {
      const url = urls[slot.freq]
      if (!url) {
        log(`${pad(slot.freq, 6)} ${pad(slot.genre, 7)} ✗ not provisioned`)
        bad++
        continue
      }
      const r = await probe(url, opts)
      if (!r.ok) bad++
      log(`${pad(slot.freq, 6)} ${pad(slot.genre, 7)} ${r.ok ? '✓' : '✗'} ${url}  (${r.ok ? `cors: ${r.cors}` : r.reason})`)
    }
    return bad ? 1 : 0
  }

  const streams = {}
  let missing = 0
  for (const slot of SLOTS) {
    const { stream, tried } = await provisionSlot(slot, opts)
    streams[slot.freq] = stream
    if (stream) {
      log(`${pad(slot.freq, 6)} ${pad(slot.genre, 7)} ✓ ${pad(stream.name.slice(0, 30), 31)} ${stream.url}  (cors: ${tried[tried.length - 1].cors})`)
    } else {
      missing++
      const why = Object.entries(tried.reduce((m, t) => ((m[t.reason] = (m[t.reason] ?? 0) + 1), m), {}))
        .map(([r, n]) => `${n} ${r}`)
        .join(', ')
      log(`${pad(slot.freq, 6)} ${pad(slot.genre, 7)} ✗ no candidate passed (${tried.length} tried${why ? `: ${why}` : ''})`)
    }
  }
  if (!opts.dryRun) {
    writeFileSync(out, renderModule(streams))
    log(`wrote ${out}`)
  }
  return missing ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((code) => process.exit(code))
}
