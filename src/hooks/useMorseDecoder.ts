import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CHAR_TO_MORSE, decodeSymbol } from '../utils/morseDictionary'
import { playGhostTone, playTone } from '../utils/audioEngine'
import { useRadio } from '../context/RadioContext'
import { getBandInfo, hamStationAt } from '../constants'
import type { Band, HamStationId } from '../constants'
import { GHOST_TIMING, REPLY_TIMING, createStations, measureWpm } from '../utils/stations'
import type { ReplyTiming, SentWord, Station, StationStorage, Transmission } from '../utils/stations'

/* --- Timing ---------------------------------------------------------------
   Gaps are measured from the most recent tap. They start deliberately longer
   than strict Morse timing so a beginner tapping on a touchscreen still gets
   clean letters (and then adapt to the operator, below). */
export const SYMBOL_TIMEOUT_MS = 600 // silence that ends a letter (the slowest setting)
export const WORD_TIMEOUT_MS = 1400 // silence that ends a word (the slowest setting)
export const UNKNOWN_CHAR = '?'
/** Sidetone lengths: a dah is three dits, as in real Morse */
export const DIT_TONE_MS = 60
export const DAH_TONE_MS = 180
/** Longest code worth collecting; anything longer can never decode */
const MAX_SYMBOL_LENGTH = 7
/** Characters of history to keep; the LCD only shows the newest ~25 */
const MAX_MESSAGE_LENGTH = 160

/* --- Adaptive letter spacing ----------------------------------------------
   Like a real CW decoder, the gap that ends a letter follows the operator's
   rhythm: it is ~4x their average tap interval inside a letter, between
   MIN_SYMBOL_TIMEOUT_MS and SYMBOL_TIMEOUT_MS. A beginner keeps the generous
   600 ms; a fast operator is no longer capped at ~12 WPM by it. The word gap
   scales with it (x2.4, at most WORD_TIMEOUT_MS). */
export const MIN_SYMBOL_TIMEOUT_MS = 320
const ADAPT_FACTOR = 4
const WORD_TO_SYMBOL = 2.4
/** weight of the newest tap interval in the running average */
const ADAPT_WEIGHT = 0.3

/* --- Incoming transmissions -----------------------------------------------
   Replies are keyed element by element with real Morse timing, so you HEAR
   every dit and dah and see it build up on the LCD before the letter lands.
   The timings (and every station's behaviour) live in src/utils/stations.ts. */
export type { ReplyTiming } from '../utils/stations'
export { REPLY_TIMING, GHOST_TIMING, TUTOR_REPLIES } from '../utils/stations'
export const GHOST_REPLY = ' I C U '
/** How often the band is checked for a station that wants to transmit unprompted */
export const IDLE_POLL_MS = 400

export type MorseTap = '.' | '-'

/**
 * What the decoder is doing, for the LCD:
 *   off        power or DECODER is OFF: show nothing (the radio still works:
 *              taps are keyed and decoded, stations still answer; only the
 *              screen is blank, for copying and sending by ear)
 *   rx-only    on a broadcaster: you can listen but not transmit
 *   dead-band  dead air: nobody to talk to
 *   ready      ham band or the ghost frequency: taps are shown as they decode
 */
export type DecoderStatus = 'off' | 'rx-only' | 'dead-band' | 'ready'

/**
 * The LCD's TX annunciator, driven by TX SEND:
 *   idle      nothing to show
 *   sending   "TX SEND..." your over is going out; waiting for the far end
 *   no-reply  nobody answered what you sent
 *   inhibit   this frequency is receive-only / dead air: you can't transmit
 *   busy      the other station is still sending: wait for it to finish
 *   empty     you haven't keyed anything to send
 */
export type TxStatus = 'idle' | 'sending' | 'no-reply' | 'inhibit' | 'busy' | 'empty'

/** "TX SEND..." stays up at least this long, even if the reply starts at once */
export const TX_SENDING_MIN_MS = 1200
/** after this long with no answer, the LCD says NO REPLY */
export const TX_REPLY_WAIT_MS = 2800
/** how long NO REPLY / INHIBIT / BUSY / NO MSG stay on the LCD */
export const TX_NOTICE_MS = 2200

