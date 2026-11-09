/**
 * The operators on the ham band (100.00-102.00 MHz), from beginner to pro.
 *
 *   100.20  CODE PRACTICE  a slow bulletin to copy by ear (Farnsworth 18/8 WPM)
 *   100.60  ELMER          a mentor: one new character at a time, then words
 *   101.00  PRACTICE       the original tutor: send HI, then SOS
 *   101.40  BOB            a real-feeling QSO: RST, name, QTH, 73
 *   101.80  SPEED DRILL    5-character groups that speed up as you copy them
 *
 * Everything here is plain logic with no React and no audio, so it can be
 * tested on its own: a station gets told when you tune in, when you finish a
 * word and how long the band has been quiet, and answers with what it would
 * key back (text + timing), or null to stay quiet. The decoder provider
 * (useMorseDecoder.ts) does the keying.
 *
 * Every name and place is fictional and nobody uses a callsign: real
 * callsigns belong to real people.
 */
import { CHAR_TO_MORSE } from './morseDictionary'
import { HAM_STATIONS } from '../constants'
import type { HamStationId } from '../constants'

/* --- Timing ------------------------------------------------------------------ */

/**
 * How another station keys. The simulator plays each element, waits
 * `elementGapMs`, and after a character's last element waits `charGapMs`
 * *more*; a space waits `wordGapMs` on top of that. So the real silences are:
 *   between elements    elementGapMs
 *   between characters  elementGapMs + charGapMs
 *   between words       elementGapMs + charGapMs + wordGapMs
 */
export interface ReplyTiming {
  /** silence before the other station starts sending */
  leadInMs: number
  ditMs: number
  dahMs: number
  /** silence between the elements of one character */
  elementGapMs: number
  /** extra silence after each character */
  charGapMs: number
  /** extra silence for a word space */
  wordGapMs: number
  /** the station's beat note; omitted = the 700 Hz sidetone */
  toneHz?: number
}

/** The 101.00 practice station: brisk, clean 700 Hz (60 ms dits) */
export const REPLY_TIMING: Readonly<ReplyTiming> = Object.freeze({
  leadInMs: 700,
  ditMs: 60,
  dahMs: 180,
  elementGapMs: 60,
  charGapMs: 150,
  wordGapMs: 420,
})

/** The thing on 104.40: agonisingly slow, distorted */
export const GHOST_TIMING: Readonly<ReplyTiming> = Object.freeze({
  leadInMs: 1600,
  ditMs: 120,
  dahMs: 360,
  elementGapMs: 120,
  charGapMs: 500,
  wordGapMs: 1000,
})

/**
 * Real Morse timing for a speed in words per minute (PARIS: dit = 1200 / WPM ms).
 *
 * With `effectiveWpm` below `charWpm` it is Farnsworth timing, the ARRL
 * method: characters keep their crisp `charWpm` shape (so you learn the
 * *sound* of each letter, not a count of dits) and the extra time goes into
 * the gaps. Total spacing delay t_a = (60c - 37.2s) / (s*c) seconds; a
 * character gap is 3*t_a/19 and a word gap 7*t_a/19.
 */
export function timingForWpm(charWpm: number, effectiveWpm = charWpm, leadInMs = 700, toneHz?: number): ReplyTiming {
  const c = Math.max(1, charWpm)
  const s = Math.min(c, Math.max(1, effectiveWpm))
  const dit = 1200 / c
  let charSpace = 3 * dit // full silence between characters
  let wordSpace = 7 * dit // full silence between words
  if (s < c) {
    const ta = ((60 * c - 37.2 * s) / (s * c)) * 1000
    charSpace = (3 * ta) / 19
    wordSpace = (7 * ta) / 19
  }
  const round = (ms: number) => Math.round(ms)
  const timing: ReplyTiming = {
    leadInMs,
    ditMs: round(dit),
    dahMs: round(3 * dit),
    elementGapMs: round(dit),
    charGapMs: round(charSpace - dit),
    wordGapMs: round(wordSpace - charSpace),
  }
  if (toneHz !== undefined) timing.toneHz = toneHz
  return timing
}

/* --- The station interface ----------------------------------------------------- */

/** Something to key out */
export interface Transmission {
  text: string
  timing: ReplyTiming
}

/** A word the operator just finished sending */
export interface SentWord {
  /** the decoded word, upper case, no spaces (may contain '?' for a garbled letter) */
  word: string
  /** the operator's sending speed for this word, if it could be measured (2+ letters) */
  wpm: number | null
}

