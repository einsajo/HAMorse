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
import { REF_CARD_MOTION, cardSpeedAt } from './cardMotion'

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
  reserved: 0.35, // a steady carrier, nothing on it yet
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
 * What the ghost sounds like (once the mask slips): not a clean 700 Hz sidetone but a
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
/*
 * How the mechanical sounds are built, and why they no longer sound "synth":
 *
 *  1. Excite, then resonate (modal synthesis). A real click is a near-instant
 *     impulse that makes the parts ring: the snap dome, the phenolic case, the
 *     panel it is screwed to. So every sound is a tiny burst of noise fed into
 *     a small bank of band-pass resonators tuned to those parts, NOT an
 *     oscillator with a pitch drop (that is what made the old breaker and VFO
 *     sound like a drum machine's kick).
 *  2. Friction is a crowd of stick-slip events. A slider or a card is
 *     hundreds of tiny ticks whose density and loudness follow how fast the
 *     part is moving, not a steady filtered hiss.
 *  3. Nothing ever plays twice the same. Pitches, levels and timings are
 *     jittered every time, the way no two presses of a real switch match.
 *  4. Everything sits in a room. A short synthesised room response (early
 *     reflections off the desk and walls, then a dark ~0.35 s tail) is mixed
 *     in quietly, so the sounds happen *somewhere* instead of inside your ears.
 */
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
  const len = Math.min(1.9, seconds)
  const offset = Math.random() * Math.max(0, 2 - len - 0.01)
  src.start(when, offset, len + 0.005)
  return src
}

function filter(ctx: Ctx, type: BiquadFilterType, hz: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = Math.min(hz, ctx.sampleRate * 0.45)
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

/** uniform random number in [lo, hi) */
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo)
/** `x` jittered by up to +/- `amount` (fraction) */
const vary = (x: number, amount = 0.04) => x * (1 + (Math.random() * 2 - 1) * amount)

/** Collects a one-shot's nodes so they can all be disconnected when it ends */
interface OneShot {
  ctx: Ctx
  node: <T extends AudioNode>(n: T) => T
  source: <T extends AudioScheduledSourceNode>(s: T) => T
  done: () => void
}

function oneShot(ctx: Ctx): OneShot {
  const sources: AudioScheduledSourceNode[] = []
  const nodes: AudioNode[] = []
  return {
    ctx,
    node: (n) => (nodes.push(n), n),
    source: (s) => (sources.push(s), nodes.push(s), s),
    done: () => disposeAfter(sources, nodes),
  }
}

/** The output bus of one sound, at `level` */
function bus(s: OneShot, out: AudioNode, level: number): GainNode {
  const g = s.node(s.ctx.createGain())
  g.gain.value = level
  g.connect(out)
  return g
}

interface ExciteOptions {
  /** burst length (s): a click is ~1 ms, a knock a few ms */
  len: number
  peak?: number
  /** high-pass and low-pass corners shaping the burst (0 = none) */
  hp?: number
  lp?: number
}

const pulseCache = new WeakMap<Ctx, Map<number, AudioBuffer>>()

/**
 * A contact pulse: one half-sine bump `samples` long. This is what a strike
 * really is. A hard contact is brief and excites everything (bright); a
 * soft one lasts longer and only the low modes respond (dull). Unlike a
 * snippet of noise, it carries the same energy every time.
 */
function contactPulse(ctx: Ctx, samples: number): AudioBuffer {
  let byWidth = pulseCache.get(ctx)
  if (!byWidth) pulseCache.set(ctx, (byWidth = new Map()))
  let buf = byWidth.get(samples)
  if (!buf) {
    buf = ctx.createBuffer(1, samples + 2, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < samples; i++) d[i + 1] = Math.sin((Math.PI * (i + 0.5)) / samples)
    byWidth.set(samples, buf)
  }
  return buf
}

/** How much random texture rides on a strike (the rest is the clean contact pulse) */
const STRIKE_GRIT = 0.35

/**
 * A strike: a contact pulse (consistent energy; its width follows `lp`, so a
 * dull strike is a longer, softer contact) plus a little noise for the grain
 * of real materials. Returns the node to feed into resonators.
 */
function excite(s: OneShot, when: number, { len, peak = 1, hp = 0, lp = 0 }: ExciteOptions): AudioNode {
  const ctx = s.ctx
  const sum = s.node(ctx.createGain())
  const width = lp > 0 ? 0.5 / lp : 0.00009 // contact time (s)
  const samples = Math.max(2, Math.round(vary(width, 0.15) * ctx.sampleRate))
  const pulse = s.source(ctx.createBufferSource())
  pulse.buffer = contactPulse(ctx, samples)
  const pulseGain = s.node(ctx.createGain())
  // keep the pulse's energy roughly independent of its width
  pulseGain.gain.value = peak * Math.min(3, Math.sqrt(8 / samples))
  pulse.connect(pulseGain).connect(sum)
  pulse.start(when)

  const grit = s.source(noiseBurst(ctx, when, len + 0.004))
  const gritEnv = s.node(hit(ctx, when, peak * STRIKE_GRIT, 0.00012, len))
  grit.connect(gritEnv).connect(sum)

  let tail: AudioNode = sum
  if (hp > 0) tail = tail.connect(s.node(filter(ctx, 'highpass', hp, 0.7)))
  if (lp > 0) tail = tail.connect(s.node(filter(ctx, 'lowpass', lp, 0.7)))
  return tail
}

