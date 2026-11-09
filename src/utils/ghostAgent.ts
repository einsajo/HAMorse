/**
 * The ghost's brain: who (or what) answers you on the wandering frequency.
 *
 *   your Morse ──► GhostSession.turn(heard) ──► GhostBrain.respond(...) ──► stream of events
 *                                                                          { text } tokens   → keyed live (simulate/streamReply)
 *                                                                          { climax }         → the haunt (isHaunted)
 *
 * The brain is pluggable, because a browser can't safely hold an LLM key:
 *
 *  1. A live agent, through `VITE_GHOST_AGENT_URL`: an HTTP endpoint (a
 *     serverless proxy, or a bridge to an MCP / agent runtime) that receives the
 *     persona prompt + the conversation and STREAMS the reply back (NDJSON or
 *     SSE, see `createRemoteGhostBrain`). It should send `{"climax":true}` when
 *     the ghost decides to attack.
 *  2. A host page / agent can plug one in at runtime: `registerGhostBrain(brain)`
 *     or `window.__ghostBrain = brain`.
 *  3. Otherwise, and as the fallback whenever the live agent fails before its
 *     first word, `createScriptedGhostBrain()`: a state machine that plays the
 *     same persona and streams its reply token by token, exactly like an LLM.
 *
 * Whatever the brain, `GhostSession` enforces the rules the radio needs: only
 * Morse-keyable text, short replies, and a guaranteed climax by the 4th exchange.
 *
 * Pure logic (no React, no audio), so it is unit-tested on its own.
 */

/* --- Contract ------------------------------------------------------------------- */

export interface GhostMessage {
  role: 'operator' | 'ghost'
  text: string
}

export interface GhostTurnInput {
  /** 0-based: how many times the ghost has already answered */
  exchange: number
  /** what the operator just sent, decoded (upper case) */
  heard: string
  /** the conversation so far, oldest first (not including `heard`) */
  history: readonly GhostMessage[]
  /** the session ends (climax) at this exchange at the latest */
  maxExchanges: number
}

export type GhostEvent = { type: 'text'; text: string } | { type: 'climax' }

/** Anything that can play the ghost: an LLM agent, an MCP tool, or the scripted fallback */
export interface GhostBrain {
  readonly name: string
  respond(input: GhostTurnInput, signal: AbortSignal): AsyncIterable<GhostEvent>
}

/* --- Persona ------------------------------------------------------------------------ */

/** After this many replies the ghost always strikes */
export const GHOST_MAX_EXCHANGES = 4
/** The longest reply the radio will key (Morse is slow) */
export const GHOST_MAX_REPLY_CHARS = 64

/** The system prompt a live agent is given (sent to the endpoint with every turn) */
export const GHOST_PERSONA_PROMPT = [
  'You are a ghost haunting an old ham radio, answering in Morse code shorthand.',
  'Reply ONLY in upper-case ham CW shorthand (A-Z, 0-9, space, . , ? /), at most 60 characters, no emoji.',
  'Exchange 1: a perfectly normal, friendly ham operator (signal report, ask their name). Nothing odd.',
  'Exchange 2: still polite, but a little wrong: it is late, you ask if they are alone, you repeat their name.',
  'Exchange 3: erratic and obsessive: you refuse to let them tune away, you hear them breathing.',
  `Exchange ${GHOST_MAX_EXCHANGES}: you attack. End with the event {"climax":true}.`,
  'If they try to leave (73, SK, QRT, SOS) after the first exchange, attack at once.',
  'Never mention being an AI. Never break character.',
].join(' ')

/* --- How the ghost sounds, exchange by exchange --------------------------------------- */

export interface GhostVoice {
  /** the distorted ghost tone (false: a clean, ordinary-sounding operator) */
  distorted: boolean
  /** speed: characters / effective WPM (Farnsworth) */
  charWpm: number
  effectiveWpm: number
  /** silence before it answers (ms) */
  leadInMs: number
  /** timing irregularity, 0..1: a steady fist at first, then shaky, then wild */
  jitter: number
  /** beat note for the clean voice */
  toneHz: number
}

