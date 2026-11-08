import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { decodeSymbol } from '../utils/morseDictionary'
import { useRadio } from '../context/RadioContext'

/* --- Timing ---------------------------------------------------------------
   Gaps are measured from the most recent tap. They are deliberately longer
   than strict Morse timing so a beginner tapping on a touchscreen still gets
   clean letters. */
export const SYMBOL_TIMEOUT_MS = 600 // silence that ends a letter
export const WORD_TIMEOUT_MS = 1400 // silence that ends a word
export const UNKNOWN_CHAR = '?'
/** Longest code worth collecting; anything longer can never decode */
const MAX_SYMBOL_LENGTH = 7
/** Characters of history to keep; the LCD only shows the newest ~25 */
const MAX_MESSAGE_LENGTH = 160

export type MorseTap = '.' | '-'

export interface MorseDecoderState {
  /** Dits and dahs of the letter currently being keyed, e.g. ".-" */
  currentSymbol: string
  /** Everything decoded so far */
  decodedMessage: string
  /** Record a paddle tap. Ignored unless the radio is powered and the DECODER is ON. */
  handleTap: (type: MorseTap) => void
  /** Wipe the buffer and anything in progress (the CLR button) */
  clear: () => void
  /** True when taps are being decoded (power ON and DECODER ON) */
  isActive: boolean
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
 */
function useMorseDecoderEngine(
  isActive: boolean,
  { symbolTimeoutMs = SYMBOL_TIMEOUT_MS, wordTimeoutMs = WORD_TIMEOUT_MS }: DecoderOptions,
): MorseDecoderState {
  const [currentSymbol, setCurrentSymbol] = useState('')
  const [decodedMessage, setDecodedMessage] = useState('')

  const symbolRef = useRef('')
  const symbolTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wordTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(isActive)

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
      if (!activeRef.current) return
      if (type !== '.' && type !== '-') return
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

/** Must sit inside <RadioProvider>: decoding needs power and the DECODER switch. */
export function MorseDecoderProvider({ children, ...options }: MorseDecoderProviderProps) {
  const { isPowerOn, isDecoderOn } = useRadio()
  const { currentSymbol, decodedMessage, handleTap, clear, isActive } = useMorseDecoderEngine(
    isPowerOn && isDecoderOn,
    options,
  )

  // the buffer is volatile memory: losing power wipes it
  useEffect(() => {
    if (!isPowerOn) clear()
  }, [isPowerOn, clear])

  const value = useMemo<MorseDecoderState>(
    () => ({ currentSymbol, decodedMessage, handleTap, clear, isActive }),
    [currentSymbol, decodedMessage, handleTap, clear, isActive],
  )
  return createElement(MorseDecoderContext.Provider, { value }, children)
}

/** Read and drive the shared Morse decoder. Must be used inside <MorseDecoderProvider>. */
export function useMorseDecoder(): MorseDecoderState {
  const ctx = useContext(MorseDecoderContext)
  if (!ctx) throw new Error('useMorseDecoder() must be used inside <MorseDecoderProvider>')
  return ctx
}
