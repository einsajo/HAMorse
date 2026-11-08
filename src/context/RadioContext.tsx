import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

/* --- Band limits ---------------------------------------------------------- */
export const FREQ_MIN = 88.0
export const FREQ_MAX = 108.0
/**
 * Power-on frequency: a dead spot near the bottom of the band, well clear of
 * the ghost station's capture zone, so the player has to physically search
 * the dial to find the signal. Always passed through clampFrequency().
 */
export const FREQ_DEFAULT = 88.5
/** The haunted station: the S-meter pins here and the tuning dial has a detent */
export const GHOST_FREQUENCY = 104.4

/** True when `mhz` is exactly `target` at the radio's 0.01 MHz resolution */
export function isTunedTo(mhz: number, target: number): boolean {
  return Math.abs(mhz - target) < 0.005
}

/** Clamp to the 88.00 - 108.00 MHz band and snap to the 0.01 MHz display step. */
export function clampFrequency(mhz: number): number {
  if (!Number.isFinite(mhz)) return FREQ_DEFAULT
  const clamped = Math.min(FREQ_MAX, Math.max(FREQ_MIN, mhz))
  return Math.round(clamped * 100) / 100
}

if (import.meta.env.DEV && clampFrequency(FREQ_DEFAULT) !== FREQ_DEFAULT) {
  console.warn(`FREQ_DEFAULT ${FREQ_DEFAULT} is outside ${FREQ_MIN}-${FREQ_MAX} MHz; it will be clamped.`)
}

/** Always two decimal places, e.g. 104.40 */
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
  /** Set the frequency; out-of-band values are clamped, non-finite values ignored */
  setFrequency: (mhz: number | ((prev: number) => number)) => void
  setIsPowerOn: (on: boolean) => void
  setIsDecoderOn: (on: boolean) => void
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

  const setFrequency = useCallback<RadioState['setFrequency']>((next) => {
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
      setFrequency,
      setIsPowerOn,
      setIsDecoderOn,
      togglePower,
      toggleDecoder,
    }),
    [frequency, isPowerOn, isDecoderOn, setFrequency, togglePower, toggleDecoder],
  )

  return <RadioContext.Provider value={value}>{children}</RadioContext.Provider>
}

/** Access the radio's global state. Must be used inside <RadioProvider>. */
export function useRadio(): RadioState {
  const ctx = useContext(RadioContext)
  if (!ctx) throw new Error('useRadio() must be used inside <RadioProvider>')
  return ctx
}
