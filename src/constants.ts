/**
 * The radio dial: what lives where on the band.
 *
 *   88.00 ──────────────────────────────────────────────────────── 108.00 MHz
 *          89.30      93.50       98.10    100.00 ═════ 102.00    104.40
 *          NEWS       SPORTS      MUSIC      HAM BAND              (ghost)
 *
 *   Ham band operators: 100.20 code-practice bulletin · 100.60 Elmer (mentor)
 *   · 101.00 practice (HI / SOS) · 101.40 Bob (QSO) · 101.80 Sam (high speed)
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

/**
 * The operators who live on the ham band, from beginner to pro. Their
 * behaviour is in src/utils/stations.ts. 0.40 MHz apart, so each has its own
 * small detent with open band between them.
 */
export const HAM_STATIONS = Object.freeze({
  /** a code-practice broadcast: slow, spaced-out text to copy by ear */
  bulletin: 100.2,
  /** the Elmer (mentor): teaches one character at a time */
  elmer: 100.6,
  /** the original practice station: HI, then SOS */
  tutor: TUTOR_FREQUENCY,
  /** Bob, for a real-feeling QSO: RST, name, QTH, 73 */
  ragchew: 101.4,
  /** Sam, an old-timer running high-speed copy practice (5-character groups) */
  speed: 101.8,
})

export type HamStationId = keyof typeof HAM_STATIONS

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

/** Which ham station (if any) is exactly on `mhz` */
export function hamStationAt(mhz: number): HamStationId | null {
  const ids = Object.keys(HAM_STATIONS) as HamStationId[]
  return ids.find((id) => isTunedTo(mhz, HAM_STATIONS[id])) ?? null
}

/* --- Tuning detents ----------------------------------------------------------- */

/**
 * A magnetic detent on the dial. The drag snaps onto `frequency` once within
 * `captureMhz` of it, and only pops out again beyond `escapeMhz` (hysteresis).
 */
export interface Detent {
  frequency: number
  captureMhz: number
  escapeMhz: number
}

/** Broadcasters and the ghost: wide, strong detents (the ghost feels like just one more station) */
const WIDE_DETENT = { captureMhz: 0.2, escapeMhz: 0.32 } as const
/** Ham operators sit 0.40 apart, so their detents are small and the band stays open between them */
const NARROW_DETENT = { captureMhz: 0.08, escapeMhz: 0.13 } as const

export const DETENTS: readonly Detent[] = Object.freeze([
  ...BROADCAST_STATIONS.map((frequency) => ({ frequency, ...WIDE_DETENT })),
  ...Object.values(HAM_STATIONS).map((frequency) => ({ frequency, ...NARROW_DETENT })),
  { frequency: GHOST_FREQUENCY, ...WIDE_DETENT },
])

/** Every station the tuning dial gives a magnetic detent to */
export const DETENT_FREQUENCIES: readonly number[] = Object.freeze(DETENTS.map((d) => d.frequency))
