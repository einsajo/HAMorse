import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { DIAL_MAX_MHZ, DIAL_MIN_MHZ, DIAL_START_MHZ, reseedGhostFrequency } from '../constants'

/* --- Band limits ---------------------------------------------------------- */
export const FREQ_MIN = DIAL_MIN_MHZ
export const FREQ_MAX = DIAL_MAX_MHZ
/**
 * Power-on frequency: a dead spot near the bottom of the band, well clear of
 * the ghost's drone (see GHOST_START_BUFFER_MHZ), so the player has to physically search
 * the dial to find the signal. Always passed through clampFrequency().
 */
export const FREQ_DEFAULT = DIAL_START_MHZ
// band layout (stations, ham band, ghost) lives in src/constants.ts; re-exported for convenience
export { getGhostFrequency, isTunedTo } from '../constants'

/** Clamp to the 88.00 - 108.00 MHz band and snap to the 0.01 MHz display step. */
export function clampFrequency(mhz: number): number {
  if (!Number.isFinite(mhz)) return FREQ_DEFAULT
  const clamped = Math.min(FREQ_MAX, Math.max(FREQ_MIN, mhz))
  return Math.round(clamped * 100) / 100
}

if (import.meta.env.DEV && clampFrequency(FREQ_DEFAULT) !== FREQ_DEFAULT) {
  console.warn(`FREQ_DEFAULT ${FREQ_DEFAULT} is outside ${FREQ_MIN}-${FREQ_MAX} MHz; it will be clamped.`)
}

/** Always two decimal places, e.g. 104.45 */
export function formatFrequency(mhz: number): string {
  return clampFrequency(mhz).toFixed(2)
}

/* --- Context -------------------------------------------------------------- */
export interface RadioState {
  /** MHz, always within FREQ_MIN..FREQ_MAX and rounded to 0.01 */
  frequency: number
  /** MAIN POWER MCB breaker */
  isPowerOn: boolean
  /** DECODER slide switch */
  isDecoderOn: boolean
  /** The ghost has struck: the climax (blackout, flash, corrupted LCD) */
  isHaunted: boolean
  /**
   * The ghost has you: set after your first exchange with it. The VFO no
   * longer changes the frequency (setFrequency refuses), and the breaker
   * won't stay off.
   */
  isTrapped: boolean
  /** The latest time the operator fought the trap (the ghost answers it): power or dial, and a counter */
  resistance: { kind: 'power' | 'dial'; n: number } | null
  /** The breaker was slammed back on, or the dial was forced: the ghost hears about it */
  reportResistance: (kind: 'power' | 'dial') => void
  /**
   * Which session this is: bumped by every hard reset, so everything rolled
   * per session (the ghost's frequency, the agents' personas) is rolled anew
   */
  sessionId: number
  /** Set the frequency; out-of-band values are clamped, non-finite values ignored */
  setFrequency: (mhz: number | ((prev: number) => number)) => void
  setIsPowerOn: (on: boolean) => void
  setIsDecoderOn: (on: boolean) => void
  setIsHaunted: (haunted: boolean) => void
  setIsTrapped: (trapped: boolean) => void
  /**
   * The haunt's hard reset (the breaker trips): power OFF (it stays off),
   * haunted / trapped wiped, the dial back at FREQ_DEFAULT, the ghost moved
   * somewhere new, a new session (new personas). Switching back on boots fresh.
   */
  hardReset: () => void
  togglePower: () => void
  toggleDecoder: () => void
}

const RadioContext = createContext<RadioState | null>(null)

interface RadioProviderProps {
  children: ReactNode
  initialFrequency?: number
}

export function RadioProvider({ children, initialFrequency = FREQ_DEFAULT }: RadioProviderProps) {
  const [frequency, setFrequencyRaw] = useState(() => clampFrequency(initialFrequency))
  const [isPowerOn, setIsPowerOn] = useState(false)
  const [isDecoderOn, setIsDecoderOn] = useState(false)
  const [isHaunted, setIsHaunted] = useState(false)
  const [isTrapped, setIsTrappedState] = useState(false)
  // read synchronously by setFrequency, so a drag can't slip a change in before a re-render
  const trappedRef = useRef(false)
  const setIsTrapped = useCallback((trapped: boolean) => {
    trappedRef.current = trapped
    setIsTrappedState(trapped)
  }, [])

  const [sessionId, setSessionId] = useState(0)
  const [resistance, setResistance] = useState<RadioState['resistance']>(null)
  const reportResistance = useCallback((kind: 'power' | 'dial') => {
    if (!trappedRef.current) return
    setResistance((r) => ({ kind, n: (r?.n ?? 0) + 1 }))
  }, [])
  const hardReset = useCallback(() => {
    trappedRef.current = false
    setIsTrappedState(false)
    setIsHaunted(false)
    setIsPowerOn(false)
    setFrequencyRaw(clampFrequency(FREQ_DEFAULT))
    reseedGhostFrequency()
    setSessionId((n) => n + 1)
  }, [])

  const setFrequency = useCallback<RadioState['setFrequency']>((next) => {
    if (trappedRef.current) return // locked on the ghost: the dial turns, nothing changes
    setFrequencyRaw((prev) => {
      const mhz = typeof next === 'function' ? next(prev) : next
      return Number.isFinite(mhz) ? clampFrequency(mhz) : prev // ignore NaN / Infinity
    })
  }, [])
  const togglePower = useCallback(() => setIsPowerOn((v) => !v), [])
  const toggleDecoder = useCallback(() => setIsDecoderOn((v) => !v), [])

  const value = useMemo<RadioState>(
    () => ({
      frequency,
      isPowerOn,
      isDecoderOn,
      isHaunted,
      isTrapped,
      sessionId,
      resistance,
      reportResistance,
      setFrequency,
      setIsPowerOn,
      setIsDecoderOn,
      setIsHaunted,
      setIsTrapped,
      hardReset,
      togglePower,
      toggleDecoder,
    }),
    [frequency, isPowerOn, isDecoderOn, isHaunted, isTrapped, sessionId, resistance, reportResistance, setFrequency, setIsTrapped, hardReset, togglePower, toggleDecoder],
  )

  return <RadioContext.Provider value={value}>{children}</RadioContext.Provider>
}

/** Access the radio's global state. Must be used inside <RadioProvider>. */
export function useRadio(): RadioState {
  const ctx = useContext(RadioContext)
  if (!ctx) throw new Error('useRadio() must be used inside <RadioProvider>')
  return ctx
}