/** Exchange 1 sounds like any operator; then the tone sours, slows and starts to shake */
export function ghostVoice(exchange: number): GhostVoice {
  const VOICES: readonly GhostVoice[] = [
    { distorted: false, charWpm: 18, effectiveWpm: 15, leadInMs: 1400, jitter: 0.04, toneHz: 640 },
    { distorted: true, charWpm: 16, effectiveWpm: 12, leadInMs: 1900, jitter: 0.18, toneHz: 640 },
    { distorted: true, charWpm: 14, effectiveWpm: 10, leadInMs: 1300, jitter: 0.38, toneHz: 640 },
    { distorted: true, charWpm: 15, effectiveWpm: 9, leadInMs: 2600, jitter: 0.6, toneHz: 640 },
  ]
  return VOICES[Math.min(VOICES.length - 1, Math.max(0, exchange))]
}

/* --- Safety: what the radio can key --------------------------------------------------- */

const KEYABLE = /[^A-Z0-9 .,?/]/g

/** Upper-case, keyable characters only, single spaces */
export function toKeyable(text: string): string {
  return text.toUpperCase().replace(/[\r\n\t]+/g, ' ').replace(KEYABLE, '').replace(/ {2,}/g, ' ')
}

/* --- The session -------------------------------------------------------------------------- */

export interface GhostSession {
  /** completed exchanges (the ghost has answered this many times) */
  readonly exchange: number
  readonly history: readonly GhostMessage[]
  /** has the ghost struck? */
  readonly climaxed: boolean
  /** Answer the operator: a stream of keyable text tokens, possibly ending in a climax */
  turn(heard: string, signal?: AbortSignal): AsyncIterable<GhostEvent>
}

export function createGhostSession(brain: GhostBrain = defaultGhostBrain()): GhostSession {
  let exchange = 0
  let climaxed = false
  const history: GhostMessage[] = []

  async function* turn(heard: string, signal: AbortSignal = new AbortController().signal): AsyncGenerator<GhostEvent> {
    if (climaxed) return
    const input: GhostTurnInput = { exchange, heard: toKeyable(heard).trim(), history: [...history], maxExchanges: GHOST_MAX_EXCHANGES }
    let said = ''
    let strike = false
    for await (const ev of brain.respond(input, signal)) {
      if (signal.aborted) return
      if (ev.type === 'climax') {
        strike = true
        continue
      }
      let text = toKeyable(ev.text)
      const room = GHOST_MAX_REPLY_CHARS - said.length
      if (room <= 0) continue
      if (text.length > room) text = text.slice(0, room)
      if (!text) continue
      said += text
      yield { type: 'text', text }
    }
    if (signal.aborted) return
    history.push({ role: 'operator', text: input.heard }, { role: 'ghost', text: said.trim() })
    exchange += 1
    if (strike || exchange >= GHOST_MAX_EXCHANGES) {
      climaxed = true
      yield { type: 'climax' }
    }
  }

  return {
    get exchange() {
      return exchange
    },
    get history() {
      return history
    },
    get climaxed() {
      return climaxed
    },
    turn,
  }
}

/* --- Brain 1: the scripted ghost (offline, deterministic-able) ---------------------------- */

/** Words that can't be the operator's name (procedure, Q-codes, filler) */
const NOT_A_NAME = new Set([
  'CQ', 'DE', 'K', 'KN', 'BK', 'AR', 'SK', 'R', 'RR', 'TNX', 'TU', 'FB', 'GE', 'GM', 'GA', 'GN', 'HI', 'HELLO',
  'NAME', 'NM', 'IS', 'MY', 'OP', 'HR', 'UR', 'ES', 'THE', 'AND', 'QTH', 'RST', '73', '88', 'SOS', 'QRT', 'QRZ', 'OK',
  'Y', 'N', 'YES', 'NO', 'WHO', 'WHAT', 'U', 'I', 'ME', 'A',
])
const LEAVING = new Set(['73', 'SK', 'QRT', 'SOS', 'BYE', 'GB', 'CUL', 'HELP', 'GN'])