export interface Station {
  readonly id: HamStationId
  readonly frequency: number
  /** you just tuned in (or powered up on this frequency) */
  onTuneIn(): Transmission | null
  /** you finished sending a word */
  onWord(sent: SentWord): Transmission | null
  /** nobody has sent anything for `idleMs` (polled; return null to stay quiet) */
  onIdle(idleMs: number): Transmission | null
}

/** Minimal storage, so the Elmer remembers how far you got (localStorage in the app) */
export interface StationStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface StationOptions {
  /** random source (0..1), injectable for tests */
  rng?: () => number
  storage?: StationStorage
}

/* --- Helpers -------------------------------------------------------------------- */

const tx = (text: string, timing: ReplyTiming): Transmission => ({ text, timing })

/** Strip punctuation the operator may tack onto a word ("NAME?" -> "NAME"); a bare "?" stays */
export function normaliseWord(word: string): string {
  const w = word.trim().toUpperCase()
  if (w === '?') return w
  return w.replace(/^[.,?/]+|[.,]+$/g, '').replace(/\?+$/, '')
}

/**
 * Sending speed from tap times. `spanMs` runs from the first tap of the word
 * to its last. Each letter "costs" the time from its first tap to the next
 * letter's first tap, and by convention 5 characters make a word (WPM = CPM / 5).
 * The last letter has no following gap, so it counts as ~0.6 of a letter.
 */
export function measureWpm(letters: number, spanMs: number): number | null {
  if (letters < 2 || !(spanMs > 0)) return null
  const perLetterMs = spanMs / (letters - 1 + 0.6)
  const wpm = 60000 / perLetterMs / 5
  return Math.max(1, Math.min(99, Math.round(wpm)))
}

/** How hams say a character out loud: A = "DIDAH", S = "DIDIDIT", T = "DAH" */
export function spokenMorse(ch: string): string {
  const code = CHAR_TO_MORSE[ch]
  if (!code) return ch
  return [...code].map((el, i) => (el === '-' ? 'DAH' : i === code.length - 1 ? 'DIT' : 'DI')).join('')
}

const pick = <T,>(items: readonly T[], rng: () => number): T => items[Math.min(items.length - 1, Math.floor(rng() * items.length))]

/** Words that end an over: the other station's turn to talk */
const OVER_ENDINGS = new Set(['K', 'KN', 'BK', 'AR', 'SK'])

/* --- 100.20 code-practice bulletin (beginner: listening) ------------------------- */

/**
 * A slow, steady practice transmission, like the bulletins hams have copied
 * for a century: Farnsworth 18/8 WPM, so letters sound "right" but there is
 * time to think between them. Receive only in practice: it keeps the
 * frequency busy, pausing a few seconds between texts. Switch the DECODER OFF
 * to copy by ear, ON to check yourself.
 */
export const BULLETIN_TIMING = timingForWpm(18, 8, 1200, 620)
export const BULLETIN_TEXTS: readonly string[] = Object.freeze([
  'VVV VVV CODE PRACTICE AT 8 WPM. COPY BY EAR. AR',
  'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG. AR',
  'E T A N I M S O. SHORT LETTERS FIRST. AR',
  'CQ IS A CALL TO ALL. DE MEANS FROM. K MEANS OVER. AR',
  'QTH IS YOUR LOCATION. RST IS YOUR SIGNAL REPORT. AR',
  '73 MEANS BEST REGARDS. TNX MEANS THANKS. FB MEANS FINE. AR',
  'NUMBERS 1 2 3 4 5 6 7 8 9 0. AR',
  'TUNE 100.60 FOR THE ELMER. 101.40 FOR A QSO. 101.80 FOR SPEED. AR',
])
/** Silence between bulletins */
export const BULLETIN_PAUSE_MS = 4000

function createBulletin(): Station {
  let next = 0
  const send = () => {
    const text = BULLETIN_TEXTS[next % BULLETIN_TEXTS.length]
    next++
    return tx(`${text} `, BULLETIN_TIMING)
  }
  return {
    id: 'bulletin',
    frequency: HAM_STATIONS.bulletin,
    onTuneIn: send,
    onWord: () => null, // a broadcast doesn't answer
    onIdle: (idleMs) => (idleMs >= BULLETIN_PAUSE_MS ? send() : null),
  }
}

