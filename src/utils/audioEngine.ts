/**
 * The radio's sound: synthesised live with the Web Audio API. No audio files.
 *
 *   noise loop ─► bandpass 1 kHz ─► static gain ─┐
 *   700 Hz sine ─► key gain (envelope) ──────────┼─► master ─► limiter ─► speakers
 *   Foley: one-shot mechanical sounds ───────────┘
 *
 * Mobile autoplay policy (and .kiro/steering/tech.md): no AudioContext exists
 * until the user physically operates the MAIN POWER breaker, which calls
 * unlockAudio(). Until then every play function is a silent no-op.
 *
 * Electronic sounds (static, sidetone) need the radio powered. Mechanical
 * Foley (switches, buttons, the VFO, the card) is physical, so once audio is
 * unlocked it plays whether the radio is on or off.
 *
 * Every synth building block takes any BaseAudioContext, so it can also be
 * rendered offline (OfflineAudioContext) and measured in tests.
 */
import type { Band } from '../constants'
import { cardMotionPhasesMs } from './cardMotion'

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

/* --- The ghost's tone ------------------------------------------------------------ */
/**
 * What the thing on 104.40 sounds like: not a clean 700 Hz sidetone but a
 * lower, sagging, beating tone. Two detuned oscillators (~7 Hz beat) share a
 * slow wobbling vibrato, the pitch sags as each element is held, and the
 * whole lot is lightly overdriven and band-limited like a failing receiver.
 */
const GHOST_TONE_HZ = 540
/** Soft-clip transfer curve (type inferred, so it fits WaveShaperNode.curve on every TS version) */
function makeDriveCurve() {
  const curve = new Float32Array(1024)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.tanh(2.4 * x) / Math.tanh(2.4)
  }
  return curve
}
let driveCurve: ReturnType<typeof makeDriveCurve> | null = null

export function scheduleGhostTone(ctx: BaseAudioContext, destination: AudioNode, durationMs: number, when = ctx.currentTime): void {
  const dur = Math.max(0.02, durationMs / 1000)
  const edge = 0.008
  const env = ctx.createGain()
  env.gain.value = 0
  env.gain.setValueAtTime(0, when)
  env.gain.linearRampToValueAtTime(0.24, when + edge)
  env.gain.setValueAtTime(0.24, when + dur - edge)
  env.gain.linearRampToValueAtTime(0, when + dur)

  const drive = ctx.createWaveShaper()
  drive.curve = driveCurve ??= makeDriveCurve()
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 900
  band.Q.value = 0.45
  drive.connect(band).connect(env).connect(destination)

  // a slow, uneven vibrato shared by both voices
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 4.6 + Math.random() * 1.2
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 16

  const voices: OscillatorNode[] = []
  for (const detune of [0, 7]) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    const f = GHOST_TONE_HZ + detune
    osc.frequency.setValueAtTime(f, when)
    osc.frequency.linearRampToValueAtTime(f * 0.955, when + dur) // the pitch sags as it is held
    lfo.connect(lfoDepth).connect(osc.frequency)
    const pre = ctx.createGain()
    pre.gain.value = 0.55
    osc.connect(pre).connect(drive)
    osc.start(when)
    osc.stop(when + dur + 0.02)
    voices.push(osc)
  }
  lfo.start(when)
  lfo.stop(when + dur + 0.02)
  voices[0].onended = () => {
    for (const n of [...voices, lfo, lfoDepth, drive, band, env]) n.disconnect()
  }
}

/* --- Foley toolkit --------------------------------------------------------------- */
type Ctx = BaseAudioContext

const foleyNoiseCache = new WeakMap<Ctx, AudioBuffer>()

/** 2 s of plain white noise per context, shared by every Foley sound */
function foleyNoise(ctx: Ctx): AudioBuffer {
  let buf = foleyNoiseCache.get(ctx)
  if (!buf) {
    const length = Math.floor(ctx.sampleRate * 2)
    buf = ctx.createBuffer(1, length, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < length; i++) d[i] = Math.random() * 2 - 1
    foleyNoiseCache.set(ctx, buf)
  }
  return buf
}

/** Disconnect every node of a one-shot once its last source has ended */
function disposeAfter(sources: AudioScheduledSourceNode[], nodes: AudioNode[]): void {
  let left = sources.length
  for (const src of sources) {
    src.onended = () => {
      left -= 1
      if (left === 0) for (const n of nodes) n.disconnect()
    }
  }
}

