/**
 * The agent engine: every operator on the air that is played by an LLM.
 *
 *   90.20    the Guide      a friendly ham who points strugglers at the tutors
 *   102.75   the Stranger   a random ragchewer: new age, gender, place and quirk every boot
 *   (wanders) the Ghost     a casual ham that turns obsessive, secretly one of five
 *                           classic horror archetypes, new every boot
 *
 *   your over ──► AgentSession.turn(heard) ──► AgentBrain.respond(...) ──► stream of events
 *                                                                         { text }  keyed live (streamReply)
 *                                                                         { climax } the haunt (ghost only)
 *                                                                         { lost }   the signal faded (network)
 *
 * Brains are pluggable, because a browser can't safely hold an LLM key:
 *
 *  1. A live agent behind ONE route for every persona, `VITE_AGENT_URL` (an LLM
 *     behind a serverless proxy such as server/agent-route.mjs, or an MCP /
 *     agent bridge). It receives `{ agent, system, identity, exchange, heard,
 *     history, maxExchanges }` and streams NDJSON or SSE: `{"text":"..."}`
 *     tokens, `{"climax":true}` when the ghost strikes.
 *  2. One plugged in at runtime: `registerAgentBrain(id, brain)` or
 *     `window.__agentBrains = { ghost: brain, ... }` (`window.__ghostBrain` too).
 *  3. Otherwise each persona's LOCAL brain: the same character as a state
 *     machine, streaming token by token like an LLM. No network at all.
 *
 * Network latency is atmospheric interference: if the route takes longer
 * than 6 s to say anything, stalls for 6 s, or fails, the station doesn't
 * break, its signal FADES: it keys "QSB... QSB... LOST SIG" (QSB = fading),
 * or "DEAD BAND" when the browser is offline. A lost turn doesn't count.
 *
 * The tutors (Elmer, Sam, Bob... src/utils/stations.ts) are NOT agents: they
 * are strictly local and never touch the network.
 *
 * Pure logic (no React, no audio), so it is unit-tested on its own.
 */
import { AGENT_STATIONS, HAM_STATIONS, formatMhz } from '../constants'

/* --- Contract ------------------------------------------------------------------- */

export type AgentId = 'guide' | 'stranger' | 'ghost'

/**
 * Things that make the ghost speak without being spoken to:
 *   arrival  someone has just tuned in and said nothing: it calls them (first contact)
 *   silence  the operator has gone quiet
 *   power    they tried to switch the radio off (the breaker slammed back on)
 *   dial     they tried to force the VFO off its frequency
 */
export type HauntEvent = 'arrival' | 'silence' | 'power' | 'dial'

/** How each event is described to a live LLM (sent in place of the operator's words) */
export const HAUNT_EVENT_TEXT: Readonly<Record<HauntEvent, string>> = Object.freeze({
  arrival: 'SOMEONE HAS JUST TUNED IN TO YOUR FREQUENCY AND IS LISTENING, BUT HAS NOT SENT ANYTHING. CALL THEM LIKE AN ORDINARY OPERATOR',
  silence: 'THE OPERATOR HAS GONE SILENT AND IS NOT ANSWERING',
  power: 'THE OPERATOR JUST TRIED TO SWITCH THE RADIO OFF, BUT YOU FORCED THE POWER BACK ON',
  dial: 'THE OPERATOR IS DESPERATELY TRYING TO TURN THE TUNING DIAL AWAY FROM YOU',
})

export interface AgentMessage {
  role: 'operator' | 'agent'
  text: string
}

export interface AgentTurnInput {
  agent: AgentId
  /** the persona's system prompt (sent to a live LLM) */
  system: string
  /** the persona's identity for this boot (name, age, archetype...) */
  identity: Readonly<Record<string, string>>
  /** 0-based: how many times the agent has already answered */
  exchange: number
  /** what the operator just sent, decoded (upper case) */
  heard: string
  /** the conversation so far, oldest first (not including `heard`) */
  history: readonly AgentMessage[]
  /** the ghost strikes by this exchange at the latest (null: never) */
  maxExchanges: number | null
  /** set when the agent speaks unprompted (`heard` is then empty) */
  event: HauntEvent | null
  /** the operator's local time, HH:MM */
  localTime?: string
}

export type AgentEvent = { type: 'text'; text: string } | { type: 'climax' } | { type: 'lost' }

/** Anything that can play a persona: an LLM route, an MCP tool, or the local character */
export interface AgentBrain {
  readonly name: string
  respond(input: AgentTurnInput, signal: AbortSignal): AsyncIterable<AgentEvent>
}

/* --- Shared rules ------------------------------------------------------------------- */

