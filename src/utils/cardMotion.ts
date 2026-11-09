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