export interface MorseDecoderState {
  /** Dits and dahs of the letter currently being keyed, e.g. ".-" */
  currentSymbol: string
  /** Everything decoded so far */
  decodedMessage: string
  /**
   * Index in `decodedMessage` where your unsent draft starts (= its length
   * when nothing is waiting). With the DECODER ON, words wait here until TX SEND.
   */
  draftFrom: number
  /**
   * Record a paddle tap. On a transmit frequency with the power ON it sounds
   * the 700 Hz sidetone and is decoded, whether or not the DECODER (the
   * display) is ON.
   */
  handleTap: (type: MorseTap) => void
  /** Wipe the buffer and anything in progress */
  clear: () => void
  /**
   * The CLR button: with an unsent draft it wipes only the draft (fix a
   * mistake without losing the conversation); otherwise the whole screen.
   */
  clearButton: () => void
  /**
   * TX SEND: send what you've keyed right now (no waiting for the word gap)
   * and hand the frequency over ("over", like ending with K). Shows
   * TX SEND... on the LCD until the far end answers, or NO REPLY.
   */
  sendOver: () => void
  /** The LCD's TX annunciator */
  txStatus: TxStatus
  /** True when taps are keyed and decoded (power ON, on the ham band or the ghost frequency) */
  isActive: boolean
  /** Another station is sending: the paddles are locked out until it finishes */
  isReceiving: boolean
  /**
   * Play an incoming transmission: each character is keyed out loud
   * (dits and dahs), shown live on the LCD, then appended to the message.
   * `isGhost` = the ghost's distorted tone; `timing` overrides the default
   * speed (the ghost's, or the 101.00 practice station's). Interrupted by
   * CLR, retuning or power off.
   */
  simulateReply: (message: string, isGhost: boolean, timing?: ReplyTiming) => void
  /** Band the radio is tuned to */
  band: Band
  /** Ham operator on this exact frequency, if any */
  station: HamStationId | null
  /** Decoder state for the LCD status line */
  status: DecoderStatus
}

interface DecoderOptions {
  /** the slowest (initial) letter gap; the decoder adapts below it */
  symbolTimeoutMs?: number
  /** the slowest (initial) word gap */
  wordTimeoutMs?: number
}

const trimHistory = (text: string) => (text.length > MAX_MESSAGE_LENGTH ? text.slice(-MAX_MESSAGE_LENGTH) : text)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** The letter / word gaps for an operator whose average in-letter tap interval is `avgTapMs` */
export function adaptiveTimeouts(avgTapMs: number | null, maxSymbolMs = SYMBOL_TIMEOUT_MS, maxWordMs = WORD_TIMEOUT_MS) {
  const minSymbol = Math.min(MIN_SYMBOL_TIMEOUT_MS, maxSymbolMs)
  const symbolMs = avgTapMs === null ? maxSymbolMs : clamp(Math.round(avgTapMs * ADAPT_FACTOR), minSymbol, maxSymbolMs)
  const wordMs = clamp(Math.round(symbolMs * WORD_TO_SYMBOL), Math.min(symbolMs + 200, maxWordMs), maxWordMs)
  return { symbolMs, wordMs }
}

interface EngineCallbacks {
  /** the user finished a word (word timeout); receives the whole message and the word itself */
  onWordEnd?: (message: string, sent: SentWord) => void
  /** an incoming transmission finished sending */
  onReplyEnd?: (message: string, isGhost: boolean) => void
}

/**
 * The decoder engine. Every tap appends to `currentSymbol` and restarts two
 * timers: after the letter gap of silence the symbol is looked up in the
 * Morse dictionary and its character (or `?`) is appended to
 * `decodedMessage`; after the word gap a word space is added and the far
 * station hears the word.
 *
 * The symbol lives in a ref as well as in state, so the timers always read
 * the latest value without being recreated on every render.
 *
 * `canKey`: the rig can transmit here (power ON, ham band or ghost), so a tap
 * sounds the sidetone and is decoded. The DECODER switch is not the
 * engine's business: it only decides whether the LCD shows the text.
 */