/** [frequency Hz, Q, relative level] of one resonant mode of a part */
type Mode = readonly [number, number, number]

/**
 * Ring `input` through a bank of band-pass resonators (one per mode) into
 * `out`. A band-pass's response to a short impulse shrinks as its Q rises,
 * so each mode's level is scaled by its Q to keep the balance as written.
 */
function resonate(s: OneShot, input: AudioNode, modes: readonly Mode[], out: AudioNode, scale = 1): void {
  for (const [hz, q, level] of modes) {
    const bp = s.node(filter(s.ctx, 'bandpass', hz, q))
    const g = s.node(s.ctx.createGain())
    g.gain.value = level * Math.max(1, q) * 0.5 * scale
    input.connect(bp).connect(g).connect(out)
  }
}

/** Pass some of the raw strike straight through: the hard leading edge of a click */
function edge(s: OneShot, input: AudioNode, out: AudioNode, level: number, hp = 2500): void {
  const f = s.node(filter(s.ctx, 'highpass', hp, 0.7))
  const g = s.node(s.ctx.createGain())
  g.gain.value = level
  input.connect(f).connect(g).connect(out)
}

/**
 * A metallic ring (a spring or a steel frame): decaying sines at inharmonic
 * pitches, each with its own decay. Real metal rings for much longer than a
 * stable band-pass can, so these are the one place oscillators are used.
 */
function ring(s: OneShot, when: number, partials: readonly (readonly [number, number, number])[], out: AudioNode): void {
  for (const [hz, level, decay] of partials) {
    const osc = s.source(s.ctx.createOscillator())
    osc.type = 'sine'
    osc.frequency.value = vary(hz, 0.015)
    const g = s.node(hit(s.ctx, when, level, 0.0006, decay))
    osc.connect(g).connect(out)
    osc.start(when)
    osc.stop(when + decay + 0.02)
  }
}

/**
 * Stick-slip friction: a Poisson train of tiny ticks on one noise source.
 * `profile(u)` (u = 0..1 across `dur`) is the part's speed, 0..1: it sets
 * both how often the surfaces catch and how hard. Returns the node carrying
 * the ticks so they can be filtered / resonated.
 */
function grains(
  s: OneShot,
  when: number,
  dur: number,
  { rate, peak, tau = 0.00035, profile }: { rate: number; peak: number; tau?: number; profile: (u: number) => number },
): AudioNode {
  const src = s.source(noiseBurst(s.ctx, when, dur + 0.02))
  const g = s.node(s.ctx.createGain())
  const p = g.gain
  g.gain.value = 0
  p.setValueAtTime(0, when)
  const minGap = 0.0003
  let t = rand(0, 0.002)
  while (t < dur) {
    const v = Math.max(0, Math.min(1.6, profile(t / dur)))
    if (v > 0.03) {
      const at = when + t
      p.setValueAtTime(peak * v * rand(0.2, 1), at)
      p.setTargetAtTime(0, at + 0.00004, tau * rand(0.6, 1.8))
    }
    // the faster it moves, the more often the surfaces catch
    t += Math.max(minGap, -Math.log(1 - Math.random()) / (rate * Math.max(v, 0.04)))
  }
  p.setValueAtTime(0, when + dur + 0.004)
  return src.connect(g)
}

/**
 * A smooth gain curve following `profile` (sampled every `stepS`), drawn with
 * linear ramps (setValueCurveAtTime would throw if events overlap).
 */
function contour(s: OneShot, when: number, dur: number, level: number, profile: (u: number) => number, stepS = 0.008): GainNode {
  const g = s.node(s.ctx.createGain())
  g.gain.value = 0
  g.gain.setValueAtTime(0, when)
  for (let t = stepS; t <= dur + 1e-9; t += stepS) {
    g.gain.linearRampToValueAtTime(level * Math.max(0, profile(Math.min(1, t / dur))), when + t)
  }
  g.gain.linearRampToValueAtTime(0, when + dur + stepS)
  return g
}

/* --- Room ------------------------------------------------------------------------- */
/** How much room is mixed in (the dry sound stays at full level) */
const ROOM_WET = 0.16
const ROOM_SECONDS = 0.36
/** Early reflections: [delay ms, level]: desk, chassis lid, near walls */
const EARLY_REFLECTIONS: readonly (readonly [number, number])[] = [
  [2.7, 0.55], [4.9, 0.42], [7.6, 0.33], [11.3, 0.27], [15.8, 0.2], [22.4, 0.15], [29.5, 0.1],
]

/** A synthesised small-room impulse response: reflections, then a tail that darkens as it decays */
function makeRoomResponse(ctx: Ctx): AudioBuffer {
  const sr = ctx.sampleRate
  const len = Math.floor(sr * ROOM_SECONDS)
  const buf = ctx.createBuffer(2, len, sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const t = i / sr
      // walls absorb highs first: the tail gets duller as it fades
      const k = 0.75 - 0.6 * Math.min(1, t / 0.22)
      lp += ((Math.random() * 2 - 1) - lp) * k
      const onset = Math.min(1, t / 0.006)
      d[i] = lp * Math.exp(-t / 0.06) * onset * 0.5
    }
    for (const [ms, level] of EARLY_REFLECTIONS) {
      const i = Math.floor(((ms * (ch ? 1.07 : 1)) / 1000) * sr)
      if (i < len) d[i] += level * (Math.random() < 0.5 ? -1 : 1)
    }
  }
  return buf
}

