/**
 * The radio dial: what lives where on the band.
 *
 *   88.00 ──────────────────────────────────────────────────────── 108.00 MHz
 *          89.30      93.50       98.10    100.00 ═════ 103.50  104.40
 *          NEWS       SPORTS      MUSIC      HAM BAND        (ghost)
 *
 *   Ham band operators, 0.70 MHz apart with open band between them:
 *   100.30 Elmer (mentor) · 101.00 practice (HI / SOS) · 101.70 code-practice
 *   bulletin · 102.40 Bob (QSO) · 103.10 Sam (high speed)
 *   Reserved, receive-only (not mapped yet): 100.65 · 101.35 · 102.05 · 102.75
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
export const HAM_BAND_END = 103.5

/** The haunted station: the S-meter pins here and the decoder opens */
export const GHOST_FREQUENCY = 104.4

/** A practice station inside the ham band: it answers HI and SOS */
export const TUTOR_FREQUENCY = 101.0

/**
 * The operators who live on the ham band, in dial order. Their behaviour is
 * in src/utils/stations.ts. They sit 0.70 MHz apart, so between two of them
 * there is a good stretch of empty band (static, nobody there) to tune
 * through, as on a real band; the Elmer is the first one you reach tuning up
 * from the broadcasters.
 */
export const HAM_STATIONS = Object.freeze({
  /** the Elmer (mentor): introduces himself, asks if you're new, then teaches */
  elmer: 100.3,
  /** the original practice station: HI, then SOS */
  tutor: TUTOR_FREQUENCY,
  /** a code-practice broadcast: slow, spaced-out text to copy by ear */
  bulletin: 101.7,
  /** Bob, for a real-feeling QSO: RST, name, QTH, 73 */
  ragchew: 102.4,
  /** Sam, an old-timer running high-speed copy practice (5-character groups) */
  speed: 103.1,
})

/**
 * Receive-only slots, reserved for future content (beacons, nets, a numbers
 * station...). One sits midway in each gap between two operators. For now
 * each is an unmodulated carrier: the S-meter shows a steady signal, the
 * LCD says RX ONLY and you can't transmit. Map one by giving it content
 * (and, if it should answer, moving it to HAM_STATIONS).
 */
export const RESERVED_RX_FREQUENCIES = Object.freeze([100.65, 101.35, 102.05, 102.75] as const)

/** "100.30": how operators say a frequency on the air */
export const formatMhz = (mhz: number) => mhz.toFixed(2)

export type HamStationId = keyof typeof HAM_STATIONS

/* --- Classification --------------------------------------------------------- */

/**
 * broadcast  a commercial station: listen only
 * reserved   a receive-only slot not mapped yet: a silent carrier
 * ham        the amateur band: two-way Morse
 * ghost      104.40
 * dead       nothing there
 */
export type Band = 'broadcast' | 'reserved' | 'ham' | 'ghost' | 'dead'

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
  if (RESERVED_RX_FREQUENCIES.some((f) => isTunedTo(mhz, f))) return { band: 'reserved', canTransmit: false }
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
/** Ham operators: small detents (0.70 apart), so most of the band between them stays open to tune through */
const NARROW_DETENT = { captureMhz: 0.1, escapeMhz: 0.16 } as const

export const DETENTS: readonly Detent[] = Object.freeze([
  ...BROADCAST_STATIONS.map((frequency) => ({ frequency, ...WIDE_DETENT })),
  ...Object.values(HAM_STATIONS).map((frequency) => ({ frequency, ...NARROW_DETENT })),
  ...RESERVED_RX_FREQUENCIES.map((frequency) => ({ frequency, ...NARROW_DETENT })),
  { frequency: GHOST_FREQUENCY, ...WIDE_DETENT },
])

/** Every station the tuning dial gives a magnetic detent to */
export const DETENT_FREQUENCIES: readonly number[] = Object.freeze(DETENTS.map((d) => d.frequency))