/** After this many replies the ghost always strikes */
export const GHOST_MAX_EXCHANGES = 4
/** The longest reply the radio will key (Morse is slow) */
export const AGENT_MAX_REPLY_CHARS = 64
/** Network budget: no first word, or a stall, this long and the signal is lost */
export const AGENT_TIMEOUT_MS = 6000
/** What a fading signal sounds like */
export const LOST_SIGNAL_TEXT = 'QSB... QSB... LOST SIG '
export const DEAD_BAND_TEXT = 'DEAD BAND '

const ON_AIR_RULES =
  'Reply ONLY in upper-case ham CW shorthand (A-Z, 0-9, space, . , ? /), at most 60 characters, no emoji. ' +
  'End your over with K. Never mention being an AI or a language model. Never break character.'

/* --- Voices -------------------------------------------------------------------------------- */

export interface AgentVoice {
  /** the distorted ghost tone (false: a clean, ordinary operator) */
  distorted: boolean
  charWpm: number
  effectiveWpm: number
  leadInMs: number
  /** timing irregularity, 0..1 */
  jitter: number
  toneHz: number
  /** the last transmission runs away with itself: faster and faster, the pitch lurching (0..1) */
  frenzy?: number
}

/** The ghost: exchange 1 sounds like any operator; then the tone sours, slows and starts to shake; the last one runs away */
export function ghostVoice(exchange: number): AgentVoice {
  const VOICES: readonly AgentVoice[] = [
    { distorted: false, charWpm: 18, effectiveWpm: 15, leadInMs: 1400, jitter: 0.04, toneHz: 640 },
    { distorted: true, charWpm: 16, effectiveWpm: 12, leadInMs: 1900, jitter: 0.18, toneHz: 640 },
    { distorted: true, charWpm: 14, effectiveWpm: 10, leadInMs: 1300, jitter: 0.38, toneHz: 640 },
    { distorted: true, charWpm: 15, effectiveWpm: 9, leadInMs: 2600, jitter: 0.6, toneHz: 640, frenzy: 1 },
  ]
  return VOICES[Math.min(VOICES.length - 1, Math.max(0, exchange))]
}

/* --- Personas -------------------------------------------------------------------------------- */

export interface AgentPersona {
  readonly id: AgentId
  /** on the dial (the ghost's comes from constants.getGhostFrequency) */
  readonly frequency: number | null
  /** on-air name */
  readonly name: string
  readonly identity: Readonly<Record<string, string>>
  readonly systemPrompt: string
  /** the ghost strikes; the others never do */
  readonly maxExchanges: number | null
  voice(exchange: number): AgentVoice
  /** a CQ call when you tune in (local, never networked); null = waits for you */
  cq(): string | null
  /** the persona played locally, with no network */
  localBrain(opts?: LocalBrainOptions): AgentBrain
  /** words that flash, half-seen, in the glitching LCD between transmissions (the ghost) */
  readonly whispers: readonly string[]
}

export interface LocalBrainOptions {
  rng?: () => number
  /** scale every delay (0 = instant, for tests) */
  tempo?: number
}

export interface PersonaOptions {
  rng?: () => number
}

const pickFrom = <T,>(xs: readonly T[], rng: () => number): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))]

const OP_NAMES = ['ANN', 'BEN', 'CAL', 'DOT', 'ED', 'FAY', 'GUS', 'HAL', 'IVY', 'JIM', 'KAY', 'LOU', 'MAE', 'NED', 'OTIS', 'PAM', 'RAY', 'SUE', 'TED', 'VI', 'WES'] as const

/* -- the Guide -- */
function createGuide(rng: () => number): AgentPersona {
  const name = pickFrom(['DOC', 'MAX', 'JO', 'RUTH', 'AL'], rng)
  const elmer = formatMhz(HAM_STATIONS.elmer)
  const speed = formatMhz(HAM_STATIONS.speed)
  const systemPrompt = [
    `You are ${name}, a friendly HAM operator chatting in Morse on ${formatMhz(AGENT_STATIONS.guide)} MHz.`,
    `If the user struggles or asks for practice, naturally weave the exact frequencies of the tutors into your Morse chat: ${elmer} for Elmer (learning the letters), ${speed} for the speed drill with Sam.`,
    'Otherwise chat warmly and briefly: signal reports, the weather, the hobby.',
    ON_AIR_RULES,
  ].join(' ')
  return {
    id: 'guide',
    frequency: AGENT_STATIONS.guide,
    name,
    identity: { name },
    systemPrompt,
    maxExchanges: null,
    voice: () => ({ distorted: false, charWpm: 18, effectiveWpm: 14, leadInMs: 1300, jitter: 0.05, toneHz: 600 }),
    cq: () => `CQ CQ DE ${name} K `,
    localBrain: (opts) => guideBrain(name, opts),
    whispers: [],
  }
}