/* --- 100.60 the Elmer (beginner: sending) ---------------------------------------- */

/**
 * "Elmer" is ham slang for a mentor. He teaches one character at a time,
 * shortest codes first, introducing each by sound three times ("NEW A. A A A"),
 * then asks for it back. Right: "FB" and the next prompt (two quick reviews
 * of earlier characters, then a new one). Wrong: he tells you how it sounds
 * ("NO. A IS DIDAH. SEND A"). Send ? or AGN for a repeat. Once every letter
 * and number is learned he moves on to whole words. Progress is remembered.
 * 15 WPM characters at 10 WPM effective.
 */
export const ELMER_TIMING = timingForWpm(15, 10, 1200, 680)
export const ELMER_ORDER = 'ETIANMSURWDKGOHVFLPJBXCYZQ5432167890'
export const ELMER_WORDS: readonly string[] = Object.freeze([
  'CQ', 'DE', 'THE', 'AND', 'RST', 'QTH', 'NAME', 'TNX', 'FB', '73',
  'HELLO', 'RADIO', 'MORSE', 'KEY', 'SOS', 'GHOST', 'NIGHT', 'WAVE', 'COPY', 'TEST',
])
const ELMER_REVIEWS = 2
const ELMER_IDLE_MS = 25000
const ELMER_MAX_NUDGES = 2
const ELMER_STORAGE_KEY = 'telegraph-ghost.elmer.learned'

function createElmer(rng: () => number, storage?: StationStorage): Station {
  const stored = Number.parseInt(storage?.getItem(ELMER_STORAGE_KEY) ?? '', 10)
  /** characters unlocked so far (the newest is ELMER_ORDER[learned - 1]) */
  let learned = Number.isFinite(stored) ? Math.min(ELMER_ORDER.length, Math.max(1, stored)) : 1
  let target = ELMER_ORDER[learned - 1]
  let isNew = true
  let reviewsLeft = 0
  let greeted = false
  let nudges = 0
  const inWords = () => target.length > 1

  const save = () => {
    try {
      storage?.setItem(ELMER_STORAGE_KEY, String(learned))
    } catch {
      /* private mode / quota: progress just isn't remembered */
    }
  }

  const prompt = () => (isNew ? `NEW ${target}. ${target} ${target} ${target} ` : `SEND ${target} `)

  const advance = () => {
    if (isNew) {
      isNew = false
      reviewsLeft = learned >= 2 ? ELMER_REVIEWS : 0
    } else {
      reviewsLeft--
    }
    if (reviewsLeft > 0) {
      // review something already learned (any of them, the newest included)
      target = inWords() ? pick(ELMER_WORDS, rng) : ELMER_ORDER[Math.floor(rng() * learned) % learned]
      return
    }
    if (learned < ELMER_ORDER.length) {
      learned++
      save()
      target = ELMER_ORDER[learned - 1]
      isNew = true
    } else {
      // every character learned: whole words from now on
      target = pick(ELMER_WORDS.filter((w) => w !== target), rng)
      reviewsLeft = 1
    }
  }

  return {
    id: 'elmer',
    frequency: HAM_STATIONS.elmer,
    onTuneIn() {
      nudges = 0
      const hello = greeted ? '' : 'DE ELMER. ' // short: a beginner wants to start keying, not copy a speech
      greeted = true
      return tx(hello + prompt(), ELMER_TIMING)
    },
    onWord({ word }) {
      nudges = 0
      const w = normaliseWord(word)
      if (w === '') return null
      if (w === '?' || w === 'AGN' || w === 'QRZ') return tx(prompt(), ELMER_TIMING)
      if (w === target) {
        advance()
        return tx(`FB ${prompt()}`, ELMER_TIMING)
      }
      const hint = inWords() ? `NO. AGN ${target} ` : `NO. ${target} IS ${spokenMorse(target)}. SEND ${target} `
      return tx(hint, ELMER_TIMING)
    },
    onIdle(idleMs) {
      if (idleMs < ELMER_IDLE_MS || nudges >= ELMER_MAX_NUDGES) return null
      nudges++
      return tx(prompt(), ELMER_TIMING)
    },
  }
}

/* --- 101.00 the practice station (first contact) --------------------------------- */

/** Scripted replies of the 101.00 practice station */
export const TUTOR_REPLIES = Object.freeze({ afterHi: 'GUD COPY. SEND SOS ', afterSos: 'FB. 73. ' })