const roomCache = new WeakMap<AudioNode, AudioNode>()

/** The room every Foley sound plays into (one per output, created on first use) */
function room(ctx: Ctx, destination: AudioNode): AudioNode {
  const cached = roomCache.get(destination)
  if (cached) return cached
  const input = ctx.createGain()
  input.connect(destination)
  const conv = ctx.createConvolver()
  conv.buffer = makeRoomResponse(ctx)
  const wet = ctx.createGain()
  wet.gain.value = ROOM_WET
  input.connect(conv).connect(wet).connect(destination)
  roomCache.set(destination, input)
  return input
}

/* --- Foley: VFO (heavy ball bearings) ------------------------------------------------ */
/**
 * A hardened steel ball riding over the crest between two detents: a tiny dry
 * tick as it tips over, then the dull knock of it dropping into the next
 * pocket, heard through the mass of the knob and the panel. Damped, not
 * boomy: most of it sits around 250 Hz-1.5 kHz, which is also what small phone
 * speakers can play. `heavy` is the bigger detent at a station: a firmer,
 * lower knock with a second little settle as the ball seats.
 */
const ENCODER_LEVEL = 0.73

export function scheduleEncoderThud(ctx: Ctx, destination: AudioNode, heavy = false, when = ctx.currentTime): void {
  const s = oneShot(ctx)
  const out = bus(s, room(ctx, destination), ENCODER_LEVEL * vary(heavy ? 1.5 : 1, 0.15))

  // tipping over the crest
  const tick = excite(s, when, { len: 0.0006, peak: 0.18, hp: 2400 })
  resonate(s, tick, [[vary(3300), 14, 0.5], [vary(5100), 18, 0.25]], out)

  // dropping into the pocket
  const t = when + rand(0.0015, 0.003)
  const knock = excite(s, t, { len: 0.0035, lp: 1700 })
  const body: readonly Mode[] = heavy
    ? [[vary(185), 2, 1.3], [vary(540), 3.5, 0.9], [vary(1120), 5, 0.22]]
    : [[vary(250), 2.2, 1], [vary(700), 3.5, 0.9], [vary(1400), 5, 0.22]]
  resonate(s, knock, body, out)

  if (heavy) {
    // the ball settling in the deeper station detent
    const settle = excite(s, t + rand(0.008, 0.01), { len: 0.003, peak: 0.4, lp: 1500 })
    resonate(s, settle, [[vary(480), 3, 0.9], [vary(980), 4.5, 0.4]], out)
  }
  s.done()
}

/* --- Foley: MAIN POWER breaker ("chk-CLACK") ----------------------------------------- */
/** The phenolic case and the steel latch: where a breaker's clack rings */
const BREAKER_CASE: readonly Mode[] = [
  [1180, 6, 1], [2300, 8, 0.8], [3550, 10, 0.6], [5200, 26, 0.28], [7600, 34, 0.14],
]
/** The main spring and the steel frame, faintly ringing after the clack: [Hz, level, decay s] */
const BREAKER_SPRING = [
  [4310, 0.02, 0.11], [6170, 0.012, 0.08], [2870, 0.014, 0.06],
] as const
const BREAKER_LEVEL = 0.72

/**
 * A real panel breaker: the handle swings against its spring (a short dry
 * rub), the latch snaps over centre (a hard, bright crack that rings the
 * phenolic case), the handle hits its stop and the shock goes through the DIN
 * rail into the panel (a short low knock, not a boom), and when switching ON
 * the contacts close a few ms later (a second, smaller clack). The main
 * spring rings faintly for a moment. Switching OFF is the trip: the spring
 * does the work, so it fires sooner, a touch lower, with no contact clack.
 */
export function scheduleBreakerThunk(ctx: Ctx, destination: AudioNode, turningOn = true, when = ctx.currentTime): void {
  const s = oneShot(ctx)
  const out = bus(s, room(ctx, destination), BREAKER_LEVEL * vary(1, 0.1))
  const k = turningOn ? 1 : 0.92

  // the handle rubbing as it swings against the spring
  const travel = turningOn ? rand(0.022, 0.03) : rand(0.007, 0.011)
  const rub = grains(s, when, travel, { rate: 1400, peak: 0.16, profile: (u) => 0.4 + u })
  rub.connect(s.node(filter(ctx, 'highpass', 1800, 0.7))).connect(out)

  // the latch snapping over centre
  const snapAt = when + travel
  const crack = excite(s, snapAt, { len: 0.0014, hp: 600 })
  resonate(s, crack, BREAKER_CASE.map(([hz, q, l]) => [vary(hz * k), q, l] as const), out)
  edge(s, crack, out, 0.5)

  // the handle hitting its stop, through the rail into the panel
  const stop = excite(s, snapAt + 0.0007, { len: 0.007, peak: 1.3, lp: 1100 })
  resonate(s, stop, [[vary(210 * k), 2.5, 1.1], [vary(520 * k), 4, 0.7], [vary(900 * k), 5, 0.35]], out)

  if (turningOn) {
    // the contacts closing
    const contacts = excite(s, snapAt + rand(0.006, 0.009), { len: 0.001, peak: 0.45, hp: 900 })
    resonate(s, contacts, [[vary(1700), 7, 0.8], [vary(3050), 9, 0.5], [vary(4700), 14, 0.25]], out)
  }

  ring(s, snapAt + 0.0005, BREAKER_SPRING.map(([hz, l, d]) => [hz * k, l, d] as const), out)
  s.done()
}