function useMorseDecoderEngine(
  canKey: boolean,
  { symbolTimeoutMs = SYMBOL_TIMEOUT_MS, wordTimeoutMs = WORD_TIMEOUT_MS }: DecoderOptions,
  callbacks: EngineCallbacks = {},
): Omit<MorseDecoderState, 'band' | 'station' | 'status' | 'sendOver' | 'txStatus' | 'clearButton'> & {
  flush: () => boolean
  receivingNow: () => boolean
  pendingNow: () => boolean
  markSent: () => void
  discardDraft: () => void
} {
  const [currentSymbol, setCurrentSymbol] = useState('')
  const [decodedMessage, setDecodedMessage] = useState('')
  const [isReceiving, setIsReceiving] = useState(false)

  // the message also lives in a ref, so word-end checks see it synchronously
  const messageRef = useRef('')
  const receivingRef = useRef(false)
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  const symbolRef = useRef('')
  const symbolTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wordTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const canKeyRef = useRef(canKey)
  canKeyRef.current = canKey

  // the word being sent, and its timing (for the operator's WPM)
  const wordRef = useRef('')
  const wordStartRef = useRef(0)
  const lastTapRef = useRef(0)
  /** running average of the tap interval inside a letter; null until measured */
  const avgTapRef = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    if (symbolTimer.current !== null) clearTimeout(symbolTimer.current)
    if (wordTimer.current !== null) clearTimeout(wordTimer.current)
    symbolTimer.current = null
    wordTimer.current = null
  }, [])

  const setSymbol = useCallback((value: string) => {
    symbolRef.current = value
    setCurrentSymbol(value)
  }, [])

  /**
   * Where your unsent draft starts in the message. Everything before it has
   * been sent (or came from the far end); everything after it is text you've
   * keyed but not yet sent.
   */
  const draftAnchor = useRef(0)
  const [draftFrom, setDraftFrom] = useState(0)

  const setMessage = useCallback((value: string) => {
    const next = trimHistory(value)
    // the oldest characters scrolled out of history: the anchor moves with the text
    if (next.length < value.length) {
      draftAnchor.current = Math.max(0, draftAnchor.current - (value.length - next.length))
      setDraftFrom(draftAnchor.current)
    }
    if (draftAnchor.current > next.length) {
      draftAnchor.current = next.length
      setDraftFrom(draftAnchor.current)
    }
    messageRef.current = next
    setDecodedMessage(next)
  }, [])

  /** Everything on the screen so far counts as sent */
  const markSent = useCallback(() => {
    draftAnchor.current = messageRef.current.length
    setDraftFrom(draftAnchor.current)
  }, [])

  /** append a space unless the message is empty or already ends with one */
  const appendSpace = useCallback(() => {
    const msg = messageRef.current
    if (msg !== '' && !msg.endsWith(' ')) setMessage(msg + ' ')
  }, [setMessage])

  const stopReply = useCallback(() => {
    if (replyTimer.current !== null) clearTimeout(replyTimer.current)
    replyTimer.current = null
    if (receivingRef.current) {
      receivingRef.current = false
      setIsReceiving(false)
    }
  }, [])

  /** End of letter: decode the pending symbol */
  const commitSymbol = useCallback(() => {
    symbolTimer.current = null
    const code = symbolRef.current
    if (!code) return
    const ch = decodeSymbol(code) ?? UNKNOWN_CHAR
    setSymbol('')
    wordRef.current += ch
    setMessage(messageRef.current + ch)
  }, [setSymbol, setMessage])

  /** End of word: one space, never leading and never doubled; then let the far station react */
  const commitWord = useCallback(() => {
    wordTimer.current = null
    const word = wordRef.current
    const wpm = measureWpm(word.length, lastTapRef.current - wordStartRef.current)
    wordRef.current = ''
    appendSpace()
    if (word) callbacksRef.current.onWordEnd?.(messageRef.current, { word, wpm })
  }, [appendSpace])

  /** The auto-typer: recursive setTimeouts, one per element / gap */
  const simulateReply = useCallback(
    (message: string, isGhost: boolean, timing?: ReplyTiming) => {
      stopReply()
      clearTimers()
      setSymbol('')
      wordRef.current = ''
      receivingRef.current = true
      setIsReceiving(true)

      const t = timing ?? (isGhost ? GHOST_TIMING : REPLY_TIMING)
      const tone = isGhost ? playGhostTone : (ms: number) => playTone(ms, t.toneHz)
      const chars = [...message.toUpperCase()]
      let i = 0

      const schedule = (fn: () => void, ms: number) => {
        replyTimer.current = setTimeout(fn, ms)
      }

      const nextChar = () => {
        if (i >= chars.length) {
          stopReply()
          markSent() // their text is not your draft
          callbacksRef.current.onReplyEnd?.(message, isGhost)
          return
        }
        const ch = chars[i++]
        if (ch === ' ') {
          appendSpace()
          schedule(nextChar, t.wordGapMs)
          return
        }
        const code = CHAR_TO_MORSE[ch]
        if (!code) {
          // nothing to key (shouldn't happen with the scripted replies): just print it
          setMessage(messageRef.current + ch)
          schedule(nextChar, t.charGapMs)
          return
        }
        let j = 0
        const nextElement = () => {
          if (j >= code.length) {
            setSymbol('')
            setMessage(messageRef.current + ch)
            schedule(nextChar, t.charGapMs)
            return
          }
          const el = code[j++]
          const ms = el === '.' ? t.ditMs : t.dahMs
          tone(ms)
          setSymbol(symbolRef.current + el)
          schedule(nextElement, ms + t.elementGapMs)
        }
        nextElement()
      }

      // the reply starts on a fresh word
      appendSpace()
      markSent()
      schedule(nextChar, t.leadInMs)
    },
    [appendSpace, clearTimers, markSent, setMessage, setSymbol, stopReply],
  )

  const handleTap = useCallback(
    (type: MorseTap) => {
      if (type !== '.' && type !== '-') return
      if (receivingRef.current) return // the other station has the frequency: wait your turn
      if (!canKeyRef.current) return // dead radio, broadcaster or dead air: nothing keyed
      playTone(type === '.' ? DIT_TONE_MS : DAH_TONE_MS)
      clearTimers()

      const now = performance.now()
      if (symbolRef.current !== '') {
        // a tap inside a letter: learn the operator's rhythm
        const interval = now - lastTapRef.current
        const avg = avgTapRef.current
        avgTapRef.current = avg === null ? interval : avg * (1 - ADAPT_WEIGHT) + interval * ADAPT_WEIGHT
      }
      if (wordRef.current === '' && symbolRef.current === '') wordStartRef.current = now
      lastTapRef.current = now

      // a symbol longer than any real code can never decode: commit it as '?' and start over
      if (symbolRef.current.length >= MAX_SYMBOL_LENGTH) commitSymbol()
      setSymbol(symbolRef.current + type)
      const { symbolMs, wordMs } = adaptiveTimeouts(avgTapRef.current, symbolTimeoutMs, wordTimeoutMs)
      symbolTimer.current = setTimeout(commitSymbol, symbolMs)
      wordTimer.current = setTimeout(commitWord, wordMs)
    },
    [clearTimers, commitSymbol, commitWord, setSymbol, symbolTimeoutMs, wordTimeoutMs],
  )

  /** Commit the half-keyed letter and the word now, without waiting for the gaps. True if anything was pending. */
  const flush = useCallback(() => {
    if (receivingRef.current) return false
    const pendingSymbol = symbolRef.current !== ''
    const pending = pendingSymbol || wordRef.current !== ''
    clearTimers()
    if (pendingSymbol) commitSymbol()
    if (pending) commitWord()
    return pending
  }, [clearTimers, commitSymbol, commitWord])

  const clear = useCallback(() => {
    stopReply()
    clearTimers()
    setSymbol('')
    wordRef.current = ''
    setMessage('')
    markSent()
  }, [clearTimers, markSent, setMessage, setSymbol, stopReply])

  /** Something keyed but not yet sent: a half-keyed letter, a word in progress, or committed draft text */
  const pendingNow = useCallback(
    () =>
      symbolRef.current !== '' ||
      wordRef.current !== '' ||
      messageRef.current.slice(draftAnchor.current).trim() !== '',
    [],
  )

  /** Throw away your unsent draft (and anything half-keyed), keeping the conversation */
  const discardDraft = useCallback(() => {
    clearTimers()
    setSymbol('')
    wordRef.current = ''
    setMessage(messageRef.current.slice(0, draftAnchor.current))
  }, [clearTimers, setMessage, setSymbol])

  // keying no longer possible (power off, tuned off the band): drop the half-keyed letter
  useEffect(() => {
    if (!canKey) {
      clearTimers()
      setSymbol('')
      wordRef.current = ''
    }
  }, [canKey, clearTimers, setSymbol])

  // never leave a timer running after unmount (reads the refs directly, so it
  // runs exactly once, on unmount, whatever happens to callback identities)
  useEffect(
    () => () => {
      if (symbolTimer.current !== null) clearTimeout(symbolTimer.current)
      if (wordTimer.current !== null) clearTimeout(wordTimer.current)
      if (replyTimer.current !== null) clearTimeout(replyTimer.current)
    },
    [],
  )

  /** live (not render-lagged) "another station has the frequency" */
  const receivingNow = useCallback(() => receivingRef.current, [])

  return {
    currentSymbol,
    decodedMessage,
    draftFrom,
    handleTap,
    clear,
    flush,
    receivingNow,
    pendingNow,
    markSent,
    discardDraft,
    isActive: canKey,
    isReceiving,
    simulateReply,
  }
}

