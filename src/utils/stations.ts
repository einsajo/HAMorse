/**
 * The operators on the ham band (100.00-103.50 MHz), in dial order, 0.70 MHz
 * apart with empty band between them:
 *
 *   100.30  ELMER          a mentor: introduces himself, asks if you're new, then teaches by chatting
 *   101.00  PRACTICE       the original tutor: send HI, then SOS
 *   101.70  CODE PRACTICE  a slow bulletin to copy by ear (Farnsworth 18/8 WPM)
 *   102.40  BOB            a real-feeling QSO: RST, name, QTH, 73
 *   103.10  SAM            an old-timer who offers high-speed copy practice
 *
 * They are people, not levels: they greet you, ask questions, react to
 * what you send, remember you, and point you at each other. Nothing on the
 * radio lists them; you find them like a real ham does, by tuning around
 * (or by copying the code-practice bulletin, which mentions them).
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
import { HAM_STATIONS, formatMhz } from '../constants'
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
  /** irregular fist, 0..1: each element and gap is stretched or squeezed by up to this fraction */
  jitter?: number
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

/** The ghost's default timing (its agent normally sets its own, exchange by exchange: see ghostAgent.ghostVoice) */
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
  /** you pressed TX SEND: your over is finished (after your last word was delivered) */
  onOver?(): Transmission | null
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

/* --- 101.70 code-practice bulletin (beginner: listening) ------------------------- */

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
  `NEW TO CW? ELMER ON ${formatMhz(HAM_STATIONS.elmer)} HELPS. BOB ON ${formatMhz(HAM_STATIONS.ragchew)} LIKES TO CHAT. SAM ON ${formatMhz(HAM_STATIONS.speed)} SENDS FAST. AR`,
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

/* --- 100.30 the Elmer (beginner: sending) ---------------------------------------- */

/**
 * "Elmer" is ham slang for the experienced operator who takes a newcomer
 * under their wing. This one behaves like a person on the air, not a lesson
 * screen: he introduces himself, asks before he helps, waits for your answer,
 * has a word with you, and only then starts teaching. Each step is its own
 * short over, with a natural pause between them:
 *
 *   him: GE. DE ELMER. I AM AN OLD CW OP.
 *        (pause)
 *   him: I HELP NEW OPS. R U NEW TO CW? Y OR N K
 *   you: Y                    (just one letter; YES / R / OK work too)
 *   him: FB. GLAD U CAME BY. I SEND A LTR, U SEND IT BACK.
 *        (pause)
 *   him: 1ST LTR IS E. E IS 1 DIT. SEND E K
 *   you: E
 *   him: VY GUD. NEXT T. T IS DAH. T T T. UR TURN K
 *
 * Answer N and he suggests Bob and Sam, or words with him. Say nothing and
 * he helps ("NO RUSH. IF U R NEW, TAP 1 DIT K": a dit is an E, which he takes
 * as yes). He brings in one character at a time, shortest codes first, mixes
 * in earlier ones, talks you through mistakes, remarks on your progress, says
 * hi back, signs off on 73, and welcomes you back where you left off
 * (remembered in localStorage). Like a real Elmer he chats at an easy pace
 * (20 WPM characters, 18 effective) and slows right down for the letters he
 * is teaching (20 / 15, Farnsworth), so you hear each one clearly.
 */
/** the lessons: the letter being taught, the prompts and corrections */
export const ELMER_TIMING = timingForWpm(20, 15, 1200, 680)
/** the chat: introductions, questions, welcome */
export const ELMER_CHAT_TIMING = timingForWpm(20, 18, 1000, 680)
export const ELMER_ORDER = 'ETIANMSURWDKGOHVFLPJBXCYZQ5432167890'
export const ELMER_WORDS: readonly string[] = Object.freeze([
  'CQ', 'DE', 'THE', 'AND', 'RST', 'QTH', 'NAME', 'TNX', 'FB', '73',
  'HELLO', 'RADIO', 'MORSE', 'KEY', 'SOS', 'GHOST', 'NIGHT', 'WAVE', 'COPY', 'TEST',
])
const ELMER_REVIEWS = 2
/** the pause between one over and the next part of what he's saying */
export const ELMER_FOLLOW_UP_MS = 1500
/** how long he waits for an answer to "R U NEW?" before helping */
export const ELMER_ASK_IDLE_MS = 15000
export const ELMER_IDLE_MS = 25000
const ELMER_MAX_NUDGES = 2
const ELMER_STORAGE_KEY = 'telegraph-ghost.elmer.learned'