function createTutor(): Station {
  return {
    id: 'tutor',
    frequency: HAM_STATIONS.tutor,
    onTuneIn: () => null, // it only listens
    onWord({ word }) {
      if (word === 'HI') return tx(TUTOR_REPLIES.afterHi, REPLY_TIMING)
      if (word === 'SOS') return tx(TUTOR_REPLIES.afterSos, REPLY_TIMING)
      return null
    },
    onIdle: () => null,
  }
}

/* --- 101.40 Bob, the ragchewer (intermediate: a real QSO) ------------------------ */

/**
 * A complete, realistic contact. Bob calls CQ every half minute. Answer him
 * (anything; finish your over with K, or just stop sending) and he gives you
 * a signal report and his name and asks yours; then his QTH (location) and
 * asks yours; then thanks you and signs off with 73 SK. Send him 73 and he
 * answers with the traditional "E E" (dit dit). Your name and QTH are echoed
 * back, so you know he copied you. 18 WPM characters at 13 WPM effective.
 */
export const RAGCHEW_TIMING = timingForWpm(18, 13, 1500, 760)
export const RAGCHEW_NAME = 'BOB'
export const RAGCHEW_QTH = 'OHIO'
const RAGCHEW_CQ_EVERY_MS = 30000
/** silence that also ends your over, if you don't send K */
export const RAGCHEW_OVER_IDLE_MS = 3500

/** Words that can't be a name or a place (procedure, abbreviations, Bob's own details) */
const QSO_FILLER = new Set([
  'K', 'KN', 'BK', 'AR', 'SK', 'DE', 'R', 'RR', 'TNX', 'TKS', 'TU', 'FB', 'GE', 'GM', 'GA', 'GN', 'GD', 'HI',
  'NAME', 'NM', 'IS', 'MY', 'OP', 'HR', 'HERE', 'QTH', 'UR', 'ES', 'AND', 'THE', 'IN', 'NR', 'NEAR', 'RST', 'CPY',
  'OM', 'DR', 'CQ', '73', '88', 'AGN', 'PSE', 'QRZ', 'SRI', RAGCHEW_NAME, RAGCHEW_QTH,
])
const isContent = (w: string) => w !== '' && !QSO_FILLER.has(w) && !w.includes('?') && !/^\d+$/.test(w)

/** The value after a keyword ("NAME IS JOE" -> "JOE"), else the last real word of the over */
function extract(words: readonly string[], keywords: readonly string[]): string | null {
  for (let i = words.length - 1; i >= 0; i--) {
    if (!keywords.includes(words[i])) continue
    const after = words.slice(i + 1).find(isContent)
    if (after) return after
  }
  return [...words].reverse().find(isContent) ?? null
}

type QsoStage = 'call' | 'name' | 'qth' | 'closing'

function createRagchew(): Station {
  let stage: QsoStage = 'call'
  let over: string[] = []
  let name = ''

  const reply = (words: readonly string[]): Transmission | null => {
    switch (stage) {
      case 'closing':
        if (words.some((w) => w === '73' || w === 'SK' || w === 'TU' || w === 'GB')) {
          stage = 'call'
          return tx('E E ', RAGCHEW_TIMING) // dit dit: the last word of a QSO
        }
        stage = 'call'
        return reply(words) // a fresh call
      case 'call':
        stage = 'name'
        return tx(`GE. UR RST 579. NAME ${RAGCHEW_NAME}. UR NAME? K `, RAGCHEW_TIMING)
      case 'name': {
        const n = extract(words, ['NAME', 'NM', 'OP'])
        if (!n) return tx('SRI. UR NAME? K ', RAGCHEW_TIMING)
        name = n
        stage = 'qth'
        return tx(`FB ${name}. QTH ${RAGCHEW_QTH}. UR QTH? K `, RAGCHEW_TIMING)
      }
      case 'qth': {
        const q = extract(words, ['QTH', 'IN', 'NR', 'NEAR'])
        if (!q) return tx('SRI. UR QTH? K ', RAGCHEW_TIMING)
        stage = 'closing'
        return tx(`FB. ${q}. TNX QSO ${name}. 73 SK `, RAGCHEW_TIMING)
      }
    }
  }

  const endOver = () => {
    const words = over
    over = []
    return words.length ? reply(words) : null
  }

  return {
    id: 'ragchew',
    frequency: HAM_STATIONS.ragchew,
    onTuneIn() {
      stage = 'call'
      over = []
      name = ''
      return tx(`CQ CQ DE ${RAGCHEW_NAME} ${RAGCHEW_NAME} K `, { ...RAGCHEW_TIMING, leadInMs: 2000 })
    },
    onWord({ word }) {
      const w = normaliseWord(word)
      if (w === '') return null
      over.push(w)
      return OVER_ENDINGS.has(w) ? endOver() : null
    },
    onIdle(idleMs) {
      if (over.length) return idleMs >= RAGCHEW_OVER_IDLE_MS ? endOver() : null
      if (stage === 'call' && idleMs >= RAGCHEW_CQ_EVERY_MS) return tx(`CQ CQ DE ${RAGCHEW_NAME} K `, RAGCHEW_TIMING)
      return null
    },
  }
}