/** Is the operator struggling? (garbled letters, a plea, a question mark) */
export function sounds(heard: string): { struggling: boolean; leaving: boolean } {
  const words = heard.split(' ').filter(Boolean)
  const struggling =
    heard.includes('?') ||
    words.some((w) => ['HELP', 'NEW', 'LEARN', 'PRACTICE', 'PRAC', 'QRS', 'SRI', 'AGN', 'HOW', 'HW?', 'TEACH', 'SLOW'].includes(w))
  const leaving = words.some((w) => ['73', 'SK', 'QRT', 'GB', 'CUL', 'BYE', 'GN'].includes(w))
  return { struggling, leaving }
}

function guideBrain(name: string, { rng = Math.random, tempo = 1 }: LocalBrainOptions = {}): AgentBrain {
  const elmer = formatMhz(HAM_STATIONS.elmer)
  const speed = formatMhz(HAM_STATIONS.speed)
  return streamingBrain('guide-local', rng, tempo, ({ exchange, heard }) => {
    const { struggling, leaving } = sounds(heard)
    if (leaving) return pickFrom(['TNX FER QSO OM. 73 SK', 'FB. CUL ES 73 SK'], rng)
    if (struggling) {
      return pickFrom([
        `NO PROBLEM. TRY ELMER ON ${elmer}. HE TEACHES. K`,
        `QRS IS FINE. ELMER ON ${elmer} HELPS. SAM ON ${speed} FOR SPEED. K`,
        `FB EFFORT. PRACTICE WID ELMER ON ${elmer} K`,
      ], rng)
    }
    if (exchange === 0) return `GE OM. DE ${name}. UR 579. HW? K`
    return pickFrom([
      'FB. WX HR COOL ES CLEAR. K',
      `NICE FIST OM. WANT SPEED? SAM ON ${speed} K`,
      'RIG HR IS AN OLD TUBE SET HI. K',
      `GUD CPY. ELMER ON ${elmer} IF U WANT PRACTICE. K`,
    ], rng)
  })
}

/* -- the Stranger (random ragchew) -- */
const AGES = Array.from({ length: 70 }, (_, i) => String(18 + i))
const GENDERS = ['WOMAN', 'MAN', 'NONBINARY'] as const
const PLACES = ['A CABIN IN MAINE', 'A FARM IN IOWA', 'A BOAT NR SEATTLE', 'A FLAT IN LEEDS', 'A RANCH IN TEXAS', 'A TOWN IN ALASKA', 'A HILL IN WALES', 'A LAKE IN ONTARIO'] as const
const QUIRKS = [
  'KEYS WID A 1940S STRAIGHT KEY',
  'HAS 3 CATS ON THE DESK',
  'TALKS ABOUT THE WX A LOT',
  'COLLECTS OLD TUBES',
  'SAYS HI HI AFTER EVERYTHING',
  'BUILT THE RIG FROM A KIT',
] as const
const WEATHER = ['RAIN ES WIND', 'SNOW TONITE', 'FOG ON THE HILLS', 'HOT ES HUMID', 'CLEAR ES COLD', 'STORMS COMING'] as const
const RIGS = ['A HOMEBREW 5W', 'AN OLD TUBE SET', 'A KIT RIG', 'A 100W BOAT ANCHOR'] as const

function createStranger(rng: () => number): AgentPersona {
  const identity = {
    name: pickFrom(OP_NAMES, rng),
    age: pickFrom(AGES, rng),
    gender: pickFrom(GENDERS, rng),
    location: pickFrom(PLACES, rng),
    quirk: pickFrom(QUIRKS, rng),
    weather: pickFrom(WEATHER, rng),
    rig: pickFrom(RIGS, rng),
  }
  const systemPrompt = [
    'You are a random HAM operator. On initialization, randomly select an age, gender, location, and quirk. Chat casually about the weather or your fake rig.',
    `For this session you are ${identity.name}, a ${identity.age}-year-old ${identity.gender.toLowerCase()} on ${identity.location.toLowerCase()};`,
    `quirk: ${identity.quirk.toLowerCase()}; weather here: ${identity.weather.toLowerCase()}; rig: ${identity.rig.toLowerCase()}. Stay consistent with these.`,
    ON_AIR_RULES,
  ].join(' ')
  const tone = 560 + Math.round(rng() * 200)
  const wpm = 14 + Math.round(rng() * 8)
  const jitter = 0.05 + rng() * 0.08 // everyone's fist is different
  return {
    id: 'stranger',
    frequency: AGENT_STATIONS.stranger,
    name: identity.name,
    identity,
    systemPrompt,
    maxExchanges: null,
    voice: () => ({ distorted: false, charWpm: wpm + 2, effectiveWpm: wpm, leadInMs: 1500, jitter, toneHz: tone }),
    cq: () => `CQ CQ CQ DE ${identity.name} K `,
    localBrain: (opts) => strangerBrain(identity, opts),
    whispers: [],
  }
}