export const ELMER_LINES = Object.freeze({
  intro: 'GE. DE ELMER. I AM AN OLD CW OP. ',
  ask: 'I HELP NEW OPS. R U NEW TO CW? Y OR N K ',
  askAgain: 'R U NEW TO CW? SEND Y OR N K ',
  notUnderstood: 'SRI, I NEED Y OR N. R U NEW? K ',
  helpAnswer: 'NO RUSH. IF U R NEW, TAP 1 DIT K ',
  welcome: 'FB. GLAD U CAME BY. I SEND A LTR, U SEND IT BACK. ',
  welcomeBack: 'GE. WB. NICE TO HEAR U AGN. ',
  signOff: '73 ES GL. CU AGN SK ',
})
const notNew = () =>
  `FB OM. TRY BOB ON ${formatMhz(HAM_STATIONS.ragchew)} FOR A QSO, OR SAM ON ${formatMhz(HAM_STATIONS.speed)} FOR SPEED. OR WORDS WID ME. `

const YES_WORDS = new Set(['Y', 'YES', 'YS', 'R', 'RR', 'C', 'OK', 'NEW', 'BEGINNER', 'YEP', 'YA', 'YEA', 'YEAH', 'E'])
const NO_WORDS = new Set(['N', 'NO', 'NIL', 'NOT', 'NOPE', 'NEG'])
const GREETINGS = new Set(['HI', 'HELLO', 'GE', 'GM', 'GA', 'HW', 'HWY'])
const GOODBYES = new Set(['73', 'SK', 'GN', 'CUL', 'GB', 'QRT', 'BYE'])
const PRAISE = ['FB', 'VY GUD', 'R R FB', 'GUD', 'NICE', 'PERFECT', 'SOLID']

type ElmerStage = 'greet' | 'ask' | 'lesson' | 'paused'