/* --- Shared instance ------------------------------------------------------
   The paddles (TelegraphDesk) write and the LCD reads, and they are siblings,
   so one decoder lives in a provider and both read it with useMorseDecoder(). */
const MorseDecoderContext = createContext<MorseDecoderState | null>(null)

interface MorseDecoderProviderProps extends DecoderOptions {
  children?: ReactNode
}

/** localStorage if the browser allows it (it throws in some privacy modes) */
function browserStorage(): StationStorage | undefined {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : undefined
  } catch {
    return undefined
  }
}

/**
 * Must sit inside <RadioProvider>. Taps are keyed (sidetone) and decoded only
 * when the radio is powered and the dial is on a frequency you can transmit
 * on (the ham band or the ghost frequency); the DECODER switch only decides
 * whether the LCD shows the text. Broadcasters are receive-only and dead air
 * has nobody listening; the paddles still move there, but nothing is keyed.
 *
 * When your words go out depends on the DECODER:
 *   - ON (you can read what you keyed): nothing is sent until you press TX
 *     SEND. Finished words wait on the screen as an unsent draft, so a
 *     beginner can check them first (and CLR wipes just the draft).
 *   - OFF (keying by ear, like real CW): each word goes out as soon as you
 *     pause after it. TX SEND still sends at once and ends your over.
 *
 * The far end of every contact lives here too:
 *   - the ham operators (src/utils/stations.ts) hear you tune in, every word
 *     you send, and how long the band has been quiet (polled), and answer;
 *   - 104.40, the ghost: ... CQ -> " I C U " (slow, distorted), then the haunt.
 */