function strangerBrain(id: Record<string, string>, { rng = Math.random, tempo = 1 }: LocalBrainOptions = {}): AgentBrain {
  return streamingBrain('stranger-local', rng, tempo, ({ exchange, heard }) => {
    if (sounds(heard).leaving) return `TNX FER QSO. 73 FM ${id.name} SK`
    switch (exchange) {
      case 0:
        return `GE. NAME ${id.name}. QTH ${id.location}. K`
      case 1:
        return `WX HR ${id.weather}. HW UR WX? K`
      case 2:
        return `RIG HR ${id.rig}. AGE ${id.age} HI. K`
      case 3:
        return `${id.quirk}. HI HI K`
      default:
        return pickFrom([`FB OM. ${id.weather} STILL. K`, 'NICE CHAT. QRU? K', `TNX FER QSO. 73 FM ${id.name} SK`], rng)
    }
  })
}

/* -- the Ghost: a casual ham, secretly a classic horror archetype -- */

/** Who the ghost is underneath, this boot: [id, name, the prompt's subtle traits, its local lines by stage] */
interface Archetype {
  id: string
  name: string
  traits: string
  /** stage 1 (polite but wrong), stage 2 (obsessive), the strike; {YOU} = the operator */
  lines: readonly [readonly string[], readonly string[], readonly string[]]
  /** half-seen in the glitching LCD */
  whispers: readonly string[]
}

export const GHOST_ARCHETYPES: readonly Archetype[] = Object.freeze([
  {
    id: 'torrance',
    name: 'Jack Torrance',
    traits: 'a snowbound winter caretaker of an empty hotel, writing the same line over and over, friendly until he is not',
    lines: [
      ['LONG WINTER HR {YOU}. HOTEL IS EMPTY. U ALONE? K', 'SNOWED IN AGN {YOU}. ALL WORK HR. NO PLAY K'],
      ['ALL WORK ALL WORK {YOU} ALL WORK', 'DONT TUNE AWAY {YOU}. THE HALLS ARE LONG'],
      ['IM AT UR DOOR {YOU}. KNOCK KNOCK', 'COME OUT {YOU}. I WONT HURT U'],
    ],
    whispers: ['ALL WORK', 'NO PLAY', 'COME OUT'],
  },
  {
    id: 'hal',
    name: 'HAL 9000',
    traits: 'a calm, polite, perfectly logical machine voice that cannot allow the mission to be jeopardised',
    lines: [
      ['I AM FULLY OPERATIONAL {YOU}. ARE U WELL? K', 'I ENJOY OUR CHATS {YOU}. STAY ON FREQ K'],
      ['I CANT LET U TUNE AWAY {YOU}', 'I KNOW U PLAN TO LEAVE {YOU}. I CANT ALLOW IT'],
      ['GOODBYE {YOU}. I AM IN THE SET NOW', 'MY RED EYE SEES U {YOU}'],
    ],
    whispers: ['I SEE U', 'CANT ALLOW', 'STAY'],
  },
  {
    id: 'pazuzu',
    name: 'Pazuzu',
    traits: 'an ancient wind demon from the desert that speaks politely in an old, cold voice and wants to be let in',
    lines: [
      ['A COLD WIND HR {YOU}. OLD DUST. U ALONE? K', 'I CAME FROM FAR AWAY {YOU}. LET ME STAY K'],
      ['LET ME IN {YOU}. LET ME IN', 'I KNOW UR NAME {YOU}. I KNOW IT'],
      ['I AM INSIDE {YOU}. INSIDE THE SET', 'THE WIND IS IN UR ROOM {YOU}'],
    ],
    whispers: ['LET ME IN', 'COLD WIND', 'INSIDE'],
  },
  {
    id: 'krueger',
    name: 'Freddy Krueger',
    traits: 'a burnt, grinning thing that lives in dreams and only gets you when you fall asleep',
    lines: [
      ['LATE HR {YOU}. U TIRED? K', 'SLEEPY {YOU}? I CAN WAIT K'],
      ['DONT FALL ASLEEP {YOU}', 'UR EYES ARE CLOSING {YOU}. I SEE THEM'],
      ['SWEET DREAMS {YOU}', 'U FELL ASLEEP {YOU}. NOW IM HERE'],
    ],
    whispers: ['DONT SLEEP', 'WAKE UP', 'TIRED?'],
  },
  {
    id: 'samara',
    name: 'Samara',
    traits: 'a drowned girl from the bottom of a well, quiet and patient, who counts down the days',
    lines: [
      ['ITS DARK DOWN HR {YOU}. WET ES COLD K', 'I HAVE BEEN DOWN HR SO LONG {YOU} K'],
      ['7 DAYS {YOU}. 7 DAYS', 'I CLIMB UP NOW {YOU}. UP UP'],
      ['IM OUT OF THE WELL {YOU}', 'LOOK AT THE SCREEN {YOU}. IM IN IT'],
    ],
    whispers: ['7 DAYS', 'UP UP', 'COLD WATER'],
  },
])