function createElmer(rng: () => number, storage?: StationStorage): Station {
  const stored = Number.parseInt(storage?.getItem(ELMER_STORAGE_KEY) ?? '', 10)
  /** characters met so far (the newest is ELMER_ORDER[learned - 1]) */
  let learned = Number.isFinite(stored) ? Math.min(ELMER_ORDER.length, Math.max(1, stored)) : 1
  const returning = Number.isFinite(stored) && stored > 1
  let stage: ElmerStage = 'greet'
  let target = ELMER_ORDER[learned - 1]
  let isNew = !returning
  let reviewsLeft = 0
  let misses = 0
  let nudges = 0
  /** said they already know CW: words only */
  let knowsCw = false
  /** the rest of what he's saying, sent as its own over after a short pause */
  let followUp: Transmission | null = null
  const inWords = () => target.length > 1

  const save = () => {
    try {
      storage?.setItem(ELMER_STORAGE_KEY, String(learned))
    } catch {
      /* private mode / quota: progress just isn't remembered */
    }
  }

  /** a lesson line: slow, so the letter is clear */
  const reply = (text: string) => tx(text, ELMER_TIMING)
  /** a chat line: an easy conversational pace */
  const chat = (text: string) => tx(text, ELMER_CHAT_TIMING)
  /** say `now` (a lesson line), pause, then `then` */
  const say = (now: string, then: string | null = null) => {
    followUp = then === null ? null : reply(then)
    return reply(now)
  }
  /** chat `now`, pause, then `then` (a lesson line, unless `thenChat`) */
  const talk = (now: string, then: string | null = null, thenChat = false) => {
    followUp = then === null ? null : thenChat ? chat(then) : reply(then)
    return chat(now)
  }

  /** what he asks you to send next */
  const prompt = () => {
    if (inWords()) return `SEND ${target} K `
    if (isNew) {
      return learned === 1
        ? '1ST LTR IS E. E IS 1 DIT. SEND E K '
        : `NEXT ${target}. ${target} IS ${spokenMorse(target)}. ${target} ${target} ${target}. UR TURN K `
    }
    return `${pick(['SEND', 'NOW', 'TRY'], rng)} ${target} K `
  }

  /** a remark when you reach a milestone (said once, as it happens) */
  const milestone = () => {
    if (inWords()) return ''
    if (learned === 6) return 'U KNOW 6 LTRS NOW. '
    if (learned === 12) return `U CAN TRY BOB ON ${formatMhz(HAM_STATIONS.ragchew)} SOMETIME. `
    if (learned === 20) return 'HALF WAY HI. '
    if (learned === 27) return 'ALL LTRS DONE. NOW NUMBERS. '
    return ''
  }

  const startLesson = () => {
    stage = 'lesson'
    misses = 0
  }

  const next = () => {
    misses = 0
    if (isNew) {
      isNew = false
      reviewsLeft = learned >= 2 ? ELMER_REVIEWS : 0
    } else {
      reviewsLeft--
    }
    if (reviewsLeft > 0) {
      // go back over something already learned (any of them, the newest included)
      target = inWords() ? pick(ELMER_WORDS, rng) : ELMER_ORDER[Math.floor(rng() * learned) % learned]
      return ''
    }
    if (!knowsCw && learned < ELMER_ORDER.length) {
      learned++
      save()
      target = ELMER_ORDER[learned - 1]
      isNew = true
      return milestone()
    }
    const first = !inWords()
    target = pick(ELMER_WORDS.filter((w) => w !== target), rng)
    reviewsLeft = 1
    return first && !knowsCw ? 'U KNOW THEM ALL. NOW WORDS. ' : ''
  }

  const lessonWord = (w: string): Transmission | null => {
    if (w === target) return say(`${pick(PRAISE, rng)}. ${next()}${prompt()}`)
    // procedure words aren't attempts (unless he asked for exactly that)
    if (OVER_ENDINGS.has(w) || w === 'DE') return null
    misses++
    if (inWords()) return say(misses >= 2 ? `NO PROBLEM. LISTEN. ${target} ${target}. SEND ${target} K ` : `NOT QUITE. AGN ${target} K `)
    if (misses >= 2) return say(`NO WORRIES. LISTEN. ${target} ${target} ${target}. SEND ${target} K `)
    return say(`NOT QUITE. ${target} IS ${spokenMorse(target)}. TRY AGN K `)
  }

  /** your answer to "R U NEW?" */
  const answer = (w: string): Transmission | null => {
    if (YES_WORDS.has(w)) {
      startLesson()
      return talk(ELMER_LINES.welcome, prompt())
    }
    if (NO_WORDS.has(w)) {
      knowsCw = true
      startLesson()
      isNew = false
      target = pick(ELMER_WORDS, rng)
      reviewsLeft = 1
      return talk(notNew(), prompt())
    }
    if (GREETINGS.has(w)) return talk(`HI HI. ${ELMER_LINES.askAgain}`)
    if (OVER_ENDINGS.has(w) || w === 'DE') return null
    return talk(ELMER_LINES.notUnderstood)
  }

  return {
    id: 'elmer',
    frequency: HAM_STATIONS.elmer,
    onTuneIn() {
      nudges = 0
      if (stage === 'greet') {
        if (returning) {
          startLesson()
          return talk(`${ELMER_LINES.welcomeBack}LAST TIME U GOT TO ${target}. `, prompt())
        }
        stage = 'ask'
        return talk(ELMER_LINES.intro, ELMER_LINES.ask, true)
      }
      if (stage === 'ask') return talk(`WB. ${ELMER_LINES.askAgain}`)
      startLesson()
      return say(`WB. ${prompt()}`)
    },
    onWord({ word }) {
      nudges = 0
      const w = normaliseWord(word)
      if (w === '') return null
      followUp = null // you've taken the frequency: he answers you instead
      if (w === '?' || w === 'AGN' || w === 'QRZ' || w === 'QRS') {
        return stage === 'ask' ? talk(ELMER_LINES.askAgain) : say(prompt())
      }
      if (GOODBYES.has(w) && stage !== 'paused' && w !== target) {
        stage = 'paused'
        return talk(ELMER_LINES.signOff)
      }
      switch (stage) {
        case 'greet':
        case 'ask':
          return answer(w)
        case 'paused':
          startLesson()
          return say(`WB. ${prompt()}`)
        case 'lesson':
          if (GREETINGS.has(w) && w !== target) return say(`HI HI. ${prompt()}`)
          return lessonWord(w)
      }
    },
    onIdle(idleMs) {
      // the second half of what he was saying, after a breath
      if (followUp !== null) {
        if (idleMs < ELMER_FOLLOW_UP_MS) return null
        const next = followUp
        followUp = null
        return next
      }
      if (stage === 'paused' || nudges >= ELMER_MAX_NUDGES) return null
      if (stage === 'ask') {
        if (idleMs < ELMER_ASK_IDLE_MS) return null
        nudges++ // a newcomer who doesn't know how to answer yet: show them
        return chat(ELMER_LINES.helpAnswer)
      }
      if (stage !== 'lesson' || idleMs < ELMER_IDLE_MS) return null
      nudges++
      return reply(`STILL THERE? ${prompt()}`)
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

/* --- 102.40 Bob, the ragchewer (intermediate: a real QSO) ------------------------ */

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
    onOver: () => endOver(), // TX SEND ends the over at once, like sending K
    onIdle(idleMs) {
      if (over.length) return idleMs >= RAGCHEW_OVER_IDLE_MS ? endOver() : null
      if (stage === 'call' && idleMs >= RAGCHEW_CQ_EVERY_MS) return tx(`CQ CQ DE ${RAGCHEW_NAME} K `, RAGCHEW_TIMING)
      return null
    },
  }
}

/* --- 103.10 Sam, the high-speed operator (pro) ------------------------------------ */

/**
 * Sam is an old-timer who loves fast code. He calls "CQ QRQ DE SAM K" (QRQ =
 * "send faster"). Answer him and he says hello and asks before anything
 * starts, then explains:
 *
 *   him: CQ QRQ CQ QRQ DE SAM K
 *   you: GE
 *   him: GE OM. DE SAM. TNX FER CALL.
 *        (pause)
 *   him: WANT SOME SPEED PRACTICE? Y OR N K
 *   you: Y
 *   him: FB. I SEND 5 LTR GRPS, U SEND THEM BACK. 20 WPM.
 *        (pause)
 *   him: GRP 7KQ2M
 *
 * The groups are random letters and numbers (no context to guess from).
 * Copy one and he tells you your speed and speeds up ("SOLID CPY. UR 21WPM.
 * QRQ 22"); miss it and he slows down ("CLOSE" if you were one character off)
 * and sends it again. 15-40 WPM, starting at 20. ? / AGN repeats, QRS slows
 * him down, 73 ends the session; say N and he signs off politely. He
 * remembers you. Best with the DECODER OFF: then it's all ears.
 */
export const SPEED_START_WPM = 20
export const SPEED_MIN_WPM = 15
export const SPEED_MAX_WPM = 40
export const SPEED_STEP_WPM = 2
export const SPEED_NAME = 'SAM'
const SPEED_TONE_HZ = 820
const SPEED_CQ_EVERY_MS = 40000
/** the pause before the second half of what he's saying */
export const SPEED_FOLLOW_UP_MS = 1200
const SPEED_IDLE_MS = 30000
const SPEED_MAX_NUDGES = 2
const GROUP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const SPEED_PRAISE = ['FB', 'SOLID CPY', 'R R', 'VY FB', 'NICE FIST']

export const speedTiming = (wpm: number) => timingForWpm(wpm, wpm, 1200, SPEED_TONE_HZ)

/** same length, exactly one character different */
const oneOff = (a: string, b: string) => a.length === b.length && [...a].filter((ch, i) => ch !== b[i]).length === 1

type SpeedStage = 'call' | 'offer' | 'drill'

function createSpeedDrill(rng: () => number): Station {
  let wpm = SPEED_START_WPM
  const newGroup = () => Array.from({ length: 5 }, () => pick([...GROUP_CHARS], rng)).join('')
  let group = newGroup()
  let stage: SpeedStage = 'call'
  let met = false
  let nudges = 0
  let followUp: string | null = null
  const send = (text: string, then: string | null = null) => {
    followUp = then
    return tx(text, speedTiming(wpm))
  }
  const cq = () => send(`CQ QRQ CQ QRQ DE ${SPEED_NAME} K `)
  const offer = 'WANT SOME SPEED PRACTICE? Y OR N K '

  return {
    id: 'speed',
    frequency: HAM_STATIONS.speed,
    onTuneIn() {
      nudges = 0
      if (stage === 'drill') return send(`WB. GRP ${group} `)
      stage = 'call'
      return cq()
    },
    onWord({ word, wpm: yours }) {
      nudges = 0
      const w = normaliseWord(word)
      if (w === '' || OVER_ENDINGS.has(w) || w === 'DE') return null
      followUp = null
      if (GOODBYES.has(w)) {
        stage = 'call'
        return send('TU FER PRACTICE. 73 SK ')
      }
      if (stage === 'call') {
        stage = 'offer'
        if (met) return send(`WB OM. ${offer}`)
        met = true
        return send(`GE OM. DE ${SPEED_NAME}. TNX FER CALL. `, offer)
      }
      if (stage === 'offer') {
        if (YES_WORDS.has(w)) {
          stage = 'drill'
          return send(`FB. I SEND 5 LTR GRPS, U SEND THEM BACK. ${wpm} WPM. `, `GRP ${group} `)
        }
        if (NO_WORDS.has(w)) {
          stage = 'call'
          return send('OK OM. TNX FER QSO. 73 SK ')
        }
        return send(`SRI. ${offer}`)
      }
      if (w === '?' || w === 'AGN' || w === 'QRZ') return send(`GRP ${group} `)
      if (w === 'QRS') {
        wpm = Math.max(SPEED_MIN_WPM, wpm - SPEED_STEP_WPM)
        return send(`R QRS ${wpm}. GRP ${group} `)
      }
      if (w === group) {
        const report = yours === null ? '' : `UR ${yours}WPM. `
        const faster = wpm < SPEED_MAX_WPM
        wpm = Math.min(SPEED_MAX_WPM, wpm + SPEED_STEP_WPM)
        group = newGroup()
        return send(`${pick(SPEED_PRAISE, rng)}. ${report}${faster ? `QRQ ${wpm}` : 'TOP SPEED HI'}. GRP ${group} `)
      }
      wpm = Math.max(SPEED_MIN_WPM, wpm - SPEED_STEP_WPM)
      return send(`${oneOff(w, group) ? 'CLOSE' : 'NIL'}. QRS ${wpm}. AGN GRP ${group} `)
    },
    onIdle(idleMs) {
      if (followUp !== null) {
        if (idleMs < SPEED_FOLLOW_UP_MS) return null
        const text = followUp
        followUp = null
        return tx(text, speedTiming(wpm))
      }
      if (stage === 'call') return idleMs >= SPEED_CQ_EVERY_MS ? cq() : null
      if (idleMs < SPEED_IDLE_MS || nudges >= SPEED_MAX_NUDGES) return null
      nudges++
      return send(stage === 'offer' ? offer : `QRZ? GRP ${group} `)
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
