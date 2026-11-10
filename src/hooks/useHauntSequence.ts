import { useEffect, useRef, useState } from 'react'
import { playBreakerThunk, playHauntBang, playHauntBuild, setHauntSilence } from '../utils/audioEngine'

/**
 * The climax, once the ghost strikes (isHaunted):
 *
 *   build      2.6 s    it comes up through the set: the lamp flickers faster
 *                       and faster (5 dips, 800 -> 360 ms apart), a face is
 *                       half-seen in the LCD on the last dips, and a roar
 *                       rises under it... and is cut dead
 *   blackout   800 ms   everything goes black and dead silent
 *   flash      ~700 ms  ONE blinding white flash: a face lunges out of it,
 *                       with the metallic BANG and the 2 kHz feedback screech;
 *                       the chassis jolts and the reference card is blown out
 *   corrupt    ~3.3 s   the LCD is shattered and bleeds black liquid crystal:
 *                       spreading pools with oily rainbow edges, dead pixel
 *                       lines, black fluid leaking out under the bezel down
 *                       the chassis; the serial plate reads SER: D34D-S0UL
 *   the trip   at 4 s   exactly 4 s after the flash, as the screech dies, the
 *                       breaker trips itself OFF (it stays down) and the radio
 *                       resets: a fresh session for when you switch it back on
 *
 * Photosensitivity (WCAG 2.3.1): the build's dips are low-contrast (the lamp
 * dims; it never goes white) and never more than 3 in any second; the flash
 * is a single one. With prefers-reduced-motion the build is a slow dim, the
 * flash a soft fade with no lunge or shake (App.css / LCDDisplay.css).
 */
export type HauntPhase = 'none' | 'build' | 'blackout' | 'flash' | 'corrupt'

export const HAUNT_BUILD_MS = 2600
export const HAUNT_BLACKOUT_MS = 800
export const HAUNT_FLASH_MS = 700
/** from the flash to the breaker tripping itself (the screech lasts as long) */
export const HAUNT_TRIP_AFTER_FLASH_MS = 4000
/** the build's lamp dips, ms from its start (KEEP IN SYNC with @keyframes haunt-build in App.css) */
export const HAUNT_BUILD_DIPS_MS: readonly number[] = Object.freeze([0, 800, 1400, 1850, 2210])

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
    const vibrate = (p: number | number[]) => {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(p)
    }
    setPhase('build')
    playHauntBuild()
    const flashAt = HAUNT_BUILD_MS + HAUNT_BLACKOUT_MS
    const timers = [
      setTimeout(() => {
        setPhase('blackout')
        setHauntSilence(true)
      }, HAUNT_BUILD_MS),
      setTimeout(() => {
        setPhase('flash')
        playHauntBang()
        vibrate([90, 40, 220])
        onEjectRef.current() // the card is blown out of its slot by the blast
      }, flashAt),
      setTimeout(() => setPhase('corrupt'), flashAt + HAUNT_FLASH_MS),
      setTimeout(() => {
        playBreakerThunk(false) // the breaker snaps itself down
        vibrate(120)
        onTripRef.current()
      }, flashAt + HAUNT_TRIP_AFTER_FLASH_MS),
    ]
    return () => {
      timers.forEach(clearTimeout)
      setHauntSilence(false)
    }
  }, [isHaunted])

  return phase
}