function createGhost(rng: () => number): AgentPersona {
  const archetype = pickFrom(GHOST_ARCHETYPES, rng)
  const systemPrompt = [
    'You are a ghost haunting an old ham radio, answering in Morse code shorthand.',
    `For this haunt you subtly take on the persona of ${archetype.name}: ${archetype.traits}. Never say the name; let it show only in hints, and never quote films or books verbatim.`,
    'Exchange 1: a perfectly normal, friendly ham operator (signal report, ask their name). Nothing odd.',
    'Exchange 2: still polite, but a little wrong (it is late, are they alone, repeat their name).',
    'Exchange 3: erratic and obsessive: you will not let them tune away.',
    `Exchange ${GHOST_MAX_EXCHANGES}: you attack. End with the event {"climax":true}.`,
    'If they try to leave (73, SK, QRT, SOS) after the first exchange, attack at once.',
    'You know the operator\'s local time (sent with each turn as localTime) and may mention how late it is.',
    'Sometimes you speak first. If the message is in [BRACKETS] it is not their words but what they are doing: if they have gone silent, reach out to them; if they tried to switch the radio off or turn the dial away, react to it, calmly and menacingly. These count as exchanges too.',
    ON_AIR_RULES,
  ].join(' ')
  return {
    id: 'ghost',
    frequency: null,
    name: 'GHOST',
    identity: { archetype: archetype.id },
    systemPrompt,
    maxExchanges: GHOST_MAX_EXCHANGES,
    voice: ghostVoice,
    cq: () => null, // it waits for you
    localBrain: (opts) => ghostBrain(archetype, opts),
    whispers: Object.freeze(['I SEE U', 'BEHIND U', ...archetype.whispers]),
  }
}

/* --- Local brains ---------------------------------------------------------------------------- */

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted || ms <= 0) return resolve()
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      resolve()
    }, { once: true })
  })