/** A burst of noise from a random point in the shared buffer */
function noiseBurst(ctx: Ctx, when: number, seconds: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource()
  src.buffer = foleyNoise(ctx)
  const offset = Math.random() * Math.max(0, 2 - seconds - 0.01)
  src.start(when, offset, seconds + 0.005)
  return src
}

function filter(ctx: Ctx, type: BiquadFilterType, hz: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = hz
  f.Q.value = q
  return f
}

/** A gain stage with a click-free percussive envelope: attack, then exponential decay */
function hit(ctx: Ctx, when: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain()
  // A GainNode starts at 1.0: without this, a source started before `when`
  // would blast at full level until the envelope begins (an audible pop).
  g.gain.value = 0
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(peak, when + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay)
  g.gain.setValueAtTime(0, when + attack + decay + 0.001)
  return g
}

/** A drum-synth "body": an oscillator whose pitch drops fast */
function pitchDrop(ctx: Ctx, type: OscillatorType, when: number, fromHz: number, toHz: number, dropS: number, lengthS: number) {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(fromHz, when)
  osc.frequency.exponentialRampToValueAtTime(toHz, when + dropS)
  osc.start(when)
  osc.stop(when + lengthS)
  return osc
}

/* --- Foley: VFO (heavy ball bearings) ------------------------------------------------ */
/**
 * A hardened steel ball dropping into a detent: a low, muffled thud, felt
 * more than heard. A fast pitch drop, a dull "knock" resonance where the ball
 * seats, all through a lowpass so nothing is bright or clicky. Most energy sits
 * below ~600 Hz, with enough between 300 Hz and 1 kHz that it still reads
 * (quietly) on small phone speakers, which cannot reproduce the deepest part.
 * `heavy` is the bigger detent at a station: lower, longer and firmer.
 */
export function scheduleEncoderThud(ctx: Ctx, destination: AudioNode, heavy = false, when = ctx.currentTime): void {
  const k = heavy ? 0.78 : 1 // pitch scale
  const v = heavy ? 1.6 : 1 // level scale
  const lp = filter(ctx, 'lowpass', heavy ? 950 : 1150, 0.6)
  lp.connect(destination)

  // body: the mass of the knob
  const body = pitchDrop(ctx, 'sine', when, 290 * k, 88 * k, 0.03, 0.1)
  const bodyGain = hit(ctx, when, 0.25 * v, 0.0015, heavy ? 0.07 : 0.045)
  body.connect(bodyGain).connect(lp)

  // edge: an octave-ish overtone, so small speakers have something to play
  const edge = pitchDrop(ctx, 'triangle', when, 860 * k, 290 * k, 0.022, 0.07)
  const edgeGain = hit(ctx, when, 0.31 * v, 0.0015, heavy ? 0.05 : 0.042)
  edge.connect(edgeGain).connect(lp)

  // knock: the ball seating in its pocket (dull, resonant)
  const knock = noiseBurst(ctx, when, 0.05)
  const knockBp = filter(ctx, 'bandpass', 470 * k, 2.2)
  const knockGain = hit(ctx, when, 0.38 * v, 0.0008, heavy ? 0.028 : 0.02)
  knock.connect(knockBp).connect(knockGain).connect(lp)

  disposeAfter([body, edge, knock], [body, bodyGain, edge, edgeGain, knock, knockBp, knockGain, lp])
}

/* --- Foley: MAIN POWER breaker ("KA-CHUNK") ----------------------------------------- */
/** Inharmonic partials of a struck steel plate: the metallic ring on the tail */
const RING_PARTIALS = [
  { hz: 1873, gain: 0.07, decay: 0.24 },
  { hz: 2741, gain: 0.05, decay: 0.18 },
  { hz: 4127, gain: 0.032, decay: 0.12 },
  { hz: 5563, gain: 0.018, decay: 0.08 },
]
/** "KA" (the latch trips) to "CHUNK" (the contacts slam home) */
const BREAKER_GAP_S = 0.034

/**
 * A heavy industrial breaker: "KA", the latch tripping (a short, bright
 * snap), then about 34 ms later "CHUNK", the spring-loaded contacts slamming
 * home (a deep pitch-dropping thump with an impact of lowpassed noise),
 * leaving a faint metallic ring in the steel housing. Switching OFF is a
 * little lower and duller.
 */