/* --- 101.80 the speed drill (pro) ------------------------------------------------- */

/**
 * Copy a random 5-character group (letters and numbers, no context to guess
 * from) and send it back. Right: you get your own sending speed and the drill
 * speeds up 2 WPM ("QRQ 22"); wrong: it slows down ("QRS 18") and repeats the
 * group. 15-40 WPM, starting at 20. Send ? or AGN for a repeat. Best with the
 * DECODER OFF: then nothing is on the screen and it is all ears.
 */
export const SPEED_START_WPM = 20
export const SPEED_MIN_WPM = 15
export const SPEED_MAX_WPM = 40
export const SPEED_STEP_WPM = 2
const SPEED_TONE_HZ = 820
const SPEED_IDLE_MS = 30000
const SPEED_MAX_NUDGES = 2
const GROUP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export const speedTiming = (wpm: number) => timingForWpm(wpm, wpm, 1200, SPEED_TONE_HZ)

function createSpeedDrill(rng: () => number): Station {
  let wpm = SPEED_START_WPM
  const newGroup = () => Array.from({ length: 5 }, () => pick([...GROUP_CHARS], rng)).join('')
  let group = newGroup()
  let introduced = false
  let nudges = 0
  const send = (text: string) => tx(text, speedTiming(wpm))

  return {
    id: 'speed',
    frequency: HAM_STATIONS.speed,
    onTuneIn() {
      nudges = 0
      return send(introduced ? `GRP ${group} ` : `DE SPD. RPT GROUP. GRP ${group} `)
    },
    onWord({ word, wpm: yours }) {
      nudges = 0
      introduced = true
      const w = normaliseWord(word)
      if (w === '' || OVER_ENDINGS.has(w)) return null
      if (w === '?' || w === 'AGN' || w === 'QRZ') return send(`GRP ${group} `)
      if (w === group) {
        wpm = Math.min(SPEED_MAX_WPM, wpm + SPEED_STEP_WPM)
        group = newGroup()
        const report = yours === null ? '' : `UR ${yours}WPM. `
        return send(`R ${report}QRQ ${wpm}. GRP ${group} `)
      }
      wpm = Math.max(SPEED_MIN_WPM, wpm - SPEED_STEP_WPM)
      return send(`NIL. QRS ${wpm}. GRP ${group} `)
    },
    onIdle(idleMs) {
      if (idleMs < SPEED_IDLE_MS || nudges >= SPEED_MAX_NUDGES) return null
      nudges++
      return send(`AGN GRP ${group} `)
    },
  }
}

/* --- The band ---------------------------------------------------------------------- */

/** Fresh instances of every ham station, keyed by id (each keeps its own state) */
export function createStations({ rng = Math.random, storage }: StationOptions = {}): Record<HamStationId, Station> {
  return {
    bulletin: createBulletin(),
    elmer: createElmer(rng, storage),
    tutor: createTutor(),
    ragchew: createRagchew(),
    speed: createSpeedDrill(rng),
  }
}

/** What the reference card's band plan says, in dial order */
export const BAND_PLAN: readonly { id: HamStationId; frequency: number; label: string }[] = Object.freeze([
  { id: 'bulletin', frequency: HAM_STATIONS.bulletin, label: 'code practice' },
  { id: 'elmer', frequency: HAM_STATIONS.elmer, label: 'Elmer, learn' },
  { id: 'tutor', frequency: HAM_STATIONS.tutor, label: 'send HI' },
  { id: 'ragchew', frequency: HAM_STATIONS.ragchew, label: 'Bob, QSO' },
  { id: 'speed', frequency: HAM_STATIONS.speed, label: 'speed drill' },
])