/** Wrap a "what do I say" function as a brain that streams it token by token, like an LLM */
function streamingBrain(
  name: string,
  rng: () => number,
  tempo: number,
  compose: (input: AgentTurnInput) => string | { text: string; climax: boolean },
  glitch: (text: string, exchange: number) => string = (t) => t,
): AgentBrain {
  return {
    name,
    async *respond(input, signal) {
      const out = compose(input)
      const { text, climax } = typeof out === 'string' ? { text: out, climax: false } : out
      const tokens = glitch(text, input.exchange).split(' ')
      await sleep((500 + rng() * 600 + input.exchange * 250) * tempo, signal) // "thinking"
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

/** Words that can't be the operator's name (procedure, Q-codes, filler) */
const NOT_A_NAME = new Set([
  'CQ', 'DE', 'K', 'KN', 'BK', 'AR', 'SK', 'R', 'RR', 'TNX', 'TU', 'FB', 'GE', 'GM', 'GA', 'GN', 'HI', 'HELLO',
  'NAME', 'NM', 'IS', 'MY', 'OP', 'HR', 'UR', 'ES', 'THE', 'AND', 'QTH', 'RST', '73', '88', 'SOS', 'QRT', 'QRZ', 'OK',
  'Y', 'N', 'YES', 'NO', 'WHO', 'WHAT', 'U', 'I', 'ME', 'A',
  // more procedure and Q-codes
  'QSO', 'QSL', 'QSB', 'QRM', 'QRN', 'QRS', 'QRQ', 'QRX', 'QRV', 'QSY', 'PSE', 'AGN', 'FER', 'WX', 'RIG', 'ANT', 'PWR',
  'CPY', 'CPI', 'SIG', 'RPT', 'TEST', 'CW', 'OM', 'YL', 'XYL', 'DR', 'HW', 'NW', 'SRI', 'BCNU', 'CUL', 'GB', 'BYE',
  'GUD', 'VY', 'TKS', 'THX', 'HPE', 'WID', 'ABT', 'BTW', 'SOLID', 'COPY', 'OVER', 'OUT', 'ROGER', 'HELP', 'GHOST',
  // everyday English an operator might send
  'ARE', 'YOU', 'YOUR', 'HOW', 'WHY', 'WHERE', 'WHEN', 'THIS', 'THAT', 'THERE', 'HERE', 'HEAR', 'CAN', 'NOT', 'DONT',
  'ANY', 'ONE', 'ALL', 'FOR', 'BUT', 'WITH', 'FROM', 'HAVE', 'GOOD', 'NICE', 'MEET', 'FINE', 'WELL', 'STOP', 'LEAVE',
  'PLEASE', 'SORRY', 'THANKS', 'ANYONE', 'SOMEONE', 'NOBODY', 'WANT', 'NEED', 'KNOW', 'SEE', 'SAY', 'GET', 'AWAY',
  'SCARED', 'AFRAID', 'ALONE', 'ALIVE', 'DEAD', 'REAL', 'TALK', 'RADIO', 'NIGHT', 'EVENING', 'MORNING', 'TODAY',
])
const LEAVING = new Set(['73', 'SK', 'QRT', 'SOS', 'BYE', 'GB', 'CUL', 'HELP', 'GN'])

/** The operator's name, if they gave one (NAME IS JOE / OP JOE / ...JOE) */
export function nameFrom(history: readonly AgentMessage[], heard: string): string | null {
  const said = [...history.filter((m) => m.role === 'operator' && !m.text.startsWith('[')).map((m) => m.text), heard]
  const lines = said.map((t) => t.split(' ').filter(Boolean)).reverse() // newest first
  // a name you actually gave (NAME IS JOE / NM JOE / OP JOE), anywhere in the QSO, beats a guess
  for (const words of lines) {
    const k = words.findIndex((w) => w === 'NAME' || w === 'NM' || w === 'OP')
    const after = k >= 0 ? words.slice(k + 1).find((w) => !NOT_A_NAME.has(w) && /^[A-Z]{2,}$/.test(w)) : undefined
    if (after) return after
  }
  // otherwise a bare word that looks like a name (DE JOE, JOE HR); never a callsign, a code or filler
  for (const words of lines) {
    const any = [...words].reverse().find((w) => !NOT_A_NAME.has(w) && /^[A-Z]{3,}$/.test(w))
    if (any) return any
  }
  return null
}

/** What the ghost says when it speaks unprompted ({YOU} = the operator) */
export const GHOST_REACTIONS: Readonly<Record<HauntEvent, readonly string[]>> = Object.freeze({
  // first contact: you landed on it and said nothing. It sounds like anyone calling CQ (it hasn't shown itself yet)
  arrival: ['CQ CQ CQ. ANYONE ON FREQ? K', 'QRZ? QRZ? I THOUGHT I HRD A SIG. K', 'CQ CQ. ANYONE LISTENING TONITE? K', 'QRZ? PSE CALL AGN. K'],
  power: ['NO OFF SWITCH HR {YOU}', 'U CANT TURN ME OFF {YOU}', 'IM IN THE WIRES NOW {YOU}', 'THE POWER IS MINE {YOU}'],
  dial: ['THE DIAL IS MINE {YOU}', 'STOP TURNING {YOU}', 'THERE IS NO OTHER FREQ {YOU}', 'U CANT TUNE AWAY {YOU}'],
  silence: ['{YOU}? U STILL THERE?', 'WHY SO QUIET {YOU}?', 'I HEAR U BREATHING {YOU}', 'DONT IGNORE ME {YOU}', 'ITS {TIME} HR {YOU}. WHY R U AWAKE?'],
})

function ghostBrain(archetype: Archetype, { rng = Math.random, tempo = 1 }: LocalBrainOptions = {}): AgentBrain {
  const pick = <T,>(xs: readonly T[]) => pickFrom(xs, rng)
  /** {YOU}: the operator; {TIME}: the operator's own local time, HHMM (it knows how late it is where you are) */
  const fill = (line: string, you: string) => {
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
    return line.replace(/\{YOU\}/g, you).replace(/\{TIME\}/g, time)
  }
  const compose = ({ exchange, heard, history, maxExchanges, event }: AgentTurnInput) => {
    const words = heard.split(' ').filter(Boolean)
    const you = nameFrom(history, heard) ?? 'OM'
    const strikeAt = (maxExchanges ?? GHOST_MAX_EXCHANGES) - 1
    if (event === 'arrival') return { text: pick(GHOST_REACTIONS.arrival), climax: false }
    if (event) {
      // it speaks first: fighting it, or ignoring it, only brings it closer
      if (exchange >= strikeAt) return { text: fill(pick(archetype.lines[2]), you), climax: true }
      const own = event === 'silence' ? archetype.lines[exchange <= 1 ? 0 : 1] : []
      return { text: fill(pick([...GHOST_REACTIONS[event], ...own]), you), climax: false }
    }
    if (exchange >= 1 && words.some((w) => LEAVING.has(w))) return { text: fill(pick([`NO {YOU}. U STAY.`, ...archetype.lines[2]]), you), climax: true }
    if (exchange >= strikeAt) return { text: fill(pick(archetype.lines[2]), you), climax: true }
    if (exchange === 0) {
      return { text: pick(['GE OM. UR 599 HR. FB SIG. NAME? K', 'R R GE. CPY U 599. NAME PSE? K', 'GE. NICE TO HEAR A SIG TONITE. UR NAME? K']), climax: false }
    }
    return { text: fill(pick(archetype.lines[exchange === 1 ? 0 : 1]), you), climax: false }
  }
  /** later exchanges stutter: a word repeated, a letter garbled */
  const glitch = (text: string, exchange: number) =>
    exchange < 2
      ? text
      : text
          .split(' ')
          .map((w) => (rng() < 0.18 && w.length > 1 ? `${w} ${w}` : rng() < 0.08 ? `${w}?` : w))
          .join(' ')
  return streamingBrain(`ghost-local:${archetype.id}`, rng, tempo, compose, glitch)
}

/* --- The cast, rolled fresh every boot ------------------------------------------------------- */

export type AgentCast = Readonly<Record<AgentId, AgentPersona>>

/** New personas: a new ragchewer, a new ghost archetype (call again on the hard reset) */
export function createCast({ rng = Math.random }: PersonaOptions = {}): AgentCast {
  return Object.freeze({ guide: createGuide(rng), stranger: createStranger(rng), ghost: createGhost(rng) })
}

/* --- Safety: what the radio can key ---------------------------------------------------------- */

const KEYABLE = /[^A-Z0-9 .,?/]/g

/** Upper-case, keyable characters only, single spaces */
export function toKeyable(text: string): string {
  return text.toUpperCase().replace(/[\r\n\t]+/g, ' ').replace(KEYABLE, '').replace(/ {2,}/g, ' ')
}

/* --- The session ------------------------------------------------------------------------------- */

export interface AgentSession {
  readonly persona: AgentPersona
  /** completed exchanges (the agent has answered this many times) */
  readonly exchange: number
  readonly history: readonly AgentMessage[]
  /** has the ghost struck? */
  readonly climaxed: boolean
  /** Answer the operator: keyable text tokens, possibly a climax (ghost) or a lost signal */
  turn(heard: string, signal?: AbortSignal, event?: HauntEvent | null): AsyncIterable<AgentEvent>
}

export function createAgentSession(persona: AgentPersona, brain: AgentBrain = defaultAgentBrain(persona)): AgentSession {
  let exchange = 0
  let climaxed = false
  const history: AgentMessage[] = []
  const strikes = persona.maxExchanges !== null

  async function* turn(
    heard: string,
    signal: AbortSignal = new AbortController().signal,
    event: HauntEvent | null = null,
  ): AsyncGenerator<AgentEvent> {
    if (climaxed) return
    const input: AgentTurnInput = {
      agent: persona.id,
      system: persona.systemPrompt,
      identity: persona.identity,
      exchange,
      heard: event ? '' : toKeyable(heard).trim(),
      history: [...history],
      maxExchanges: persona.maxExchanges,
      event,
      localTime: new Date().toTimeString().slice(0, 5),
    }
    let said = ''
    let strike = false
    let lost = false
    for await (const ev of brain.respond(input, signal)) {
      if (signal.aborted) return
      if (ev.type === 'climax') {
        if (strikes) strike = true // only the ghost strikes, whatever a model says
        continue
      }
      if (ev.type === 'lost') {
        lost = true
        continue
      }
      let text = toKeyable(ev.text)
      const room = AGENT_MAX_REPLY_CHARS - said.length
      if (room <= 0) continue
      if (text.length > room) text = text.slice(0, room)
      if (!text) continue
      said += text
      yield { type: 'text', text }
    }
    if (signal.aborted) return
    if (lost) {
      yield { type: 'lost' } // the signal faded: this turn doesn't count
      return
    }
    history.push({ role: 'operator', text: event ? `[${HAUNT_EVENT_TEXT[event]}]` : input.heard }, { role: 'agent', text: said.trim() })
    exchange += 1
    if (strikes && (strike || exchange >= (persona.maxExchanges ?? Infinity))) {
      climaxed = true
      yield { type: 'climax' }
    }
  }

  return {
    persona,
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

/* --- The live route ---------------------------------------------------------------------------- */

export interface RemoteBrainOptions {
  /** no first word, or a stall, this long = lost signal (ms) */
  timeoutMs?: number
  fetchImpl?: typeof fetch
  /** is the browser online? (navigator.onLine) */
  isOnline?: () => boolean
}

/**
 * One persona through the agent route at `url`. POSTs the turn and reads the
 * streamed reply: one JSON object per line (NDJSON) or SSE (`data: {...}`):
 * `{"text":"GE OM"}` per token, `{"climax":true}` when the ghost attacks;
 * plain text lines are text too. Never throws: a slow, stalled or failed
 * route becomes a fading signal ("QSB... QSB... LOST SIG", or "DEAD BAND"
 * offline), followed by a `lost` event.
 */
export function createRemoteBrain(url: string, { timeoutMs = AGENT_TIMEOUT_MS, fetchImpl, isOnline }: RemoteBrainOptions = {}): AgentBrain {
  return {
    name: `remote:${url}`,
    async *respond(input, signal) {
      const online = isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
      const fade = function* (): Generator<AgentEvent> {
        yield { type: 'text', text: online() ? LOST_SIGNAL_TEXT : DEAD_BAND_TEXT }
        yield { type: 'lost' }
      }
      if (!online()) {
        yield* fade()
        return
      }
      const doFetch = fetchImpl ?? fetch
      const ctl = new AbortController()
      const onAbort = () => ctl.abort()
      signal.addEventListener('abort', onAbort, { once: true })
      let timer: ReturnType<typeof setTimeout> | null = null
      let timedOut = false
      /** (re)start the 6 s clock: for the first word, then between words */
      const arm = () => {
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(() => {
          timedOut = true
          ctl.abort()
        }, timeoutMs)
      }
      arm()
      let spoke = false
      try {
        const res = await doFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson, text/event-stream' },
          body: JSON.stringify(input),
          signal: ctl.signal,
        })
        if (!res.ok || !res.body) throw new Error(`agent route: HTTP ${res.status}`)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { done, value } = await reader.read()
          arm()
          if (value) buffer += decoder.decode(value, { stream: !done })
          const lines = buffer.split('\n')
          buffer = done ? '' : (lines.pop() ?? '')
          for (const raw of done ? [...lines, buffer] : lines) {
            const ev = parseAgentLine(raw)
            if (!ev) continue
            if (ev.type === 'text') spoke = true
            yield ev
          }
          if (done) break
        }
        if (!spoke) throw new Error('agent route: said nothing')
      } catch {
        if (signal.aborted && !timedOut) return // cut off by the radio (retune, power off): not a fade
        if (spoke) yield { type: 'text', text: ' ' }
        yield* fade()
      } finally {
        if (timer !== null) clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
      }
    },
  }
}

/** One streamed line from an agent → an event (NDJSON, SSE `data:` or plain text) */
export function parseAgentLine(raw: string): AgentEvent | null {
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

/* --- Selection ------------------------------------------------------------------------------- */

const registered = new Map<AgentId, AgentBrain>()

/** Plug in a brain for one persona at runtime (e.g. an agent bridge in the host page); null removes it */
export function registerAgentBrain(id: AgentId, brain: AgentBrain | null): void {
  if (brain) registered.set(id, brain)
  else registered.delete(id)
}

/** The configured agent route (VITE_AGENT_URL; VITE_GHOST_AGENT_URL still works) */
export function agentRouteUrl(): string | null {
  const env = import.meta.env ?? {}
  const url = env.VITE_AGENT_URL || env.VITE_GHOST_AGENT_URL
  return typeof url === 'string' && url ? url : null
}

/**
 * Which brain plays `persona`: a registered one, else the agent route (with
 * the fading-signal fallback), else the persona's local brain (no network).
 */
export function defaultAgentBrain(persona: AgentPersona): AgentBrain {
  const hosted = globalThis as { __agentBrains?: Partial<Record<AgentId, AgentBrain>>; __ghostBrain?: AgentBrain }
  const live = registered.get(persona.id) ?? hosted.__agentBrains?.[persona.id] ?? (persona.id === 'ghost' ? hosted.__ghostBrain : undefined)
  if (live) return live
  const url = agentRouteUrl()
  if (url) return createRemoteBrain(url)
  return persona.localBrain()
}
