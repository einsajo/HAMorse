import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CHAR_TO_MORSE, decodeSymbol } from '../utils/morseDictionary'
import { playGhostTone, playTone } from '../utils/audioEngine'
import { useRadio } from '../context/RadioContext'
import { TUTOR_FREQUENCY, getBandInfo, isTunedTo } from '../constants'
import type { Band } from '../constants'

/* --- Timing ---------------------------------------------------------------
   Gaps are measured from the most recent tap. They are deliberately longer
   than strict Morse timing so a beginner tapping on a touchscreen still gets
   clean letters. */
export const SYMBOL_TIMEOUT_MS = 600 // silence that ends a letter
export const WORD_TIMEOUT_MS = 1400 // silence that ends a word
export const UNKNOWN_CHAR = '?'
/** Sidetone lengths: a dah is three dits, as in real Morse */
export const DIT_TONE_MS = 60
export const DAH_TONE_MS = 180
/** Longest code worth collecting; anything longer can never decode */
const MAX_SYMBOL_LENGTH = 7
/** Characters of history to keep; the LCD only shows the newest ~25 */
const MAX_MESSAGE_LENGTH = 160

/* --- Incoming transmissions -----------------------------------------------
   Replies are keyed element by element with real Morse timing, so you HEAR
   every dit and dah and see it build up on the LCD before the letter lands.
   `charGapMs` is the pause between characters (the "speed per char").       */
export interface ReplyTiming {
  /** silence before the other station starts sending */
  leadInMs: number
  ditMs: number
  dahMs: number
  /** silence between the elements of one character */
  elementGapMs: number
  /** silence between characters */
  charGapMs: number
  /** silence between words */
  wordGapMs: number
}

