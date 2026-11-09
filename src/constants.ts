/**
 * The radio dial: what lives where on the band.
 *
 *   88.00 ──────────────────────────────────────────────────────── 108.00 MHz
 *          89.30      93.50       98.10    100.00 ═════ 103.50
 *          NEWS       SPORTS      MUSIC      HAM BAND
 *
 *   The ghost WANDERS: every time the app loads it settles on a new random
 *   frequency (GHOST_FREQUENCY), well clear of every station. You find it by
 *   ear: within 0.80 MHz the static fades into a low drone.
 *
 *   Ham band operators, 0.70 MHz apart with open band between them:
 *   100.30 Elmer (mentor) · 101.00 practice (HI / SOS) · 101.70 code-practice
 *   bulletin · 102.40 Bob (QSO) · 103.10 Sam (high speed)
 *   Reserved, receive-only (not mapped yet): 100.65 · 101.35 · 102.05
 *
 *   Live agents (LLM personas, see src/utils/agentEngine.ts):
 *   90.20 the Guide (a friendly ham) · 102.75 a random ragchewer (new every boot)
 *
 * Everything not listed is dead air.
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

/** Where the radio sits when it is first switched on (a dead spot near the bottom of the band) */
export const DIAL_START_MHZ = 88.5
/** The dial's limits */
export const DIAL_MIN_MHZ = 88.0
export const DIAL_MAX_MHZ = 108.0

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
 * station...). Midway in the gaps between operators (102.75 has since been
 * mapped: it is the random ragchewer, an agent station). For now
 * each is an unmodulated carrier: the S-meter shows a steady signal, the
 * LCD says RX ONLY and you can't transmit. Map one by giving it content
 * (and, if it should answer, moving it to HAM_STATIONS).
 */
export const RESERVED_RX_FREQUENCIES = Object.freeze([100.65, 101.35, 102.05] as const)

/**
 * Operators played by live agents (an LLM through the agent route, or a
 * local persona offline: src/utils/agentEngine.ts). Two-way, like the ham band.
 */
export const AGENT_STATIONS = Object.freeze({
  /** the Guide: a friendly ham on a quiet frequency who points strugglers at the tutors */
  guide: 90.2,
  /** a random ragchewer: a new age, place and quirk every boot (the old 102.75 reserved slot) */
  stranger: 102.75,
})

export type AgentStationId = keyof typeof AGENT_STATIONS

/** Which agent station (if any) is exactly on `mhz` */
export function agentStationAt(mhz: number): AgentStationId | null {
  const ids = Object.keys(AGENT_STATIONS) as AgentStationId[]
  return ids.find((id) => isTunedTo(mhz, AGENT_STATIONS[id])) ?? null
}

/* --- The wandering ghost --------------------------------------------------------- */

/** The ghost keeps at least this far from every station (broadcasters, operators, reserved slots) */
export const GHOST_STATION_BUFFER_MHZ = 0.5
/** ...and from where the radio powers on, so you never start inside its drone */
export const GHOST_START_BUFFER_MHZ = 1.0
/** It sits on the dial's 0.05 MHz step, so the arrow keys can reach it too */
export const GHOST_STEP_MHZ = 0.05
/** Within this distance the static fades into the ghost's drone */
export const GHOST_PROXIMITY_MHZ = 0.8

/** Every frequency the ghost must keep clear of */
export const OCCUPIED_FREQUENCIES: readonly number[] = Object.freeze([
  ...BROADCAST_STATIONS,
  ...Object.values(HAM_STATIONS),
  ...RESERVED_RX_FREQUENCIES,
  ...Object.values(AGENT_STATIONS),
])

/** Is `mhz` an allowed home for the ghost? */
export function isGhostSpot(mhz: number): boolean {
  if (mhz < DIAL_MIN_MHZ - 1e-9 || mhz > DIAL_MAX_MHZ + 1e-9) return false
  if (Math.abs(mhz - DIAL_START_MHZ) < GHOST_START_BUFFER_MHZ) return false
  return OCCUPIED_FREQUENCIES.every((f) => Math.abs(mhz - f) >= GHOST_STATION_BUFFER_MHZ - 1e-9)
}

