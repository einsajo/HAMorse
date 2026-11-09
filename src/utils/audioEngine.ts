/**
 * The radio's sound: synthesised live with the Web Audio API. No audio files.
 *
 *   noise loop ─► bandpass 1 kHz ─► static gain ─┐
 *   700 Hz sine ─► key gain (envelope) ──────────┼─► master ─► limiter ─► speakers
 *   click bursts (osc thump + noise tick) ───────┘
 *
 * Mobile autoplay policy (and .kiro/steering/tech.md): no AudioContext exists
 * until the user physically operates the MAIN POWER breaker, which calls
 * unlockAudio(). Until then every play function is a silent no-op.
 *
 * The synth building blocks (createNoiseBuffer, createStaticChain,
 * createSidetone, scheduleClick) take any BaseAudioContext, so they can also be
 * rendered offline (OfflineAudioContext) and measured in tests.
 */
import type { Band } from '../constants'

/* --- Levels (linear gain) --------------------------------------------------- */
/** Overall output; the limiter after it keeps peaks safe for headphones */
const MASTER_GAIN = 0.8
/** Static at its loudest (dead air). Kept modest: static is fatiguing */
const STATIC_MAX_GAIN = 0.22
/** Sidetone peak */
const TONE_GAIN = 0.28

/**
 * Static loudness per band, relative to dead air. A strong signal pushes the
 * noise floor down, so the ghost station is eerily quiet and clear.
 */
export const STATIC_LEVELS: Readonly<Record<Band, number>> = Object.freeze({
  dead: 1, // nothing on frequency: full hiss
  ham: 0.5, // live amateur band
  broadcast: 0.2, // strong commercial carrier masks the noise
  ghost: 0.1, // unnaturally clean
})

/* --- Static ------------------------------------------------------------------ */
const STATIC_FILTER_HZ = 1000
const STATIC_FILTER_Q = 0.9
const NOISE_SECONDS = 4

/**
 * White noise with sparse crackle pops (the "grit" of AM static). Long enough
 * that the loop point and crackle pattern don't audibly repeat.
 */
export function createNoiseBuffer(ctx: BaseAudioContext, seconds = NOISE_SECONDS): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * 0.55
  // crackle: about 6 pops per second, each a few-sample decaying spike
  const pops = Math.floor(seconds * 6)
  for (let p = 0; p < pops; p++) {
    const at = Math.floor(Math.random() * (length - 64))
    const amp = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.5)
    for (let k = 0; k < 48; k++) data[at + k] += amp * Math.exp(-k / 6)
  }
  return buffer
}

export interface StaticChain {
  source: AudioBufferSourceNode
  filter: BiquadFilterNode
  gain: GainNode
}

/** Looping noise through a ~1 kHz bandpass: muffled, gritty radio static. Starts silent. */
export function createStaticChain(ctx: BaseAudioContext, destination: AudioNode, buffer = createNoiseBuffer(ctx)): StaticChain {
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = STATIC_FILTER_HZ
  filter.Q.value = STATIC_FILTER_Q
  const gain = ctx.createGain()
  gain.gain.value = 0
  source.connect(filter).connect(gain).connect(destination)
  source.start()
  return { source, filter, gain }
}

/* --- Sidetone ------------------------------------------------------------------ */
export const SIDETONE_HZ = 700
/** Envelope edges. setTargetAtTime reaches ~95% in 3 time constants. */
const ENVELOPE_MS = 5
const ENVELOPE_TC = ENVELOPE_MS / 1000 / 3

export interface Sidetone {
  /** Key the tone for `durationMs`, starting at `when` (default: now) */
  key: (durationMs: number, when?: number) => void
  oscillator: OscillatorNode
  gain: GainNode
}

/**
 * A continuously running 700 Hz sine behind a keying gain, like a real rig's
 * sidetone oscillator. Keying only shapes the gain: a 5 ms rise and a 5 ms fall
 * (exponential, so it is always continuous: no pops). Because there is a
 * single oscillator, fast keying retriggers the envelope from wherever it is,
 * instead of stacking tones that would beat against each other.
 */
export function createSidetone(ctx: BaseAudioContext, destination: AudioNode, peak = TONE_GAIN): Sidetone {
  const oscillator = ctx.createOscillator()
  oscillator.type = 'sine'
  oscillator.frequency.value = SIDETONE_HZ
  const gain = ctx.createGain()
  gain.gain.value = 0
  oscillator.connect(gain).connect(destination)
  oscillator.start()

  const key = (durationMs: number, when = ctx.currentTime) => {
    const p = gain.gain
    const hold = Math.max(durationMs / 1000 - ENVELOPE_MS / 1000, 0.001)
    // hold the current level (if a tone is still ringing) then re-shape from there
    if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(when)
    else p.cancelScheduledValues(when)
    p.setTargetAtTime(peak, when, ENVELOPE_TC)
    p.setTargetAtTime(0, when + hold, ENVELOPE_TC)
  }
  return { key, oscillator, gain }
}

/* --- Mechanical clicks (drum-synth) --------------------------------------------- */
const clickNoise = new WeakMap<BaseAudioContext, AudioBuffer>()

/**
 * A mechanical click: a pitched "thump" (an oscillator whose pitch drops fast,
 * like a synth kick) plus a short highpassed noise "tick" for the contact.
 * Low pitches (~150 Hz) give a heavy breaker thunk; high pitches (~3 kHz) a
 * small detent tick. Self-disposing.
 */