/* --- Foley: DECODER slide ------------------------------------------------------------ */
/**
 * A small metal slide switch: the shoe drags along its rails (a short burst of
 * stick-slip ticks that swells as it speeds up mid-travel, with a faint rub
 * underneath and the rail ringing slightly), then drops into the end detent
 * with a crisp click and a small knock. ON (to the right) is a touch brighter
 * than OFF.
 */
const SLIDER_LEVEL = 0.52

export function scheduleSliderScrape(ctx: Ctx, destination: AudioNode, toOn = true, when = ctx.currentTime): void {
  const s = oneShot(ctx)
  const out = bus(s, room(ctx, destination), SLIDER_LEVEL * vary(1, 0.1))
  const travel = rand(0.055, 0.075)
  const speed = (u: number) => Math.pow(Math.sin(Math.PI * Math.min(1, u)), 0.6)

  // stick-slip ticks of the shoe on the rails
  const ticks = grains(s, when, travel, { rate: 1300, peak: 0.55, profile: speed })
  const bright = s.node(filter(ctx, 'bandpass', vary(toOn ? 3800 : 3200, 0.06), 0.9))
  ticks.connect(s.node(filter(ctx, 'highpass', 1600, 0.7))).connect(bright).connect(out)
  resonate(s, ticks, [[vary(2050), 12, 0.12]], out) // the rail ringing

  // a faint continuous rub under the ticks
  const rubSrc = s.source(noiseBurst(ctx, when, travel + 0.02))
  const rubEnv = contour(s, when, travel, 0.05, speed, 0.004)
  rubSrc.connect(s.node(filter(ctx, 'highpass', 2400, 0.7))).connect(s.node(filter(ctx, 'lowpass', 7500, 0.7))).connect(rubEnv).connect(out)

  // dropping into the detent
  const endAt = when + travel
  const click = excite(s, endAt, { len: 0.0009, peak: 0.9, hp: 1200 })
  resonate(s, click, [[vary(2900), 12, 0.7], [vary(4600), 16, 0.4], [vary(1500), 6, 0.35]], out)
  edge(s, click, out, 0.3)
  const knock = excite(s, endAt + 0.0006, { len: 0.004, peak: 0.5, lp: 1800 })
  resonate(s, knock, [[vary(620), 3.5, 0.8], [vary(1300), 5, 0.35]], out)
  s.done()
}

/* --- Foley: push buttons (REF, CLR, TX SEND) ---------------------------------------- */
/**
 * A tactile push switch has two sounds, like the real thing.
 * PRESS: the snap dome collapses (a hard, bright tick ringing the dome and the
 * cap), the contacts bounce twice in the next couple of milliseconds, and the
 * plunger bottoms out on the panel a few ms later (a soft, low knock).
 * RELEASE (scheduleButtonRelease): the dome pops back, lighter and higher,
 * with no knock.
 */
const BUTTON_LEVEL = 0.72
const DOME: readonly Mode[] = [[2650, 14, 0.5], [4150, 18, 0.35], [6400, 22, 0.2]]

export function scheduleButtonSnap(ctx: Ctx, destination: AudioNode, when = ctx.currentTime): void {
  const s = oneShot(ctx)
  const out = bus(s, room(ctx, destination), BUTTON_LEVEL * vary(1, 0.12))
  const dome = DOME.map(([hz, q, l]) => [vary(hz), q, l] as const)

  // the dome collapsing, then two contact bounces
  for (const [dt, peak] of [[0, 1], [rand(0.0006, 0.0013), 0.3], [rand(0.0018, 0.003), 0.14]] as const) {
    const strike = excite(s, when + dt, { len: 0.0008, peak, hp: 1500 })
    resonate(s, strike, dome, out)
    edge(s, strike, out, 0.35 * peak, 3000)
  }
  // the plunger bottoming out on the panel
  const knock = excite(s, when + rand(0.003, 0.005), { len: 0.004, peak: 0.6, lp: 2200 })
  resonate(s, knock, [[vary(430), 3, 0.9], [vary(980), 4, 0.6], [vary(1650), 6, 0.3]], out)
  s.done()
}

export function scheduleButtonRelease(ctx: Ctx, destination: AudioNode, when = ctx.currentTime): void {
  const s = oneShot(ctx)
  const out = bus(s, room(ctx, destination), BUTTON_LEVEL * 0.6 * vary(1, 0.15))
  const dome = DOME.map(([hz, q, l]) => [vary(hz * 1.18), q, l] as const)
  for (const [dt, peak] of [[0, 1], [rand(0.0007, 0.0014), 0.22]] as const) {
    const strike = excite(s, when + dt, { len: 0.0007, peak, hp: 2000 })
    resonate(s, strike, dome, out)
    edge(s, strike, out, 0.3 * peak, 3500)
  }
  s.done()
}

