/**
 * The radio dial: what lives where on the band.
 *
 *   88.00 ──────────────────────────────────────────────────────── 108.00 MHz
 *          89.30      93.50       98.10    100.00 ═101═ 102.00    104.40
 *          NEWS       SPORTS      MUSIC      HAM BAND (tutor)      (ghost)
 *
 * Everything not listed is dead air. The ghost station is deliberately
 * indistinguishable from the broadcasters until you are on it.
 */

/** 0.01 MHz is the radio's resolution; frequencies closer than this are equal */
const FREQ_EPSILON = 0.005

/** True when `mhz` is exactly `target` at the radio's 0.01 MHz resolution */
export function isTunedTo(mhz: number, target: number): boolean {
  return Math.abs(mhz - target) < FREQ_EPSILON
}

/* --- Bands ------------------------------------------------------------------ */

/** Commercial broadcasters: receive only, strong signal */
export const BROADCAST_STATIONS = [89.3, 93.5, 98.1] as const

export type BroadcastKind = 'news' | 'sports' | 'music'

/** What each broadcaster carries (index-matched to BROADCAST_STATIONS) */
export const BROADCAST_KINDS: Readonly<Record<(typeof BROADCAST_STATIONS)[number], BroadcastKind>> = Object.freeze({
  89.3: 'news',
  93.5: 'sports',
  98.1: 'music',
})

/** Amateur (ham) transmission band, inclusive: two-way Morse is allowed here */
export const HAM_BAND_START = 100.0
export const HAM_BAND_END = 102.0

/** The haunted station: the S-meter pins here and the decoder opens */
export const GHOST_FREQUENCY = 104.4

/** A practice station inside the ham band: it answers HI and SOS */
export const TUTOR_FREQUENCY = 101.0

/* --- Classification --------------------------------------------------------- */

export type Band = 'broadcast' | 'ham' | 'ghost' | 'dead'

export interface BandInfo {
  band: Band
  /** Only for broadcasters */
  kind?: BroadcastKind
  /** Whether Morse taps can be sent / decoded here */
  canTransmit: boolean
}

/** Classify a frequency. Exact stations take priority over ranges. */
export function getBandInfo(mhz: number): BandInfo {
  if (isTunedTo(mhz, GHOST_FREQUENCY)) return { band: 'ghost', canTransmit: true }
  const station = BROADCAST_STATIONS.find((f) => isTunedTo(mhz, f))
  if (station !== undefined) return { band: 'broadcast', kind: BROADCAST_KINDS[station], canTransmit: false }
  if (mhz >= HAM_BAND_START - FREQ_EPSILON && mhz <= HAM_BAND_END + FREQ_EPSILON) {
    return { band: 'ham', canTransmit: true }
  }
  return { band: 'dead', canTransmit: false }
}

/** Every station the tuning dial should give a magnetic detent to */
export const DETENT_FREQUENCIES: readonly number[] = Object.freeze([...BROADCAST_STATIONS, TUTOR_FREQUENCY, GHOST_FREQUENCY])