/** Every allowed spot on the 0.05 MHz grid (computed, so a new station can never collide) */
export const GHOST_SPOTS: readonly number[] = Object.freeze(
  Array.from({ length: Math.round((DIAL_MAX_MHZ - DIAL_MIN_MHZ) / GHOST_STEP_MHZ) + 1 }, (_, i) =>
    Math.round((DIAL_MIN_MHZ + i * GHOST_STEP_MHZ) * 100) / 100,
  ).filter(isGhostSpot),
)

/** Pick the ghost's frequency for this session (`rng` injectable for tests) */
export function pickGhostFrequency(rng: () => number = Math.random): number {
  const i = Math.min(GHOST_SPOTS.length - 1, Math.floor(rng() * GHOST_SPOTS.length))
  return GHOST_SPOTS[Math.max(0, i)]
}

/**
 * The haunted station for this session: chosen when the app loads, and
 * chosen again whenever the haunt ends in its hard reset (the breaker trips),
 * so it is somewhere new every time. The S-meter pins here and the decoder opens.
 */
let ghostFrequency: number = pickGhostFrequency()

export function getGhostFrequency(): number {
  return ghostFrequency
}

/** A new session: the ghost wanders off somewhere else (returns the new frequency) */
export function reseedGhostFrequency(rng: () => number = Math.random): number {
  ghostFrequency = pickGhostFrequency(rng)
  return ghostFrequency
}

/** 0 = out of range ... 1 = right on top of the ghost (0 again exactly on it: the drone stops) */
export function ghostProximity(mhz: number, ghost: number = ghostFrequency): number {
  if (isTunedTo(mhz, ghost)) return 0
  const d = Math.abs(mhz - ghost)
  return d >= GHOST_PROXIMITY_MHZ - FREQ_EPSILON ? 0 : 1 - d / GHOST_PROXIMITY_MHZ
}

/** "100.30": how operators say a frequency on the air */
export const formatMhz = (mhz: number) => mhz.toFixed(2)

export type HamStationId = keyof typeof HAM_STATIONS

/* --- Classification --------------------------------------------------------- */

/**
 * broadcast  a commercial station: listen only
 * reserved   a receive-only slot not mapped yet: a silent carrier
 * ham        the amateur band: two-way Morse
 * ghost      the wandering ghost (GHOST_FREQUENCY, random per session)
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
  if (isTunedTo(mhz, ghostFrequency)) return { band: 'ghost', canTransmit: true }
  const station = BROADCAST_STATIONS.find((f) => isTunedTo(mhz, f))
  if (station !== undefined) return { band: 'broadcast', kind: BROADCAST_KINDS[station], canTransmit: false }
  if (RESERVED_RX_FREQUENCIES.some((f) => isTunedTo(mhz, f))) return { band: 'reserved', canTransmit: false }
  // an agent operator: two-way, like the ham band (90.20 is a quiet spot off the band)
  if (agentStationAt(mhz) !== null) return { band: 'ham', canTransmit: true }
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

const FIXED_DETENTS: readonly Detent[] = Object.freeze([
  ...BROADCAST_STATIONS.map((frequency) => ({ frequency, ...WIDE_DETENT })),
  ...Object.values(HAM_STATIONS).map((frequency) => ({ frequency, ...NARROW_DETENT })),
  ...RESERVED_RX_FREQUENCIES.map((frequency) => ({ frequency, ...NARROW_DETENT })),
  ...Object.values(AGENT_STATIONS).map((frequency) => ({ frequency, ...NARROW_DETENT })),
])

let detentCache: { ghost: number; detents: readonly Detent[] } | null = null

/** Every detent on the dial, the ghost's included (it moves on a reset, so this is a function) */
export function getDetents(): readonly Detent[] {
  if (detentCache?.ghost !== ghostFrequency) {
    detentCache = { ghost: ghostFrequency, detents: Object.freeze([...FIXED_DETENTS, { frequency: ghostFrequency, ...WIDE_DETENT }]) }
  }
  return detentCache.detents
}