export function scheduleBreakerThunk(ctx: Ctx, destination: AudioNode, turningOn = true, when = ctx.currentTime): void {
  const k = turningOn ? 1 : 0.86
  const sources: AudioScheduledSourceNode[] = []
  const nodes: AudioNode[] = []
  const add = <T extends AudioNode>(n: T) => (nodes.push(n), n)

  // KA: latch
  const ka = add(noiseBurst(ctx, when, 0.014))
  const kaBp = add(filter(ctx, 'bandpass', 2900 * k, 1.3))
  const kaGain = add(hit(ctx, when, 0.42, 0.0006, 0.011))
  ka.connect(kaBp).connect(kaGain).connect(destination)
  const kaBody = add(pitchDrop(ctx, 'triangle', when, 1250 * k, 480 * k, 0.008, 0.02))
  const kaBodyGain = add(hit(ctx, when, 0.16, 0.0006, 0.012))
  kaBody.connect(kaBodyGain).connect(destination)
  sources.push(ka, kaBody)

  // CHUNK: contacts slam home
  const t = when + BREAKER_GAP_S
  const thump = add(pitchDrop(ctx, 'sine', t, 165 * k, 52 * k, 0.06, 0.2))
  const thumpGain = add(hit(ctx, t, 0.95, 0.0015, 0.15))
  thump.connect(thumpGain).connect(destination)
  const impact = add(noiseBurst(ctx, t, 0.04))
  const impactLp = add(filter(ctx, 'lowpass', 520 * k, 0.8))
  const impactGain = add(hit(ctx, t, 0.6, 0.0008, 0.03))
  impact.connect(impactLp).connect(impactGain).connect(destination)
  sources.push(thump, impact)

  // metallic ring in the housing
  for (const p of RING_PARTIALS) {
    const osc = add(ctx.createOscillator())
    osc.type = 'sine'
    osc.frequency.value = p.hz * (turningOn ? 1 : 0.94)
    const g = add(hit(ctx, t + 0.002, p.gain * (turningOn ? 1 : 0.7), 0.002, p.decay))
    osc.connect(g).connect(destination)
    osc.start(t)
    osc.stop(t + p.decay + 0.02)
    sources.push(osc)
  }
  disposeAfter(sources, nodes)
}

/* --- Foley: DECODER slide ------------------------------------------------------------ */
/**
 * A metal slider dragged along its track: a short, gritty scrape of noise
 * through a sweeping bandpass, chopped by random "grit" as the shoe catches
 * on the rails, ending in a small detent tick. ON sweeps up, OFF sweeps down.
 */
export function scheduleSliderScrape(ctx: Ctx, destination: AudioNode, toOn = true, when = ctx.currentTime): void {
  const dur = 0.13
  const src = noiseBurst(ctx, when, dur + 0.02)
  const bp = filter(ctx, 'bandpass', toOn ? 1700 : 3300, 1.6)
  bp.frequency.setValueAtTime(toOn ? 1700 : 3300, when)
  bp.frequency.exponentialRampToValueAtTime(toOn ? 3300 : 1700, when + dur)
  const hp = filter(ctx, 'highpass', 480, 0.7)

  // grit: the shoe catching on the rails
  const grit = ctx.createGain()
  grit.gain.setValueAtTime(1, when)
  for (let t = 0.004; t < dur; t += 0.004 + Math.random() * 0.003) {
    grit.gain.setValueAtTime(0.35 + Math.random() * 0.65, when + t)
  }
  // body envelope: quick in, a little swell, out
  const env = ctx.createGain()
  env.gain.setValueAtTime(0, when)
  env.gain.linearRampToValueAtTime(0.5, when + 0.006)
  env.gain.linearRampToValueAtTime(0.6, when + dur * 0.55)
  env.gain.linearRampToValueAtTime(0, when + dur)
  src.connect(bp).connect(hp).connect(grit).connect(env).connect(destination)

  // landing in the detent at the end of travel
  const tickAt = when + dur - 0.004
  const tick = noiseBurst(ctx, tickAt, 0.01)
  const tickHp = filter(ctx, 'highpass', 2600, 0.7)
  const tickGain = hit(ctx, tickAt, 0.4, 0.0005, 0.008)
  tick.connect(tickHp).connect(tickGain).connect(destination)

  disposeAfter([src, tick], [src, bp, hp, grit, env, tick, tickHp, tickGain])
}