/* --- Foley: the reference card ------------------------------------------------------ */
/**
 * Heavy cardstock dragged through the slot behind the chassis. Real paper
 * friction isn't a stream of clicks or a steady hiss. It is a rough, broadband
 * "shhh" whose loudness AND brightness follow how fast the card moves, heard
 * through the hollow metal cabinet it's sliding along. So the sound is
 * driven, millisecond by millisecond, by the card's actual speed, computed
 * from the same keyframes the CSS animation uses (cardSpeedAt):
 *
 *   friction   pink noise through a band-pass that opens up as the card speeds
 *              up (dull when slow, airy when fast), roughened by the paper's
 *              uneven surface (a fast random flutter in level)
 *   body       the slot and cabinet resonating (~340 / 780 / 1450 Hz): what
 *              makes it sound like a card *in a radio* rather than in the air
 *   sheen      a little high fibre hiss, only at speed
 *   judder     slow movement is stick-slip: as the card eases into the catch,
 *              and during the tiny strain wobble while it's stuck, it
 *              chatters ("rrrt") and creaks
 *   buckle     breaking free: the bowed card snaps flat (a low "thup") and its
 *              edge flicks off the lip
 *   landing    a soft slap as it comes to rest out on the desk, or a duller
 *              tap as it tucks home
 *
 * It all sits behind the chassis, so it's shaded (low-passed) a little, then
 * goes into the shared room. With prefers-reduced-motion the card jumps, so
 * a short, simple scrape plays instead.
 */
const PAPER_LEVEL = 0.5
/** card speed (card-lengths per second) that counts as "full speed" */
const CARD_FULL_SPEED = 2.2
/** envelope resolution: fine enough for the snap */
const PAPER_STEP_S = 0.004

const pinkCache = new WeakMap<Ctx, AudioBuffer>()

/** 3 s of pink noise (equal energy per octave, like real friction), normalised */
function pinkNoise(ctx: Ctx): AudioBuffer {
  let buf = pinkCache.get(ctx)
  if (!buf) {
    const length = Math.floor(ctx.sampleRate * 3)
    buf = ctx.createBuffer(1, length, ctx.sampleRate)
    const d = buf.getChannelData(0)
    // Paul Kellet's economy pink filter
    let b0 = 0
    let b1 = 0
    let b2 = 0
    let peak = 0
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + white * 0.099046
      b1 = 0.963 * b1 + white * 0.2965164
      b2 = 0.57 * b2 + white * 1.0526913
      d[i] = b0 + b1 + b2 + white * 0.1848
      peak = Math.max(peak, Math.abs(d[i]))
    }
    for (let i = 0; i < length; i++) d[i] /= peak
    pinkCache.set(ctx, buf)
  }
  return buf
}

function pinkBurst(ctx: Ctx, when: number, seconds: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource()
  src.buffer = pinkNoise(ctx)
  const len = Math.min(2.9, seconds)
  src.start(when, Math.random() * Math.max(0, 3 - len - 0.01), len + 0.005)
  return src
}

/** 0..1 speed, gently compressed (friction gets louder with speed, but not linearly) */
const speedLevel = (cardsPerSecond: number) => Math.min(1.25, Math.pow(cardsPerSecond / CARD_FULL_SPEED, 0.7))

/** how much a card moving at speed level `v` judders (only when it's slow, but moving) */
const judderAt = (v: number) => (v < 0.02 ? 0 : Math.min(1, v / 0.08) * Math.max(0, 1 - v / 0.45))

export function schedulePaperScrape(
  ctx: Ctx,
  destination: AudioNode,
  isOpening = true,
  when = ctx.currentTime,
  reducedMotion = false,
): void {
  const s = oneShot(ctx)
  // behind the chassis: the radio shades the top end a little
  const shade = s.node(filter(ctx, 'lowpass', vary(4300, 0.05), 0.5))
  shade.connect(room(ctx, destination))
  const out = bus(s, shade, PAPER_LEVEL * vary(isOpening ? 1 : 0.9, 0.08))

  const motion = isOpening ? REF_CARD_MOTION.open : REF_CARD_MOTION.close
  const total = reducedMotion ? 0.14 : motion.durationMs / 1000
  /** speed level 0..1.25 at `t` seconds */
  const v = reducedMotion
    ? (t: number) => 0.9 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t / total))), 0.7)
    : (t: number) => speedLevel(cardSpeedAt(isOpening, t * 1000))

  /** drive an AudioParam from the speed, every PAPER_STEP_S */
  const track = (param: AudioParam, f: (v: number) => number, endValue: number) => {
    param.setValueAtTime(f(v(0)), when)
    for (let t = PAPER_STEP_S; t <= total + 1e-9; t += PAPER_STEP_S) param.linearRampToValueAtTime(f(v(t)), when + t)
    param.linearRampToValueAtTime(endValue, when + total + 0.015)
  }
  const level = (n: AudioNode, f: (v: number) => number) => {
    const g = s.node(ctx.createGain())
    g.gain.value = 0
    track(g.gain, f, 0)
    n.connect(g)
    return g
  }

  // 1. friction: pink noise, brighter and louder the faster it goes, roughened by the paper's surface
  const fr = s.source(pinkBurst(ctx, when, total + 0.05))
  const frBand = s.node(filter(ctx, 'bandpass', 900, 0.65))
  const frBase = vary(isOpening ? 620 : 560, 0.06)
  track(frBand.frequency, (x) => frBase + 1900 * Math.min(1, x) ** 0.85, frBase)
  const rough = s.node(ctx.createGain())
  rough.gain.value = 1
  for (let t = 0; t < total; t += rand(0.009, 0.026)) rough.gain.setTargetAtTime(rand(0.45, 1), when + t, rand(0.003, 0.01))
  fr.connect(s.node(filter(ctx, 'highpass', 260, 0.6))).connect(frBand).connect(rough)
  level(rough, (x) => 1.25 * x).connect(out)

  // 2. body: the slot and the cabinet resonating behind it
  const bodySrc = s.source(noiseBurst(ctx, when, total + 0.05))
  const bodyIn = bodySrc.connect(s.node(filter(ctx, 'lowpass', 1800, 0.6)))
  const bodyMix = s.node(ctx.createGain())
  resonate(s, bodyIn, [[vary(340), 1.6, 0.8], [vary(780), 2.2, 0.55], [vary(1450), 3, 0.3]], bodyMix, 0.35)
  level(bodyMix, (x) => 1.5 * x ** 0.9).connect(out)

  // 3. sheen: a little fibre hiss at speed
  const sheenSrc = s.source(noiseBurst(ctx, when, total + 0.05))
  const sheen = sheenSrc.connect(s.node(filter(ctx, 'highpass', 3600, 0.7)))
  level(sheen, (x) => 0.06 * x * x).connect(out)

  if (!reducedMotion) {
    // 4. judder: stick-slip chatter whenever the card crawls (into the catch, straining on the lip)
    const jd = grains(s, when, total, {
      rate: 75,
      peak: 0.75,
      tau: 0.0022,
      profile: (u) => judderAt(v(u * total)),
    })
    const jdLow = jd.connect(s.node(filter(ctx, 'lowpass', 2000, 0.7)))
    resonate(s, jdLow, [[vary(470), 3, 0.8], [vary(1050), 4, 0.45], [vary(1900), 6, 0.2]], out, 0.8)

    // 5. buckle: the bowed card snapping flat as it breaks free, its edge flicking off the lip
    const releaseAt = when + motion.durationMs * motion.releaseAt / 1000
    const thup = excite(s, releaseAt, { len: 0.008, peak: 0.9, lp: 700 })
    resonate(s, thup, [[vary(210), 1.8, 1], [vary(520), 2.6, 0.55], [vary(1150), 4, 0.2]], out)
    const flick = excite(s, releaseAt + rand(0.003, 0.006), { len: 0.002, peak: 0.35, hp: 2200 })
    resonate(s, flick, [[vary(2600), 6, 0.4], [vary(4100), 9, 0.2]], out)

    // 6. landing: a soft slap out on the desk, or a duller tap as it tucks home
    const landAt = when + (isOpening ? motion.durationMs * motion.settleAt : motion.durationMs - 8) / 1000
    const slap = excite(s, landAt, { len: 0.012, peak: isOpening ? 0.45 : 0.35, lp: isOpening ? 1300 : 800 })
    resonate(s, slap, [[vary(300), 1.8, 0.9], [vary(720), 2.6, 0.35]], out)
  }
  s.done()
}

