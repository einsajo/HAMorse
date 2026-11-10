import { useEffect, useRef, useState } from 'react'
import { playGlitchZap } from '../utils/audioEngine'

/**
 * The radio misbehaving while the ghost is near: the glitches *between* its
 * transmissions. They get closer together and nastier the further the haunt
 * has gone (`dread` = how many times the ghost has spoken):
 *
 *   dread 0  (tuned to it, nothing said yet)  a rare brown-out: the lamp sags
 *   dread 1  every 7-12 s   flicker, brown-out, a torn line of the LCD
 *   dread 2  every 4.5-8 s  ...and whispers: a word half-seen in the crystal
 *   dread 3  every 2.5-5 s  mostly whispers and flickers
 *
 * Photosensitivity: a glitch is at most two low-contrast dips (the lamp
 * dims, it never goes black-to-white), and glitches are seconds apart, so
 * nothing flashes more than 3 times in any second (WCAG 2.3.1). With
 * prefers-reduced-motion the CSS turns them into gentle dims.
 */
export type GlitchKind = 'flicker' | 'brownout' | 'tear' | 'whisper'

export interface Glitch {
  kind: GlitchKind
  /** for a whisper: the word seen in the LCD */
  text: string
  /** changes every glitch (lets the CSS animation restart) */
  id: number
}

export const GLITCH_MS: Readonly<Record<GlitchKind, number>> = Object.freeze({
  flicker: 380,
  brownout: 900,
  tear: 280,
  whisper: 220,
})

interface Level {
  minMs: number
  maxMs: number
  kinds: readonly GlitchKind[]
}

export const GLITCH_LEVELS: readonly Level[] = Object.freeze([
  { minMs: 12000, maxMs: 18000, kinds: ['brownout'] },
  { minMs: 7000, maxMs: 12000, kinds: ['flicker', 'brownout', 'tear'] },
  { minMs: 4500, maxMs: 8000, kinds: ['flicker', 'tear', 'whisper', 'brownout'] },
  { minMs: 2500, maxMs: 5000, kinds: ['whisper', 'flicker', 'tear', 'whisper'] },
])

export const glitchLevel = (dread: number) => GLITCH_LEVELS[Math.min(GLITCH_LEVELS.length - 1, Math.max(0, dread))]

export function useGhostGlitches(active: boolean, dread: number, whisper: () => string): Glitch | null {
  const [glitch, setGlitch] = useState<Glitch | null>(null)
  const whisperRef = useRef(whisper)
  whisperRef.current = whisper
  const dreadRef = useRef(dread)
  dreadRef.current = dread

  useEffect(() => {
    if (!active) {
      setGlitch(null)
      return
    }
    let timer: ReturnType<typeof setTimeout> | null = null
    let n = 0
    const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo)
    const schedule = (ms: number) => {
      timer = setTimeout(fire, ms)
    }
    function fire() {
      const level = glitchLevel(dreadRef.current)
      const kind = level.kinds[Math.floor(Math.random() * level.kinds.length)]
      n += 1
      setGlitch({ kind, text: kind === 'whisper' ? whisperRef.current() : '', id: n })
      playGlitchZap(kind, Math.min(1, 0.45 + dreadRef.current * 0.18))
      timer = setTimeout(() => {
        setGlitch(null)
        const next = glitchLevel(dreadRef.current)
        schedule(rand(next.minMs, next.maxMs))
      }, GLITCH_MS[kind])
    }
    // the first one comes sooner, once it has you
    const first = glitchLevel(dreadRef.current)
    schedule(rand(first.minMs * 0.4, first.minMs * 0.7))
    return () => {
      if (timer !== null) clearTimeout(timer)
    }
  }, [active])

  return glitch
}