/* --- Foley: push buttons (REF, CLR, TX SEND) ---------------------------------------- */
/**
 * A high-tension sprung push switch: an instant, very sharp snap of
 * highpassed noise as the snap-dome flips, the plunger knocking its stop, and
 * the return spring ringing briefly at a couple of inharmonic pitches.
 */
export function scheduleButtonSnap(ctx: Ctx, destination: AudioNode, when = ctx.currentTime): void {
  const snap = noiseBurst(ctx, when, 0.006)
  const snapHp = filter(ctx, 'highpass', 3600, 0.8)
  const snapGain = hit(ctx, when, 0.62, 0.0003, 0.0045)
  snap.connect(snapHp).connect(snapGain).connect(destination)

  const plunger = pitchDrop(ctx, 'triangle', when, 950, 380, 0.012, 0.03)
  const plungerGain = hit(ctx, when, 0.17, 0.0004, 0.016)
  plunger.connect(plungerGain).connect(destination)

  const sources: AudioScheduledSourceNode[] = [snap, plunger]
  const nodes: AudioNode[] = [snap, snapHp, snapGain, plunger, plungerGain]
  for (const [hz, gain, decay] of [[3170, 0.1, 0.07], [4730, 0.055, 0.05]] as const) {
    const spring = ctx.createOscillator()
    spring.type = 'sine'
    spring.frequency.setValueAtTime(hz, when)
    spring.frequency.linearRampToValueAtTime(hz * 0.985, when + decay) // the spring relaxes
    const g = hit(ctx, when + 0.001, gain, 0.0008, decay)
    spring.connect(g).connect(destination)
    spring.start(when)
    spring.stop(when + decay + 0.01)
    sources.push(spring)
    nodes.push(spring, g)
  }
  disposeAfter(sources, nodes)
}

/* --- Foley: the reference card ------------------------------------------------------ */
/**
 * Heavy cardstock dragged through the metal slot behind the chassis.
 * Bandpassed noise with a fibrous, uneven grain. The volume envelope follows
 * the card's friction keyframes exactly (src/utils/cardMotion.ts):
 *
 *   slide (fade in, hold) ─► STUCK (silence) ─► breaks free (spike) ─► glide (fade out)
 *   open:  0-378 ms           378-546 ms          546 ms                 to 945 ms
 *   close: 0-323 ms           323-475 ms          475 ms                 to 902 ms
 *
 * With prefers-reduced-motion the card moves instantly, so only a short
 * scrape plays.
 */