export function scheduleClick(
  ctx: BaseAudioContext,
  destination: AudioNode,
  pitch = 1800,
  volume = 0.5,
  when = ctx.currentTime,
): void {
  const vol = Math.min(1, Math.max(0, volume))
  if (vol === 0) return
  const p = Math.min(8000, Math.max(40, pitch))

  // thump: fast pitch drop
  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(p, when)
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, p * 0.3), when + 0.03)
  const body = ctx.createGain()
  body.gain.setValueAtTime(0, when)
  body.gain.linearRampToValueAtTime(vol * 0.9, when + 0.0015)
  body.gain.exponentialRampToValueAtTime(0.0001, when + 0.045)
  osc.connect(body).connect(destination)
  osc.start(when)
  osc.stop(when + 0.06)

  // tick: a very short burst of filtered noise
  let noise = clickNoise.get(ctx)
  if (!noise) {
    noise = createNoiseBuffer(ctx, 0.05)
    clickNoise.set(ctx, noise)
  }
  const burst = ctx.createBufferSource()
  burst.buffer = noise
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = Math.min(9000, p * 1.5)
  const tick = ctx.createGain()
  tick.gain.setValueAtTime(vol * 0.6, when)
  tick.gain.exponentialRampToValueAtTime(0.0001, when + 0.018)
  burst.connect(hp).connect(tick).connect(destination)
  burst.start(when)
  burst.stop(when + 0.03)

  osc.onended = () => {
    osc.disconnect()
    body.disconnect()
  }
  burst.onended = () => {
    burst.disconnect()
    hp.disconnect()
    tick.disconnect()
  }
}

/* --- The live engine ------------------------------------------------------------ */
interface Engine {
  ctx: AudioContext
  master: GainNode
  staticChain: StaticChain
  sidetone: Sidetone
}

let engine: Engine | null = null
let staticLevel = 0
let resumeRequestedAt = Number.NEGATIVE_INFINITY

/**
 * On touch screens a pointerdown is not a "user activation", so a context
 * created there starts suspended and only runs once pointerup lets it resume.
 * Sounds requested in that gap are played when it resumes, if still fresh.
 */
const RESUME_GRACE_MS = 400
const STATIC_RAMP_TC = 0.04 // s: smooth level changes while tuning (no zipper noise)

function getAudioContextClass(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
  return w.AudioContext ?? w.webkitAudioContext
}

function build(): Engine | null {
  const AudioContextClass = getAudioContextClass()
  if (!AudioContextClass) return null
  const ctx = new AudioContextClass({ latencyHint: 'interactive' })

  // safety limiter: overlapping sounds can never clip or get painfully loud
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -10
  limiter.knee.value = 6
  limiter.ratio.value = 12
  limiter.attack.value = 0.003
  limiter.release.value = 0.15
  limiter.connect(ctx.destination)

  const master = ctx.createGain()
  master.gain.value = MASTER_GAIN
  master.connect(limiter)

  const staticChain = createStaticChain(ctx, master)
  staticChain.gain.gain.value = staticLevel * STATIC_MAX_GAIN
  const sidetone = createSidetone(ctx, master)
  return { ctx, master, staticChain, sidetone }
}

/** Run `fn` now if audio is running, or as soon as a just-requested resume completes. */
function whenRunning(fn: (e: Engine) => void): void {
  const e = engine
  if (!e) return // never unlocked: stay silent (autoplay policy)
  if (e.ctx.state === 'running') {
    fn(e)
    return
  }
  if (e.ctx.state === 'closed') return
  const requestedAt = performance.now()
  if (requestedAt - resumeRequestedAt > RESUME_GRACE_MS) return
  void e.ctx
    .resume()
    .then(() => {
      if (performance.now() - requestedAt <= RESUME_GRACE_MS) fn(e)
    })
    .catch(() => {})
}

/**
 * Create (first call) and resume the AudioContext. Call ONLY from a real user
 * interaction with the MAIN POWER breaker (pointerdown, pointerup, click, key).
 * Safe to call repeatedly.
 */
export function unlockAudio(): void {
  if (!engine) engine = build()
  const e = engine
  if (!e || e.ctx.state === 'running' || e.ctx.state === 'closed') return
  resumeRequestedAt = performance.now()
  void e.ctx.resume().catch(() => {})
}

/** Static loudness, 0..1 (1 = dead air). Remembered until audio is unlocked. */
export function setStaticLevel(level: number): void {
  staticLevel = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0))
  const e = engine
  if (!e) return
  e.staticChain.gain.gain.setTargetAtTime(staticLevel * STATIC_MAX_GAIN, e.ctx.currentTime, STATIC_RAMP_TC)
}

/** Static level for a band, or silence when the radio is off */
export function staticLevelFor(band: Band, isPowerOn: boolean): number {
  return isPowerOn ? STATIC_LEVELS[band] : 0
}

/** The 700 Hz sidetone for `durationMs` (5 ms attack / 5 ms release) */
export function playTone(durationMs: number): void {
  if (!(durationMs > 0)) return
  whenRunning((e) => e.sidetone.key(durationMs, e.ctx.currentTime))
}

/** A synthesised mechanical click. `pitch` in Hz (~150 heavy thunk ... ~3500 tiny tick), `volume` 0..1. */
export function playClick(pitch = 1800, volume = 0.5): void {
  whenRunning((e) => scheduleClick(e.ctx, e.master, pitch, volume, e.ctx.currentTime))
}

/** The MAIN POWER breaker: a higher, snappier thunk ON; a lower, duller one OFF */
export function playBreakerClick(turningOn: boolean): void {
  playClick(turningOn ? 190 : 140, 0.9)
}

/** Engine status, for debugging and tests */
export function getAudioState(): { state: AudioContextState | 'locked'; staticLevel: number } {
  return { state: engine ? engine.ctx.state : 'locked', staticLevel }
}