/** A friendly operator: brisk, clean 700 Hz */
export const REPLY_TIMING: Readonly<ReplyTiming> = Object.freeze({
  leadInMs: 700,
  ditMs: DIT_TONE_MS,
  dahMs: DAH_TONE_MS,
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

/** Scripted QSOs (conversations) */
export const TUTOR_REPLIES = Object.freeze({ afterHi: 'GUD COPY. SEND SOS ', afterSos: 'FB. 73. ' })
export const GHOST_REPLY = ' I C U '

/** True when the last whole word of `message` is `word` (so "CHI " is not "HI ") */
const lastWordIs = (message: string, word: string) => new RegExp(`(^|\\s)${word} $`).test(message)

export type MorseTap = '.' | '-'

/**
 * What the decoder is doing, for the LCD:
 *   off        power or DECODER is OFF: show nothing
 *   rx-only    on a broadcaster: you can listen but not transmit
 *   dead-band  dead air: nobody to talk to
 *   ready      ham band or the ghost frequency: taps are decoded
 */
export type DecoderStatus = 'off' | 'rx-only' | 'dead-band' | 'ready'

export interface MorseDecoderState {
  /** Dits and dahs of the letter currently being keyed, e.g. ".-" */
  currentSymbol: string
  /** Everything decoded so far */
  decodedMessage: string
  /**
   * Record a paddle tap. On a transmit frequency with the power ON it always
   * sounds the 700 Hz sidetone; it is decoded only when the DECODER is ON too.
   */
  handleTap: (type: MorseTap) => void
  /** Wipe the buffer and anything in progress (the CLR button) */
  clear: () => void
  /** True when taps are being decoded (power ON, DECODER ON, ham band or ghost frequency) */
  isActive: boolean
  /** Another station is sending: the paddles are locked out until it finishes */
  isReceiving: boolean
  /**
   * Play an incoming transmission: each character is keyed out loud
   * (dits and dahs), shown live on the LCD, then appended to the message.
   * `isGhost` = slow, distorted. Interrupted by CLR, retuning or power off.
   */
  simulateReply: (message: string, isGhost: boolean) => void
  /** Band the radio is tuned to */
  band: Band
  /** Decoder state for the LCD status line */
  status: DecoderStatus
}

interface DecoderOptions {
  symbolTimeoutMs?: number
  wordTimeoutMs?: number
}

const trimHistory = (text: string) => (text.length > MAX_MESSAGE_LENGTH ? text.slice(-MAX_MESSAGE_LENGTH) : text)

/**
 * The decoder engine. Every tap appends to `currentSymbol` and restarts two
 * timers: after `symbolTimeoutMs` of silence the symbol is looked up in the
 * Morse dictionary and its character (or `?`) is appended to
 * `decodedMessage`; after `wordTimeoutMs` of silence a word space is added.
 *
 * The symbol lives in a ref as well as in state, so the timers always read
 * the latest value without being recreated on every render.
 *
 * `canKey`: the rig can transmit here (power ON, ham band or ghost), so a tap
 * sounds the sidetone. `isActive`: canKey and the DECODER is ON, so the tap is
 * also decoded. Keying with the DECODER OFF is how practised operators train
 * by ear.
 */
interface EngineCallbacks {
  /** the user finished a word (word timeout); receives the whole message */
  onWordEnd?: (message: string) => void
  /** an incoming transmission finished sending */
  onReplyEnd?: (message: string, isGhost: boolean) => void
}

function useMorseDecoderEngine(
  canKey: boolean,
  isActive: boolean,
  { symbolTimeoutMs = SYMBOL_TIMEOUT_MS, wordTimeoutMs = WORD_TIMEOUT_MS }: DecoderOptions,
  callbacks: EngineCallbacks = {},
): Omit<MorseDecoderState, 'band' | 'status'> {
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
  const activeRef = useRef(isActive)
  const canKeyRef = useRef(canKey)
  canKeyRef.current = canKey

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

  const setMessage = useCallback((value: string) => {
    const next = trimHistory(value)
    messageRef.current = next
    setDecodedMessage(next)
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
    setMessage(messageRef.current + ch)
  }, [setSymbol, setMessage])

  /** End of word: one space, never leading and never doubled; then let the far station react */
  const commitWord = useCallback(() => {
    wordTimer.current = null
    appendSpace()
    callbacksRef.current.onWordEnd?.(messageRef.current)
  }, [appendSpace])

  /** The auto-typer: recursive setTimeouts, one per element / gap */
  const simulateReply = useCallback(
    (message: string, isGhost: boolean) => {
      stopReply()
      clearTimers()
      setSymbol('')
      receivingRef.current = true
      setIsReceiving(true)

      const t = isGhost ? GHOST_TIMING : REPLY_TIMING
      const tone = isGhost ? playGhostTone : playTone
      const chars = [...message.toUpperCase()]
      let i = 0

      const schedule = (fn: () => void, ms: number) => {
        replyTimer.current = setTimeout(fn, ms)
      }

      const nextChar = () => {
        if (i >= chars.length) {
          stopReply()
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

      schedule(nextChar, t.leadInMs)
    },
    [appendSpace, clearTimers, setMessage, setSymbol, stopReply],
  )

  const handleTap = useCallback(
    (type: MorseTap) => {
      if (type !== '.' && type !== '-') return
      if (receivingRef.current) return // the other station has the frequency: wait your turn
      if (!canKeyRef.current) return // dead radio, broadcaster or dead air: nothing keyed
      playTone(type === '.' ? DIT_TONE_MS : DAH_TONE_MS)
      if (!activeRef.current) return // DECODER OFF: sidetone only
      clearTimers()
      // a symbol longer than any real code can never decode: commit it as '?' and start over
      if (symbolRef.current.length >= MAX_SYMBOL_LENGTH) commitSymbol()
      setSymbol(symbolRef.current + type)
      symbolTimer.current = setTimeout(commitSymbol, symbolTimeoutMs)
      wordTimer.current = setTimeout(commitWord, wordTimeoutMs)
    },
    [clearTimers, commitSymbol, commitWord, setSymbol, symbolTimeoutMs, wordTimeoutMs],
  )

  const clear = useCallback(() => {
    stopReply()
    clearTimers()
    setSymbol('')
    setMessage('')
  }, [clearTimers, setMessage, setSymbol, stopReply])

  // DECODER (or power) switched off: drop the half-keyed letter and stop the timers
  useEffect(() => {
    activeRef.current = isActive
    if (!isActive) {
      clearTimers()
      setSymbol('')
    }
  }, [isActive, clearTimers, setSymbol])

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

  return { currentSymbol, decodedMessage, handleTap, clear, isActive, isReceiving, simulateReply }
}

/* --- Shared instance ------------------------------------------------------
   The paddles (TelegraphDesk) write and the LCD reads, and they are siblings,
   so one decoder lives in a provider and both read it with useMorseDecoder(). */
const MorseDecoderContext = createContext<MorseDecoderState | null>(null)

interface MorseDecoderProviderProps extends DecoderOptions {
  children?: ReactNode
}

/**
 * Must sit inside <RadioProvider>. Taps are keyed (sidetone) only when the
 * radio is powered and the dial is on a frequency you can transmit on (the
 * ham band or the ghost frequency), and decoded only if the DECODER is ON too.
 * Broadcasters are receive-only and dead air has nobody listening; the
 * paddles still move there, but nothing is keyed.
 */
export function MorseDecoderProvider({ children, ...options }: MorseDecoderProviderProps) {
  const { isPowerOn, isDecoderOn, frequency, setIsHaunted } = useRadio()
  const { band, canTransmit } = getBandInfo(frequency)
  const canKey = isPowerOn && canTransmit

  const frequencyRef = useRef(frequency)
  frequencyRef.current = frequency
  const replyRef = useRef<(message: string, isGhost: boolean) => void>(() => {})

  /*
   * The stations listening on the band. They react when you finish a word:
   *   101.00 tutor:  ... HI   -> "GUD COPY. SEND SOS"
   *                  ... SOS  -> "FB. 73."   (fine business, best regards)
   *   104.40 ghost:  ... CQ   -> " I C U "   (slow, distorted)
   */
  const onWordEnd = useCallback((message: string) => {
    const f = frequencyRef.current
    if (isTunedTo(f, TUTOR_FREQUENCY)) {
      if (lastWordIs(message, 'HI')) replyRef.current(TUTOR_REPLIES.afterHi, false)
      else if (lastWordIs(message, 'SOS')) replyRef.current(TUTOR_REPLIES.afterSos, false)
    } else if (getBandInfo(f).band === 'ghost' && lastWordIs(message, 'CQ')) {
      replyRef.current(GHOST_REPLY, true)
    }
  }, [])

  // when the ghost has finished sending (its last letter is "U"), the haunt begins
  const onReplyEnd = useCallback(
    (_message: string, isGhost: boolean) => {
      if (isGhost) setIsHaunted(true)
    },
    [setIsHaunted],
  )

  const { currentSymbol, decodedMessage, handleTap, clear, isActive, isReceiving, simulateReply } =
    useMorseDecoderEngine(canKey, canKey && isDecoderOn, options, { onWordEnd, onReplyEnd })
  replyRef.current = simulateReply

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

  const value = useMemo<MorseDecoderState>(
    () => ({ currentSymbol, decodedMessage, handleTap, clear, isActive, isReceiving, simulateReply, band, status }),
    [currentSymbol, decodedMessage, handleTap, clear, isActive, isReceiving, simulateReply, band, status],
  )
  return createElement(MorseDecoderContext.Provider, { value }, children)
}

/** Read and drive the shared Morse decoder. Must be used inside <MorseDecoderProvider>. */
export function useMorseDecoder(): MorseDecoderState {
  const ctx = useContext(MorseDecoderContext)
  if (!ctx) throw new Error('useMorseDecoder() must be used inside <MorseDecoderProvider>')
  return ctx
}