export function MorseDecoderProvider({ children, ...options }: MorseDecoderProviderProps) {
  const { isPowerOn, isDecoderOn, frequency, setIsHaunted } = useRadio()
  const { band, canTransmit } = getBandInfo(frequency)
  const canKey = isPowerOn && canTransmit
  const station = hamStationAt(frequency)

  // one set of operators for the life of the app (each remembers its own QSO)
  const stationsRef = useRef<Record<HamStationId, Station> | null>(null)
  if (stationsRef.current === null) stationsRef.current = createStations({ storage: browserStorage() })
  const stations = stationsRef.current

  const frequencyRef = useRef(frequency)
  frequencyRef.current = frequency
  const replyRef = useRef<MorseDecoderState['simulateReply']>(() => {})

  /** when anyone (you, the far station) last did anything; drives the idle polling */
  const lastActivity = useRef(0)
  const touch = useCallback(() => {
    lastActivity.current = performance.now()
  }, [])

  const transmit = useCallback((t: Transmission | null) => {
    if (t) replyRef.current(t.text, false, t.timing)
  }, [])

  const decoderOnRef = useRef(isDecoderOn)
  decoderOnRef.current = isDecoderOn
  /** words finished with the DECODER ON, waiting for TX SEND */
  const draftWords = useRef<SentWord[]>([])
  /** the engine's markSent (the engine is created below; its callbacks need it) */
  const markSentRef = useRef<() => void>(() => {})

  /**
   * Your words reach the far end, in order. A station answers the first word
   * it has something to say to (the rest of the over is then moot).
   * Returns whether anyone answered.
   */
  const deliver = useCallback(
    (words: readonly SentWord[]) => {
      markSentRef.current()
      if (!words.length) return false
      const f = frequencyRef.current
      if (getBandInfo(f).band === 'ghost') {
        if (!words.some((w) => w.word === 'CQ')) return false
        replyRef.current(GHOST_REPLY, true)
        return true
      }
      const id = hamStationAt(f)
      if (!id) return false
      for (const w of words) {
        const t = stations[id].onWord(w)
        if (t) {
          transmit(t)
          return true
        }
      }
      return false
    },
    [stations, transmit],
  )

  const onWordEnd = useCallback(
    (_message: string, sent: SentWord) => {
      touch()
      if (decoderOnRef.current) {
        draftWords.current.push(sent) // it waits on the screen for TX SEND
        return
      }
      // keying by ear: the word goes out now (with anything still waiting from before)
      deliver(draftWords.current.splice(0).concat(sent))
    },
    [deliver, touch],
  )

  // when the ghost has finished sending (its last letter is "U"), the haunt begins
  const onReplyEnd = useCallback(
    (_message: string, isGhost: boolean) => {
      touch()
      if (isGhost) setIsHaunted(true)
    },
    [setIsHaunted, touch],
  )

  const engine = useMorseDecoderEngine(canKey, options, { onWordEnd, onReplyEnd })
  const { currentSymbol, decodedMessage, draftFrom, isActive, isReceiving, simulateReply, flush, receivingNow, pendingNow } = engine
  replyRef.current = simulateReply
  markSentRef.current = engine.markSent
  /** you have keyed something that hasn't been sent yet */
  const hasDraftNow = useCallback(() => draftWords.current.length > 0 || pendingNow(), [pendingNow])
  const canKeyRef = useRef(canKey)
  canKeyRef.current = canKey

  /* --- TX SEND and the TX annunciator --------------------------------------- */
  const [txStatus, setTxStatus] = useState<TxStatus>('idle')
  /** you keyed something since the frequency last changed hands */
  const keyedSinceOver = useRef(false)
  const txTimer = useRef<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null>(null)
  const stopTxTimer = useCallback(() => {
    if (txTimer.current !== null) {
      clearTimeout(txTimer.current)
      clearInterval(txTimer.current)
    }
    txTimer.current = null
  }, [])
  /** show a short notice (NO REPLY, INHIBIT, ...) then go back to idle */
  const notice = useCallback(
    (status: TxStatus) => {
      stopTxTimer()
      setTxStatus(status)
      txTimer.current = setTimeout(() => {
        txTimer.current = null
        setTxStatus('idle')
      }, TX_NOTICE_MS)
    },
    [stopTxTimer],
  )

  // the far end has started answering: the frequency is theirs now
  useEffect(() => {
    if (isReceiving) keyedSinceOver.current = false
  }, [isReceiving])

  const engineTap = engine.handleTap
  const handleTap = useCallback(
    (type: MorseTap) => {
      touch()
      if (canKeyRef.current && !receivingNow()) keyedSinceOver.current = true
      engineTap(type)
    },
    [engineTap, receivingNow, touch],
  )
  const engineClear = engine.clear
  const clear = useCallback(() => {
    engineClear()
    draftWords.current = []
    keyedSinceOver.current = false
    stopTxTimer()
    setTxStatus('idle')
  }, [engineClear, stopTxTimer])

  const discardDraft = engine.discardDraft
  const clearButton = useCallback(() => {
    if (!receivingNow() && hasDraftNow()) {
      // first press: just your unsent draft goes
      discardDraft()
      draftWords.current = []
      keyedSinceOver.current = false
      stopTxTimer()
      setTxStatus('idle')
      touch()
      return
    }
    clear()
  }, [clear, discardDraft, hasDraftNow, receivingNow, stopTxTimer, touch])

  const sendOver = useCallback(() => {
    touch()
    if (!isPowerOn) return // the LCD is dark (and the Quick Start note explains)
    const f = frequencyRef.current
    if (!getBandInfo(f).canTransmit) return notice('inhibit')
    if (receivingNow()) return notice('busy')
    const flushed = flush() // the half-keyed letter / word is finished now (and joins the draft if the DECODER is ON)
    const words = draftWords.current.splice(0)
    if (!flushed && !words.length && !keyedSinceOver.current) return notice('empty')
    keyedSinceOver.current = false
    const answered = deliver(words)
    // hand it over explicitly (Bob waits for the end of your over)
    const id = hamStationAt(f)
    if (!answered && id && !receivingNow()) transmit(stations[id].onOver?.() ?? null)

    stopTxTimer()
    setTxStatus('sending')
    const started = performance.now()
    txTimer.current = setInterval(() => {
      const elapsed = performance.now() - started
      if (receivingNow() && elapsed >= TX_SENDING_MIN_MS) {
        stopTxTimer()
        setTxStatus('idle') // they're answering: the RX flag takes over
      } else if (!receivingNow() && elapsed >= TX_REPLY_WAIT_MS) {
        notice('no-reply')
      }
    }, 100)
  }, [deliver, flush, isPowerOn, notice, receivingNow, stations, stopTxTimer, touch, transmit])

  useEffect(() => stopTxTimer, [stopTxTimer])

  const status: DecoderStatus = !isPowerOn || !isDecoderOn
    ? 'off'
    : band === 'broadcast'
      ? 'rx-only'
      : band === 'dead'
        ? 'dead-band'
        : 'ready'

  // the buffer is volatile memory: losing power wipes it
  useEffect(() => {
    if (!isPowerOn) clear()
  }, [isPowerOn, clear])

  // retuning lands you in a different conversation: wipe the buffer instantly
  const lastFrequency = useRef(frequency)
  useEffect(() => {
    if (lastFrequency.current === frequency) return
    lastFrequency.current = frequency
    clear()
  }, [frequency, clear])

  // tuning in (or powering up) on an operator's frequency: they notice you
  // (runs after the wipe above: effects run in order)
  useEffect(() => {
    touch()
    if (!isPowerOn || station === null) return
    transmit(stations[station].onTuneIn())
  }, [frequency, isPowerOn, station, stations, touch, transmit])

  // a quiet band: operators call CQ, nudge you, or start the next bulletin
  useEffect(() => {
    if (!isPowerOn || station === null) return
    const op = stations[station]
    const timer = setInterval(() => {
      // never talk over someone, or over a draft you're still checking
      if (receivingNow() || hasDraftNow()) return
      const t = op.onIdle(performance.now() - lastActivity.current)
      if (t) {
        touch()
        transmit(t)
      }
    }, IDLE_POLL_MS)
    return () => clearInterval(timer)
  }, [hasDraftNow, isPowerOn, receivingNow, station, stations, touch, transmit])

  const value = useMemo<MorseDecoderState>(
    () => ({ currentSymbol, decodedMessage, draftFrom, handleTap, clear, clearButton, sendOver, txStatus, isActive, isReceiving, simulateReply, band, station, status }),
    [currentSymbol, decodedMessage, draftFrom, handleTap, clear, clearButton, sendOver, txStatus, isActive, isReceiving, simulateReply, band, station, status],
  )
  return createElement(MorseDecoderContext.Provider, { value }, children)
}

/** Read and drive the shared Morse decoder. Must be used inside <MorseDecoderProvider>. */
export function useMorseDecoder(): MorseDecoderState {
  const ctx = useContext(MorseDecoderContext)
  if (!ctx) throw new Error('useMorseDecoder() must be used inside <MorseDecoderProvider>')
  return ctx
}
