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
 *   jumpscare  1 s      out of the black a grinning face lunges at you, lit
 *                       for an instant as if by a camera flash, with the
 *                       sting (impact, shrieking string stabs, a scream, the
 *                       feedback howl); the chassis jolts, the card is blown
 *                       out, and the phone buzzes hard
 *   corrupt    ~3.3 s   the LCD is shattered and bleeds black liquid crystal:
 *                       spreading pools with oily rainbow edges, dead pixel
 *                       lines, black fluid leaking out under the bezel down
 *                       the chassis; the serial plate reads SER: D34D-S0UL
 *   frozen     10 s     everything stops on its frame, in total silence; the
 *                       radio ignores you. You wonder if it is over.
 *   the trip   at 14 s  the breaker snaps itself OFF, loud, out of the silence
 *                       (it stays down) and the radio resets: a fresh session
 *                       for when you switch it back on
 *
 * Photosensitivity (WCAG 2.3.1): the build's dips are low-contrast (the lamp
 * dims; it never goes white) and never more than 3 in any second; the flash
 * is a single one. With prefers-reduced-motion the build is a slow dim, the
 * flash a soft fade with no lunge or shake (App.css / LCDDisplay.css).
 */
export type HauntPhase = 'none' | 'build' | 'blackout' | 'flash' | 'corrupt' | 'frozen'

export const HAUNT_BUILD_MS = 2600
export const HAUNT_BLACKOUT_MS = 800
export const HAUNT_FLASH_MS = 1000
/** from the jumpscare to the freeze (the sting has died away by then) */
export const HAUNT_FREEZE_AFTER_FLASH_MS = 4000
/** how long it stays frozen and silent before the breaker trips */
export const HAUNT_FREEZE_MS = 10000
/** from the jumpscare to the breaker tripping itself */
export const HAUNT_TRIP_AFTER_FLASH_MS = HAUNT_FREEZE_AFTER_FLASH_MS + HAUNT_FREEZE_MS
/** the phone's heartbeat during the build-up: thump-thump, faster and faster */
export const HEARTBEAT_VIBRATION: readonly number[] = Object.freeze([60, 140, 60, 560, 60, 120, 60, 400, 60, 100, 60, 260, 60, 80, 60, 160, 60, 70, 60])
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
    vibrate([...HEARTBEAT_VIBRATION])
    const flashAt = HAUNT_BUILD_MS + HAUNT_BLACKOUT_MS
    const timers = [
      setTimeout(() => {
        setPhase('blackout')
        setHauntSilence(true)
      }, HAUNT_BUILD_MS),
      setTimeout(() => {
        setPhase('flash')
        playHauntBang()
        vibrate([120, 50, 320, 60, 500])
        onEjectRef.current() // the card is blown out of its slot by the blast
      }, flashAt),
      setTimeout(() => setPhase('corrupt'), flashAt + HAUNT_FLASH_MS),
      setTimeout(() => {
        setPhase('frozen') // it stops. Everything. Silence.
        setHauntSilence(true)
      }, flashAt + HAUNT_FREEZE_AFTER_FLASH_MS),
      setTimeout(() => {
        setHauntSilence(false)
        playBreakerThunk(false) // the breaker snaps itself down, out of the silence
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
