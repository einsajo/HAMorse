/**
 * The reference card's friction motion: ONE timeline shared by the CSS
 * animation (ReferenceCard.css @keyframes refcard-out / refcard-in) and the
 * paper-scrape sound (audioEngine.playPaperScrape), so what you hear is locked
 * to what you see.
 *
 * Durations are applied to the CSS from here (--refcard-out-dur /
 * --refcard-in-dur). The phase points are fractions of the duration and MUST
 * match the keyframe percentages in ReferenceCard.css:
 *
 *   open  (refcard-out, 1050 ms):  slides 0-36%  | stuck 36-52% | breaks free 52-56% | glides to 90%
 *   close (refcard-in,   950 ms):  slides 0-34%  | stuck 34-50% | breaks free 50-54% | glides to 100%
 */
export interface CardMotion {
  /** total animation length */
  durationMs: number
  /** card catches on the chassis lip (sliding stops) */
  stickAt: number
  /** card breaks free (the snap starts) */
  releaseAt: number
  /** card has (visually) finished gliding */
  settleAt: number
}

export const REF_CARD_MOTION: Readonly<{ open: CardMotion; close: CardMotion }> = Object.freeze({
  open: Object.freeze({ durationMs: 1050, stickAt: 0.36, releaseAt: 0.52, settleAt: 0.9 }),
  close: Object.freeze({ durationMs: 950, stickAt: 0.34, releaseAt: 0.5, settleAt: 0.95 }),
})

/** The phases in milliseconds, for scheduling */
export function cardMotionPhasesMs(isOpening: boolean) {
  const m = isOpening ? REF_CARD_MOTION.open : REF_CARD_MOTION.close
  return {
    durationMs: m.durationMs,
    stickMs: m.durationMs * m.stickAt,
    releaseMs: m.durationMs * m.releaseAt,
    settleMs: m.durationMs * m.settleAt,
  }
}

/* --- The keyframes themselves ----------------------------------------------------
   KEEP IN SYNC with @keyframes refcard-out / refcard-in in ReferenceCard.css:
   [offset 0..1, progress --p, timing function to the next keyframe]. The
   paper-scrape sound is driven by the card's speed computed from these, so
   every catch, strain, snap and glide is heard exactly where it is seen. */
type Bezier = readonly [number, number, number, number]
const EASE_IN_OUT: Bezier = [0.42, 0, 0.58, 1]
const EASE_IN: Bezier = [0.42, 0, 1, 1]
type Keyframe = readonly [offset: number, p: number, ease: Bezier]

const OPEN_KEYFRAMES: readonly Keyframe[] = [
  [0, 0, [0.3, 0.55, 0.45, 1]],
  [0.36, 0.4, EASE_IN_OUT], // catches on the lip
  [0.42, 0.412, EASE_IN_OUT], // strains forward
  [0.47, 0.403, EASE_IN], // springs back
  [0.52, 0.41, [0.05, 0.9, 0.2, 1]],
  [0.56, 0.62, [0.2, 0.75, 0.3, 1]], // breaks free
  [0.9, 1.012, EASE_IN_OUT], // slaps out, tiny overshoot
  [1, 1, EASE_IN_OUT],
]
const CLOSE_KEYFRAMES: readonly Keyframe[] = [
  [0, 1, [0.3, 0.55, 0.45, 1]],
  [0.34, 0.6, EASE_IN_OUT], // snags going back in
  [0.4, 0.588, EASE_IN_OUT],
  [0.45, 0.597, EASE_IN],
  [0.5, 0.59, [0.05, 0.9, 0.2, 1]],
  [0.54, 0.38, [0.25, 0.7, 0.35, 1]], // gives way
  [1, 0, EASE_IN_OUT],
]

/** CSS cubic-bezier(x1, y1, x2, y2) evaluated at time fraction x */
function bezierAt([x1, y1, x2, y2]: Bezier, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const coord = (u: number, a: number, b: number) => 3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3
  // solve x(u) = x by bisection (monotonic in u for valid CSS curves)
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (coord(mid, x1, x2) < x) lo = mid
    else hi = mid
  }
  return coord((lo + hi) / 2, y1, y2)
}

/** The card's slide progress (0 = tucked away, 1 = fully out) `ms` into its animation */
export function cardPositionAt(isOpening: boolean, ms: number): number {
  const frames = isOpening ? OPEN_KEYFRAMES : CLOSE_KEYFRAMES
  const m = isOpening ? REF_CARD_MOTION.open : REF_CARD_MOTION.close
  const x = Math.min(1, Math.max(0, ms / m.durationMs))
  for (let i = 0; i < frames.length - 1; i++) {
    const [o0, p0, ease] = frames[i]
    const [o1, p1] = frames[i + 1]
    if (x <= o1) return p0 + (p1 - p0) * bezierAt(ease, (x - o0) / (o1 - o0))
  }
  return frames[frames.length - 1][1]
}

/** How fast the card is moving `ms` into its animation, in card-lengths per second */
export function cardSpeedAt(isOpening: boolean, ms: number): number {
  const h = 1.5
  return Math.abs(cardPositionAt(isOpening, ms + h) - cardPositionAt(isOpening, ms - h)) / ((2 * h) / 1000)
}
