import { useEffect, useRef, useState } from 'react'
import { playHauntBang, setHauntSilence } from '../utils/audioEngine'

/**
 * The climax, once the ghost strikes (isHaunted):
 *
 *   blackout   800 ms   everything goes black and dead silent
 *   flash      ~700 ms  ONE blinding white flash, fading, with the metallic
 *                       BANG and the 2 kHz feedback screech
 *   corrupt    stays    the LCD burns a corrupted dark red, its glass is
 *                       shattered, black liquid crawls down it, and the
 *                       reference card is forced out of its slot
 *
 * A single flash (never repeated) keeps well inside the photosensitive-safety
 * limit of 3 flashes a second; with prefers-reduced-motion it is a dimmer,
 * slower fade (see App.css).
 */
export type HauntPhase = 'none' | 'blackout' | 'flash' | 'corrupt'

export const HAUNT_BLACKOUT_MS = 800
export const HAUNT_FLASH_MS = 700

export function useHauntSequence(isHaunted: boolean, onEject: () => void): HauntPhase {
  const [phase, setPhase] = useState<HauntPhase>('none')
  const onEjectRef = useRef(onEject)
  onEjectRef.current = onEject

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
    return () => {
      clearTimeout(flash)
      clearTimeout(corrupt)
      setHauntSilence(false)
    }
  }, [isHaunted])

  return phase
}