/* --- The ghost's drone (proximity) ------------------------------------------------ */
/**
 * What you hear as you tune close to the wandering ghost: the static drains
 * away and something low and wrong rises in its place. Two saws a hair apart
 * (55 / 55.7 Hz: a slow, queasy beat), a fifth tuned flat (82.1 Hz), a sub
 * (36.7 Hz), a tritone (77.8 Hz) that fades in and out, and a thin detuned
 * hum two octaves up (220 / 221.3 Hz) so phone speakers, which can't play
 * the low end, still hear it, all through a resonant low-pass that slowly
 * breathes (~340-780 Hz), with a slow swell on the whole thing.
 * Continuous and silent until `gain` is raised.
 */
export interface Drone {
  gain: GainNode
}

const DRONE_VOICES: readonly (readonly [OscillatorType, number, number])[] = [
  ['sawtooth', 55, 0.32],
  ['sawtooth', 55.7, 0.3],
  ['sawtooth', 82.1, 0.18],
  ['sine', 36.7, 0.22],
  // a thin, detuned hum higher up: what a phone speaker actually plays
  ['sawtooth', 220, 0.08],
  ['sawtooth', 221.3, 0.07],
]

export function createGhostDrone(ctx: BaseAudioContext, destination: AudioNode): Drone {
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.connect(destination)

  const swell = ctx.createGain()
  swell.gain.value = 0.8
  swell.connect(gain)
  const swellLfo = ctx.createOscillator()
  swellLfo.frequency.value = 0.23
  const swellDepth = ctx.createGain()
  swellDepth.gain.value = 0.2
  swellLfo.connect(swellDepth).connect(swell.gain)

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 560
  lp.Q.value = 3.5
  lp.connect(swell)
  const breath = ctx.createOscillator()
  breath.frequency.value = 0.09
  const breathDepth = ctx.createGain()
  breathDepth.gain.value = 220
  breath.connect(breathDepth).connect(lp.frequency)

  const sources: OscillatorNode[] = [swellLfo, breath]
  for (const [type, hz, level] of DRONE_VOICES) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = hz
    const g = ctx.createGain()
    g.gain.value = level
    o.connect(g).connect(lp)
    sources.push(o)
  }
  // the tritone, drifting in and out
  const tri = ctx.createOscillator()
  tri.type = 'triangle'
  tri.frequency.value = 77.8
  const triGain = ctx.createGain()
  triGain.gain.value = 0.08
  const triLfo = ctx.createOscillator()
  triLfo.frequency.value = 0.061
  const triDepth = ctx.createGain()
  triDepth.gain.value = 0.08
  triLfo.connect(triDepth).connect(triGain.gain)
  tri.connect(triGain).connect(lp)
  sources.push(tri, triLfo)

  for (const o of sources) o.start()
  return { gain }
}

