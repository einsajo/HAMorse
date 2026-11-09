import { useEffect, useRef, useState } from 'react'
import { playBreakerThunk, playHauntBang, setHauntSilence } from '../utils/audioEngine'

/**
 * The climax, once the ghost strikes (isHaunted):
 *
 *   blackout   800 ms   everything goes black and dead silent
 *   flash      ~700 ms  ONE blinding white flash, fading, with the metallic
 *                       BANG and the 2 kHz feedback screech
 *   corrupt    ~3.3 s   the LCD burns a corrupted dark red, its glass is
 *                       shattered, black liquid crawls down it, the
 *                       reference card is forced out of its slot, and the
 *                       serial plate reads SER: D34D-S0UL (from the flash)
 *   the trip   at 4 s   exactly 4 s after the flash, as the screech dies, the
 *                       breaker trips itself OFF (it snaps down, and stays
 *                       down) and the radio resets: haunt and trap wiped,
 *                       a fresh session (88.50, a new ghost, new personas)
 *                       for when you switch it back on
 *
 * A single flash (never repeated) keeps well inside the photosensitive-safety
 * limit of 3 flashes a second; with prefers-reduced-motion it is a dimmer,
 * slower fade (see App.css).
 */
export type HauntPhase = 'none' | 'blackout' | 'flash' | 'corrupt'

export const HAUNT_BLACKOUT_MS = 800
export const HAUNT_FLASH_MS = 700
/** from the flash to the breaker tripping itself (the screech lasts as long) */
export const HAUNT_TRIP_AFTER_FLASH_MS = 4000

export function useHauntSequence(isHaunted: boolean, onEject: () => void, onTrip: () => void): HauntPhase {
  const [phase, setPhase] = useState<HauntPhase>('none')
  const onEjectRef = useRef(onEject)
  onEjectRef.current = onEject
  const onTripRef = useRef(onTrip)
  onTripRef.current = onTrip

  useEffect(() => {
    if (!isHaunted) {
      setPhase('none')
      return
    }
    setPhase('blackout')
    setHauntSilence(true)
    const flash = setTimeout(() => {
      setPhase('flash')
      playHauntBang()
      onEjectRef.current() // the card is blown out of its slot by the blast
    }, HAUNT_BLACKOUT_MS)
    const corrupt = setTimeout(() => setPhase('corrupt'), HAUNT_BLACKOUT_MS + HAUNT_FLASH_MS)
    const trip = setTimeout(() => {
      playBreakerThunk(false) // the breaker snaps itself down
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(120)
      onTripRef.current()
    }, HAUNT_BLACKOUT_MS + HAUNT_TRIP_AFTER_FLASH_MS)
    return () => {
      clearTimeout(flash)
      clearTimeout(corrupt)
      clearTimeout(trip)
      setHauntSilence(false)
    }
  }, [isHaunted])

  return phase
}