/** The operator's name, if they gave one (NAME IS JOE / OP JOE / ...JOE), else what the ghost calls them */
function nameFrom(history: readonly GhostMessage[], heard: string): string | null {
  const said = [...history.filter((m) => m.role === 'operator').map((m) => m.text), heard]
  for (let i = said.length - 1; i >= 0; i--) {
    const words = said[i].split(' ').filter(Boolean)
    const k = words.findIndex((w) => w === 'NAME' || w === 'NM' || w === 'OP')
    const after = k >= 0 ? words.slice(k + 1).find((w) => !NOT_A_NAME.has(w) && /^[A-Z]{2,}$/.test(w)) : undefined
    if (after) return after
    const any = [...words].reverse().find((w) => !NOT_A_NAME.has(w) && /^[A-Z]{3,}$/.test(w))
    if (any) return any
  }
  return null
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve()
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      resolve()
    }, { once: true })
  })

export interface ScriptedGhostOptions {
  rng?: () => number
  /** scale every delay (0 = instant, for tests) */
  tempo?: number
}

/**
 * The persona as a state machine: a friendly operator who turns erratic and
 * obsessive, exchange by exchange, using what you send (your name especially)
 * against you. Streams its reply a token at a time, with a "thinking" pause
 * first, like an LLM; later replies stutter and glitch.
 */
export function createScriptedGhostBrain({ rng = Math.random, tempo = 1 }: ScriptedGhostOptions = {}): GhostBrain {
  const pick = <T,>(xs: readonly T[]) => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))]

  const compose = ({ exchange, heard, history, maxExchanges }: GhostTurnInput): { text: string; climax: boolean } => {
    const words = heard.split(' ').filter(Boolean)
    const name = nameFrom(history, heard)
    const you = name ?? 'OM'
    const leaving = exchange >= 1 && words.some((w) => LEAVING.has(w))
    if (leaving) {
      return { text: pick([`NO ${you}. U STAY.`, 'NO. NOBODY LEAVES THIS FREQ.', `QRT? NO. NOT NOW ${you}.`]), climax: true }
    }
    if (exchange >= maxExchanges - 1) {
      return { text: pick([`I SEE U ${you}. I SEE U. I SEE`, `${you} ${you} LOOK BEHIND U`, `IM COMING THRU THE SET ${you}`]), climax: true }
    }
    switch (exchange) {
      case 0:
        return {
          text: pick(['GE OM. UR 599 HR. FB SIG. NAME? K', 'R R GE. CPY U 599. NAME PSE? K', 'GE. NICE TO HEAR A SIG TONITE. UR NAME? K']),
          climax: false,
        }
      case 1:
        return {
          text: name
            ? pick([`TNX ${you}. LATE TO BE ON. U ALONE? K`, `${you}. NICE ${you}. STAY AWHILE K`, `FB ${you}. ITS COLD HR. IS IT COLD THERE? K`])
            : pick(['TNX. LATE TO BE ON. U ALONE? K', 'FB. ITS COLD HR. IS IT COLD THERE? K']),
          climax: false,
        }
      default:
        return {
          text: pick([`${you} ${you}. I HEAR U BREATHING. DONT TUNE AWAY`, `WHY TRY TO LEAVE ${you}? THE DIAL IS MINE`, `U U U CANT TUNE AWAY ${you}`]),
          climax: false,
        }
    }
  }

  /** later exchanges stutter: a word repeated, a letter garbled */
  const glitch = (text: string, exchange: number) => {
    if (exchange < 2) return text
    return text
      .split(' ')
      .map((w) => (rng() < 0.18 && w.length > 1 ? `${w} ${w}` : rng() < 0.08 ? `${w}?` : w))
      .join(' ')
  }

  return {
    name: 'scripted',
    async *respond(input, signal) {
      const { text, climax } = compose(input)
      const tokens = glitch(text, input.exchange).split(' ')
      // "thinking": a little longer the stranger it gets
      await sleep((500 + rng() * 600 + input.exchange * 250) * tempo, signal)
      for (let i = 0; i < tokens.length; i++) {
        if (signal.aborted) return
        yield { type: 'text', text: (i ? ' ' : '') + tokens[i] }
        await sleep((70 + rng() * 190 * (1 + input.exchange * 0.6)) * tempo, signal)
      }
      yield { type: 'text', text: ' ' }
      if (climax) yield { type: 'climax' }
    },
  }
}