/* --- The trap rumble (fighting a locked dial) -------------------------------------- */
/**
 * Turning the VFO while the ghost holds the frequency: a low, grinding
 * rumble, as if something heavy in the cabinet were resisting. Brown noise
 * through a low-pass, a groan band, and a 41 Hz growl chopped at 7 Hz.
 * Continuous and silent until `gain` is raised.
 */
export interface Rumble {
  gain: GainNode
}

export function createTrapRumble(ctx: BaseAudioContext, destination: AudioNode): Rumble {
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.connect(destination)

  // brown noise: integrated white, normalised
  const length = Math.floor(ctx.sampleRate * 3)
  const buf = ctx.createBuffer(1, length, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  let peak = 1e-6
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    d[i] = last
    peak = Math.max(peak, Math.abs(last))
  }
  for (let i = 0; i < length; i++) d[i] /= peak
  const noise = ctx.createBufferSource()
  noise.buffer = buf
  noise.loop = true

  const low = ctx.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 150
  const groan = ctx.createBiquadFilter()
  groan.type = 'bandpass'
  groan.frequency.value = 230
  groan.Q.value = 2.5
  const groanGain = ctx.createGain()
  groanGain.gain.value = 0.9
  noise.connect(low).connect(gain)
  noise.connect(groan).connect(groanGain).connect(gain)

  const growl = ctx.createOscillator()
  growl.type = 'sawtooth'
  growl.frequency.value = 41
  const growlLp = ctx.createBiquadFilter()
  growlLp.type = 'lowpass'
  growlLp.frequency.value = 320
  const chop = ctx.createGain()
  chop.gain.value = 0.25
  const chopLfo = ctx.createOscillator()
  chopLfo.frequency.value = 7
  const chopDepth = ctx.createGain()
  chopDepth.gain.value = 0.22
  chopLfo.connect(chopDepth).connect(chop.gain)
  growl.connect(growlLp).connect(chop).connect(gain)

  noise.start()
  growl.start()
  chopLfo.start()
  return { gain }
}

/* --- The climax: BANG + feedback screech ------------------------------------------- */
/** Metal panel modes for the bang's ring: [Hz, level, decay s] */
const BANG_RING = [
  [143, 0.22, 1.6], [387, 0.16, 1.9], [811, 0.12, 1.5], [1263, 0.1, 1.3], [1879, 0.08, 1.1],
  [2643, 0.06, 0.9], [3512, 0.045, 0.7], [4987, 0.03, 0.5],
] as const
const BANG_LEVEL = 1.6
/** The feedback howl, Hz */
export const SCREECH_HZ = 2000
const SCREECH_SECONDS = 3.2

/**
 * The flash: a huge metallic BANG (a heavy impact through the cabinet, a
 * crack of noise, a long inharmonic ring of steel) with a 2 kHz feedback
 * screech that howls in, beats against itself, drifts sharp and dies away.
 * It is meant to be startling, not harmful: the master limiter caps it.
 */
export function scheduleHauntBang(ctx: Ctx, destination: AudioNode, when = ctx.currentTime): void {
  const s = oneShot(ctx)
  const out = bus(s, room(ctx, destination), BANG_LEVEL)

  // the impact: a heavy body blow through the cabinet
  const thump = excite(s, when, { len: 0.03, peak: 1.6, lp: 300 })
  resonate(s, thump, [[58, 1.4, 1.2], [96, 2, 0.9], [178, 3, 0.6], [310, 4, 0.35]], out)
  // the crack
  const crack = excite(s, when, { len: 0.012, peak: 1.2, hp: 700 })
  resonate(s, crack, [[1130, 9, 0.7], [1870, 12, 0.6], [2710, 14, 0.5], [3960, 18, 0.35], [5530, 22, 0.2]], out)
  edge(s, crack, out, 0.9, 1500)
  // debris: a burst of noise falling away
  const debris = s.source(noiseBurst(ctx, when, 0.5))
  debris.connect(s.node(filter(ctx, 'bandpass', 1800, 0.5))).connect(s.node(hit(ctx, when, 0.5, 0.002, 0.35))).connect(out)
  // the steel ringing on
  ring(s, when + 0.002, BANG_RING, out)

  // the feedback screech: two sines beating, a little overdriven, howling in and drifting sharp
  const scr = s.node(ctx.createGain())
  scr.gain.value = 0
  scr.gain.setValueAtTime(0, when)
  scr.gain.linearRampToValueAtTime(0.32, when + 0.035)
  scr.gain.linearRampToValueAtTime(0.24, when + 0.4)
  scr.gain.linearRampToValueAtTime(0.36, when + 1.4) // the howl builds
  scr.gain.setTargetAtTime(0, when + 1.8, 0.45)
  const drive = s.node(ctx.createWaveShaper())
  drive.curve = driveCurve ?? (driveCurve = makeDriveCurve())
  scr.connect(drive).connect(out)
  const vib = s.source(ctx.createOscillator())
  vib.frequency.value = 6.2
  const vibDepth = s.node(ctx.createGain())
  vibDepth.gain.value = 9
  vib.connect(vibDepth)
  for (const [hz, level] of [[SCREECH_HZ, 0.7], [SCREECH_HZ * 1.0035, 0.45], [SCREECH_HZ * 2, 0.08]] as const) {
    const o = s.source(ctx.createOscillator())
    o.type = 'sine'
    o.frequency.setValueAtTime(hz, when)
    o.frequency.linearRampToValueAtTime(hz * 1.04, when + SCREECH_SECONDS) // feedback creeping sharp
    vibDepth.connect(o.frequency)
    const g = s.node(ctx.createGain())
    g.gain.value = level
    o.connect(g).connect(scr)
    o.start(when)
    o.stop(when + SCREECH_SECONDS)
  }
  vib.start(when)
  vib.stop(when + SCREECH_SECONDS)
  s.done()
}

