/**
 * Your progress, as the radio remembers it (localStorage when the browser
 * allows it): the characters the Elmer has taught you, and your best sending
 * speed. The reference card pencils both in (ReferenceCard.tsx).
 *
 * Pure: no React, no DOM, and storage failures (private mode, quota) are
 * swallowed, so it is unit-tested directly (tests/progress.test.mjs).
 */
import { ELMER_LEGACY_KEY, ELMER_ORDER, ELMER_STORAGE_KEY } from './stations'
import type { StationStorage } from './stations'

/** where your best sending speed is kept */
export const BEST_WPM_KEY = 'hamorse.best.wpm'
/** a plausible hand-sent speed: below is a hesitation, above is a glitch in the timing */
export const WPM_MIN = 3
export const WPM_MAX = 60

export interface Progress {
  /** characters the Elmer has taught you (the first `learned` of ELMER_ORDER) */
  learned: number
  /** your best sending speed, words per minute, or null until you've sent a word */
  bestWpm: number | null
}

const read = (storage: StationStorage | undefined, key: string): string | null => {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

/** The first `count` characters of the Elmer's teaching order */
export function learnedChars(count: number): string[] {
  const n = Number.isFinite(count) ? Math.min(ELMER_ORDER.length, Math.max(0, Math.floor(count))) : 0
  return [...ELMER_ORDER.slice(0, n)]
}

const plausible = (wpm: unknown): wpm is number => typeof wpm === 'number' && Number.isFinite(wpm) && wpm >= WPM_MIN && wpm <= WPM_MAX

export function loadProgress(storage?: StationStorage): Progress {
  const raw = read(storage, ELMER_STORAGE_KEY) ?? read(storage, ELMER_LEGACY_KEY)
  const n = raw === null ? Number.NaN : Number.parseInt(raw, 10)
  const learned = Number.isFinite(n) && n >= 0 ? Math.min(ELMER_ORDER.length, n) : 0
  const best = Number.parseFloat(read(storage, BEST_WPM_KEY) ?? '')
  return { learned, bestWpm: plausible(best) ? Math.round(best) : null }
}

/** Keep the best plausible speed; returns the current best (null if none yet) */
export function recordWpm(storage: StationStorage | undefined, wpm: number | null | undefined): number | null {
  const best = loadProgress(storage).bestWpm
  if (!plausible(wpm)) return best
  const rounded = Math.round(wpm)
  if (best !== null && rounded <= best) return best
  try {
    storage?.setItem(BEST_WPM_KEY, String(rounded))
  } catch {
    /* private mode / quota: it just isn't remembered */
  }
  return rounded
}