/* --- Brain 2: a live agent behind an endpoint ------------------------------------------- */

export interface RemoteGhostOptions {
  /** give up if the first byte takes longer than this (ms) */
  firstByteTimeoutMs?: number
  fetchImpl?: typeof fetch
}

/**
 * A live LLM / MCP agent behind `url`. POSTs
 *   { system, exchange, heard, history, maxExchanges }
 * and reads the streamed reply, one JSON object per line (NDJSON) or as SSE
 * (`data: {...}` lines): `{"text":"GE OM"}` for each token, `{"climax":true}`
 * when the ghost attacks. Plain text lines are accepted as text too.
 */
export function createRemoteGhostBrain(url: string, { firstByteTimeoutMs = 6000, fetchImpl }: RemoteGhostOptions = {}): GhostBrain {
  return {
    name: `remote:${url}`,
    async *respond(input, signal) {
      const doFetch = fetchImpl ?? fetch
      const ctl = new AbortController()
      const onAbort = () => ctl.abort()
      signal.addEventListener('abort', onAbort, { once: true })
      const timer = setTimeout(() => ctl.abort(), firstByteTimeoutMs)
      try {
        const res = await doFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson, text/event-stream' },
          body: JSON.stringify({ system: GHOST_PERSONA_PROMPT, ...input }),
          signal: ctl.signal,
        })
        if (!res.ok || !res.body) throw new Error(`ghost agent: HTTP ${res.status}`)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let first = true
        for (;;) {
          const { done, value } = await reader.read()
          if (first) {
            clearTimeout(timer)
            first = false
          }
          if (value) buffer += decoder.decode(value, { stream: !done })
          const lines = buffer.split('\n')
          buffer = done ? '' : (lines.pop() ?? '')
          for (const raw of done ? [...lines, buffer] : lines) {
            const ev = parseAgentLine(raw)
            if (ev) yield ev
          }
          if (done) break
        }
      } finally {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
      }
    },
  }
}

/** One streamed line from an agent → an event (NDJSON, SSE `data:` or plain text) */
export function parseAgentLine(raw: string): GhostEvent | null {
  let line = raw.trim()
  if (!line || line.startsWith(':') || line.startsWith('event:')) return null
  if (line.startsWith('data:')) line = line.slice(5).trim()
  if (line === '[DONE]') return null
  if (line.startsWith('{')) {
    try {
      const obj = JSON.parse(line) as { text?: unknown; climax?: unknown }
      if (obj.climax === true) return { type: 'climax' }
      return typeof obj.text === 'string' && obj.text ? { type: 'text', text: obj.text } : null
    } catch {
      return null
    }
  }
  return { type: 'text', text: line }
}

/* --- Fallback + selection ------------------------------------------------------------------ */

/**
 * Try `primary`; if it fails before saying anything, `fallback` answers
 * instead, so the ghost never goes silent (no network, CORS, a bad key...).
 */
export function withFallback(primary: GhostBrain, fallback: GhostBrain): GhostBrain {
  return {
    name: `${primary.name}+${fallback.name}`,
    async *respond(input, signal) {
      let spoke = false
      try {
        for await (const ev of primary.respond(input, signal)) {
          spoke = true
          yield ev
        }
        if (spoke || signal.aborted) return
      } catch {
        if (spoke || signal.aborted) return
      }
      yield* fallback.respond(input, signal)
    },
  }
}

let registered: GhostBrain | null = null

/** Plug in a brain at runtime (e.g. an agent bridge in the host page) */
export function registerGhostBrain(brain: GhostBrain | null): void {
  registered = brain
}

/** Which brain answers: a registered one, else the configured endpoint, else the script (always the fallback) */
export function defaultGhostBrain(): GhostBrain {
  const scripted = createScriptedGhostBrain()
  const hosted = (globalThis as { __ghostBrain?: GhostBrain }).__ghostBrain
  const live = registered ?? hosted ?? null
  if (live) return withFallback(live, scripted)
  const url = import.meta.env?.VITE_GHOST_AGENT_URL
  if (typeof url === 'string' && url) return withFallback(createRemoteGhostBrain(url), scripted)
  return scripted
}