/* --- The live engine ------------------------------------------------------------ */
interface Engine {
  ctx: AudioContext
  master: GainNode
  staticChain: StaticChain
  sidetone: Sidetone
  drone: Drone
  rumble: Rumble
}

let engine: Engine | null = null
let staticLevel = 0
/** ghost proximity, 0..1 (the drone's loudness); remembered until audio is unlocked */
let droneLevel = 0
let rumbleLevel = 0
let rumbleAt = 0
let hauntSilenced = false
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
  const drone = createGhostDrone(ctx, master)
  drone.gain.gain.value = droneLevel * DRONE_MAX_GAIN
  const rumble = createTrapRumble(ctx, master)
  if (hauntSilenced) master.gain.value = 0
  return { ctx, master, staticChain, sidetone, drone, rumble }
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
/** VFO rotary encoder: a ball tipping over the crest and knocking into its pocket. `heavy` = a station detent. */
export function playEncoderThud(heavy = false): void {
  whenRunning((e) => scheduleEncoderThud(e.ctx, e.master, heavy, e.ctx.currentTime))
}

/** MAIN POWER breaker: rub, latch crack, stop knock, contacts (ON), spring ring */
export function playBreakerThunk(turningOn = true): void {
  whenRunning((e) => scheduleBreakerThunk(e.ctx, e.master, turningOn, e.ctx.currentTime))
}

/** DECODER slide: stick-slip ticks along the rails, ending in the detent click */
export function playSliderScrape(toOn = true): void {
  whenRunning((e) => scheduleSliderScrape(e.ctx, e.master, toOn, e.ctx.currentTime))
}

/** REF / CLR / TX SEND going down: the snap dome collapses, the plunger bottoms out */
export function playButtonSnap(): void {
  whenRunning((e) => scheduleButtonSnap(e.ctx, e.master, e.ctx.currentTime))
}

/** REF / CLR / TX SEND coming back up: the dome pops back (lighter, higher) */
export function playButtonRelease(): void {
  whenRunning((e) => scheduleButtonRelease(e.ctx, e.master, e.ctx.currentTime))
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

/* --- Public haunt API ----------------------------------------------------------- */
const DRONE_MAX_GAIN = 0.34
const RUMBLE_MAX_GAIN = 0.55
/** how quickly the rumble dies away once you stop fighting the dial */
const RUMBLE_DECAY_MS = 900
const DRONE_RAMP_TC = 0.12

/**
 * How close you are to the ghost, 0..1 (see constants.ghostProximity): the
 * drone rises as you near it (eased, so it creeps in), and is silent both far
 * away and exactly on the frequency.
 */
export function setGhostProximity(closeness: number): void {
  const c = Math.min(1, Math.max(0, Number.isFinite(closeness) ? closeness : 0))
  droneLevel = c * c
  const e = engine
  if (!e) return
  e.drone.gain.gain.setTargetAtTime(droneLevel * DRONE_MAX_GAIN, e.ctx.currentTime, DRONE_RAMP_TC)
}

/**
 * Fighting the locked VFO: each bit of dial travel (`amount`, ~0..0.2 per
 * move) builds the rumble up; it dies away when you stop. The longer you
 * fight, the louder it gets (up to a cap).
 */
export function pushTrapRumble(amount: number): void {
  if (!(amount > 0)) return
  const now = performance.now()
  rumbleLevel = Math.min(1, rumbleLevel * Math.exp(-(now - rumbleAt) / RUMBLE_DECAY_MS) + amount)
  rumbleAt = now
  const level = rumbleLevel
  whenRunning((e) => {
    const g = e.rumble.gain.gain
    const t = e.ctx.currentTime
    if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(t)
    else g.cancelScheduledValues(t)
    g.setTargetAtTime(level * RUMBLE_MAX_GAIN, t, 0.06)
    g.setTargetAtTime(0, t + 0.25, RUMBLE_DECAY_MS / 1000 / 2)
  })
}

/** The blackout: total silence (everything: static, drone, tones), or back to normal */
export function setHauntSilence(silent: boolean): void {
  hauntSilenced = silent
  const e = engine
  if (!e) return
  const g = e.master.gain
  const t = e.ctx.currentTime
  g.cancelScheduledValues(t)
  g.setValueAtTime(g.value, t)
  g.linearRampToValueAtTime(silent ? 0 : MASTER_GAIN, t + (silent ? 0.015 : 0.004))
}

/** The flash: a deafening metallic BANG and a 2 kHz feedback screech (restores the sound first) */
export function playHauntBang(): void {
  setHauntSilence(false)
  whenRunning((e) => scheduleHauntBang(e.ctx, e.master, e.ctx.currentTime))
}

/** Engine status, for debugging and tests */
export function getAudioState(): {
  state: AudioContextState | 'locked'
  staticLevel: number
  droneLevel: number
  rumbleLevel: number
  silenced: boolean
} {
  const rumbleNow = rumbleLevel * Math.exp(-(performance.now() - rumbleAt) / RUMBLE_DECAY_MS)
  return { state: engine ? engine.ctx.state : 'locked', staticLevel, droneLevel, rumbleLevel: rumbleNow, silenced: hauntSilenced }
}
