import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { decodeSymbol } from '../utils/morseDictionary'
import { playTone } from '../utils/audioEngine'
import { useRadio } from '../context/RadioContext'
import { getBandInfo } from '../constants'
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
function useMorseDecoderEngine(
  canKey: boolean,
  isActive: boolean,
  { symbolTimeoutMs = SYMBOL_TIMEOUT_MS, wordTimeoutMs = WORD_TIMEOUT_MS }: DecoderOptions,
): Omit<MorseDecoderState, 'band' | 'status'> {
  const [currentSymbol, setCurrentSymbol] = useState('')
  const [decodedMessage, setDecodedMessage] = useState('')

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

  /** End of letter: decode the pending symbol */
  const commitSymbol = useCallback(() => {
    symbolTimer.current = null
    const code = symbolRef.current
    if (!code) return
    const ch = decodeSymbol(code) ?? UNKNOWN_CHAR
    setSymbol('')
    setDecodedMessage((msg) => trimHistory(msg + ch))
  }, [setSymbol])

  /** End of word: one space, never leading and never doubled */
  const commitWord = useCallback(() => {
    wordTimer.current = null
    setDecodedMessage((msg) => (msg === '' || msg.endsWith(' ') ? msg : trimHistory(msg + ' ')))
  }, [])

  const handleTap = useCallback(
    (type: MorseTap) => {
      if (type !== '.' && type !== '-') return
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
    clearTimers()
    setSymbol('')
    setDecodedMessage('')
  }, [clearTimers, setSymbol])

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
    },
    [],
  )

  return { currentSymbol, decodedMessage, handleTap, clear, isActive }
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
  const { isPowerOn, isDecoderOn, frequency } = useRadio()
  const { band, canTransmit } = getBandInfo(frequency)
  const canKey = isPowerOn && canTransmit
  const { currentSymbol, decodedMessage, handleTap, clear, isActive } = useMorseDecoderEngine(
    canKey,
    canKey && isDecoderOn,
    options,
  )

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
    () => ({ currentSymbol, decodedMessage, handleTap, clear, isActive, band, status }),
    [currentSymbol, decodedMessage, handleTap, clear, isActive, band, status],
  )
  return createElement(MorseDecoderContext.Provider, { value }, children)
}

/** Read and drive the shared Morse decoder. Must be used inside <MorseDecoderProvider>. */
export function useMorseDecoder(): MorseDecoderState {
  const ctx = useContext(MorseDecoderContext)
  if (!ctx) throw new Error('useMorseDecoder() must be used inside <MorseDecoderProvider>')
  return ctx
}