export function schedulePaperScrape(
  ctx: Ctx,
  destination: AudioNode,
  isOpening = true,
  when = ctx.currentTime,
  reducedMotion = false,
): void {
  const ph = cardMotionPhasesMs(isOpening)
  const stick = ph.stickMs / 1000
  const release = ph.releaseMs / 1000
  const settle = ph.settleMs / 1000
  const total = reducedMotion ? 0.14 : ph.durationMs / 1000
  const level = isOpening ? 0.42 : 0.36

  const src = noiseBurst(ctx, when, total + 0.03)
  const bp = filter(ctx, 'bandpass', isOpening ? 1500 : 1250, 0.85)
  const lp = filter(ctx, 'lowpass', 4200, 0.6)

  // fibrous grain: the card's edge catching on the slot, ~7 ms steps
  const grain = ctx.createGain()
  grain.gain.setValueAtTime(1, when)
  for (let t = 0.007; t < total; t += 0.005 + Math.random() * 0.005) {
    grain.gain.setValueAtTime(0.55 + Math.random() * 0.45, when + t)
  }

  const env = ctx.createGain()
  const g = env.gain
  const f = bp.frequency
  const base = isOpening ? 1500 : 1250
  g.setValueAtTime(0, when)
  f.setValueAtTime(base, when)

  if (reducedMotion) {
    g.linearRampToValueAtTime(level, when + 0.02)
    g.linearRampToValueAtTime(0, when + total)
  } else {
    // 1. slide: fade in, then hold while the card travels (easing slightly into the catch)
    g.linearRampToValueAtTime(level, when + 0.035)
    g.linearRampToValueAtTime(level * 0.82, when + stick - 0.012)
    f.linearRampToValueAtTime(base * 0.86, when + stick)
    // 2. stuck on the lip: silence
    g.linearRampToValueAtTime(0, when + stick + 0.01)
    g.setValueAtTime(0, when + release)
    // 3. breaks free: a sharp, brighter spike
    g.linearRampToValueAtTime(level * 1.35, when + release + 0.008)
    f.setValueAtTime(base * 1.75, when + release)
    // 4. glides out: fade to nothing as the card settles
    g.setTargetAtTime(0, when + release + 0.02, (settle - release) / 4.2)
    f.exponentialRampToValueAtTime(base * 0.8, when + settle)
    g.setValueAtTime(0, when + total)

    // the edge flicking off the lip as it breaks free
    const flick = noiseBurst(ctx, when + release, 0.012)
    const flickHp = filter(ctx, 'highpass', 2200, 0.7)
    const flickGain = hit(ctx, when + release, 0.3, 0.0006, 0.01)
    flick.connect(flickHp).connect(flickGain).connect(destination)
    disposeAfter([flick], [flick, flickHp, flickGain])
  }

  src.connect(bp).connect(lp).connect(grain).connect(env).connect(destination)
  disposeAfter([src], [src, bp, lp, grain, env])
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

/**
 * The sidetone for `durationMs` (5 ms attack / 5 ms release). Your own keying
 * is always 700 Hz; other operators come through at their own beat note
 * (`hz`), the way every station sounds slightly different on a real receiver.
 * The pitch is set at the key-down instant, when the tone is (near) silent.
 */
export function playTone(durationMs: number, hz: number = SIDETONE_HZ): void {
  if (!(durationMs > 0)) return
  const pitch = Number.isFinite(hz) && hz > 0 ? hz : SIDETONE_HZ
  whenRunning((e) => {
    const t = e.ctx.currentTime
    e.sidetone.oscillator.frequency.setValueAtTime(pitch, t)
    e.sidetone.key(durationMs, t)
  })
}

/** The ghost's distorted, sagging tone for one Morse element */
export function playGhostTone(durationMs: number): void {
  if (!(durationMs > 0)) return
  whenRunning((e) => scheduleGhostTone(e.ctx, e.master, durationMs, e.ctx.currentTime))
}

/* --- Public Foley API ---------------------------------------------------------- */
/** VFO rotary encoder: a muffled ball-bearing thud. `heavy` = a station detent. */
export function playEncoderThud(heavy = false): void {
  whenRunning((e) => scheduleEncoderThud(e.ctx, e.master, heavy, e.ctx.currentTime))
}

/** MAIN POWER breaker: "KA-CHUNK" with a metallic ring (OFF is lower and duller) */
export function playBreakerThunk(turningOn = true): void {
  whenRunning((e) => scheduleBreakerThunk(e.ctx, e.master, turningOn, e.ctx.currentTime))
}

/** DECODER slide: a gritty metal scrape along the track, ending in the detent */
export function playSliderScrape(toOn = true): void {
  whenRunning((e) => scheduleSliderScrape(e.ctx, e.master, toOn, e.ctx.currentTime))
}

/** REF / CLR / TX SEND: a sharp, high-tension sprung snap */
export function playButtonSnap(): void {
  whenRunning((e) => scheduleButtonSnap(e.ctx, e.master, e.ctx.currentTime))
}

/**
 * Reference card scraping through the chassis slot, timed to its friction
 * animation. `elapsedMs` is how long the card's animation has already been
 * running; the scrape's timeline is shifted back by that much, and by the
 * device's audio output latency, so what you hear lands on what you see.
 * (Envelope points that fall in the past simply apply immediately.)
 */
export function playPaperScrape(isOpening: boolean, elapsedMs = 0): void {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  whenRunning((e) => {
    const latency = (e.ctx.outputLatency || 0) + (e.ctx.baseLatency || 0)
    const when = e.ctx.currentTime - Math.max(0, elapsedMs) / 1000 - latency
    schedulePaperScrape(e.ctx, e.master, isOpening, when, reduced)
  })
}

/** Engine status, for debugging and tests */
export function getAudioState(): { state: AudioContextState | 'locked'; staticLevel: number } {
  return { state: engine ? engine.ctx.state : 'locked', staticLevel }
}
