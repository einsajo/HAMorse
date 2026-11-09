import { useCallback, useEffect, useRef } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import './TopPanel.css'
import { useRadio } from '../context/RadioContext'
import { playBreakerThunk, playSliderScrape, unlockAudio } from '../utils/audioEngine'
import { usePowerHint } from '../hooks/usePowerHint'
import { useMorseDecoder } from '../hooks/useMorseDecoder'
import { getBandInfo } from '../constants'
import type { Band } from '../constants'

/* Shared silkscreen-wear filter: fine noise knocks holes out of printed ink */
function InkWear({ id }: { id: string }) {
  return (
    <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="3" result="noise" />
      <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3.2 0 0 0 -0.9" result="wear" />
      <feComposite in="SourceGraphic" in2="wear" operator="in" />
    </filter>
  )
}

/**
 * Physical switches act the instant they are pushed (pointer down), not on
 * release. Keyboard users can flip them with Enter / Space.
 */
function useToggleHandlers(onToggle: () => void) {
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return // primary button / touch / pen only
      onToggle()
    },
    [onToggle],
  )
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onToggle()
      }
    },
    [onToggle],
  )
  return { onPointerDown, onKeyDown }
}

const r2 = (n: number) => Math.round(n * 100) / 100
const deg = (d: number) => (d * Math.PI) / 180

/* ==========================================================================
   Left: MAIN POWER, a heavy-duty MCB (miniature circuit breaker) whose
   handle throws vertically, plus an unlit LED jewel.  Box = 100 x 80 units.
   ========================================================================== */
interface SwitchProps {
  on: boolean
  onToggle: () => void
}

interface PowerSwitchProps extends SwitchProps {
  /** glow to draw the eye (Quick Start guide) */
  attention?: boolean
}

function PowerSwitch({ on, onToggle, attention = false }: PowerSwitchProps) {
  const handlers = useToggleHandlers(onToggle)
  return (
    <div className="power">
      <svg className="tp-print" viewBox="0 0 100 80" aria-hidden="true">
        <defs>
          <InkWear id="tp-wear-power" />
        </defs>
        <g className="tp-ink" filter="url(#tp-wear-power)">
          <text x="90" y="31" className="tp-label tp-label--small">ON</text>
          <text x="90" y="55" className="tp-label tp-label--small">OFF</text>
          <text x="20" y="52" className="tp-label tp-label--small">PWR</text>
        </g>
      </svg>

      {/* the jewel lights when the breaker is closed */}
      <span className="power__led" data-on={on} aria-hidden="true" />

      {/* the whole breaker block is the touch target; the handle snaps inside it */}
      <div
        className="mcb"
        data-on={on}
        data-attention={attention}
        role="switch"
        aria-checked={on}
        aria-label="Main power"
        tabIndex={0}
        {...handlers}
        // touch: pointerdown is not a user activation, so audio is (re)unlocked on release too
        onPointerUp={unlockAudio}
        onClick={unlockAudio}
      >
        <span className="mcb__vent mcb__vent--top" aria-hidden="true" />
        <span className="mcb__term mcb__term--top" aria-hidden="true">
          <span className="mcb__screw" />
        </span>
        <span className="mcb__slot" aria-hidden="true">
          <span className="mcb__handle" />
        </span>
        <span className="mcb__term mcb__term--bottom" aria-hidden="true">
          <span className="mcb__screw" />
        </span>
        <span className="mcb__vent mcb__vent--bottom" aria-hidden="true" />
      </div>
    </div>
  )
}

/* ==========================================================================
   Centre: analog S-meter (window = 240 x 100 units, needle pivot below it)
   ========================================================================== */
const PIVOT = { x: 120, y: 150 }
const ARC_R = 116
/* S1..S9 then +20/+40 dB, mapped to needle angles (0deg = straight up) */
const S_ANGLE = (s: number) => -38 + (s - 1) * 6.25 // S1 = -38deg ... S9 = +12deg
const DB_ANGLE: Record<number, number> = { 20: 26, 40: 40 }
const NEEDLE_REST = -44 // resting on the left stop: zero signal

const polar = (aDeg: number, r: number) => ({
  x: r2(PIVOT.x + r * Math.sin(deg(aDeg))),
  y: r2(PIVOT.y - r * Math.cos(deg(aDeg))),
})

const arcPath = (a0: number, a1: number, r: number) => {
  const p0 = polar(a0, r)
  const p1 = polar(a1, r)
  return `M${p0.x} ${p0.y}A${r} ${r} 0 0 1 ${p1.x} ${p1.y}`
}

const S_TICKS = Array.from({ length: 9 }, (_, i) => {
  const s = i + 1
  const a = S_ANGLE(s)
  const major = s % 2 === 1
  const p0 = polar(a, ARC_R)
  const p1 = polar(a, ARC_R + (major ? 11 : 6))
  return { s, a, major, d: `M${p0.x} ${p0.y}L${p1.x} ${p1.y}` }
})

/* half-unit minor ticks across the dB section */
const DB_TICKS = [19, 26, 33, 40].map((a) => {
  const major = a === 26 || a === 40
  const p0 = polar(a, ARC_R)
  const p1 = polar(a, ARC_R + (major ? 11 : 6))
  return { a, major, d: `M${p0.x} ${p0.y}L${p1.x} ${p1.y}` }
})

/* --- Needle physics -------------------------------------------------------
   A small damped-spring model of a moving-coil meter movement. The needle is
   driven toward a target angle and is caught by hard end stops at both ends,
   where it bounces. Angles are degrees (0 = straight up). */
type NeedleMode = 'off' | 'dead' | 'ham' | 'keying' | 'carrier' | 'broadcast' | 'peak'

const STOP_LEFT = NEEDLE_REST // zero signal: resting on the left stop
const STOP_RIGHT = 43 // just past the +40 dB mark

/**
 * Flutter profiles: the needle is driven to `base +/- spread` (occasionally a
 * bigger `flick`) at random intervals between minMs and maxMs.
 *   dead       barely off zero: hiss, hovering around S1 and dipping toward 0
 *   ham        live amateur traffic: busy, restless S4-S7
 *   keying     an operator on this frequency is sending to you: a strong,
 *              close signal kicking around S8
 *   carrier    a reserved receive-only slot: a steady, unmodulated S5
 *   broadcast  a strong, steady commercial carrier: pinned at S9
 */
interface Flutter {
  base: number
  spread: number
  flickChance: number
  flickSpread: number
  minMs: number
  maxMs: number
}

const FLUTTER: Record<'dead' | 'ham' | 'keying' | 'carrier' | 'broadcast', Flutter> = {
  dead: { base: S_ANGLE(1) - 2.5, spread: 2.5, flickChance: 0.06, flickSpread: 4.5, minMs: 110, maxMs: 320 },
  ham: { base: (S_ANGLE(4) + S_ANGLE(7)) / 2, spread: 8, flickChance: 0.15, flickSpread: 10.5, minMs: 45, maxMs: 150 },
  keying: { base: S_ANGLE(8), spread: 2.2, flickChance: 0.12, flickSpread: 4.5, minMs: 40, maxMs: 110 },
  carrier: { base: S_ANGLE(5), spread: 0.6, flickChance: 0.03, flickSpread: 1.4, minMs: 150, maxMs: 340 },
  broadcast: { base: S_ANGLE(9), spread: 0.7, flickChance: 0.05, flickSpread: 1.6, minMs: 120, maxMs: 280 },
}

/** Where the needle settles with prefers-reduced-motion (no physics) */
const RESTING_ANGLE: Record<NeedleMode, number> = {
  off: STOP_LEFT,
  dead: FLUTTER.dead.base,
  ham: FLUTTER.ham.base,
  keying: FLUTTER.keying.base,
  carrier: FLUTTER.carrier.base,
  broadcast: FLUTTER.broadcast.base,
  peak: STOP_RIGHT,
}
const SPRING = 380 // restoring stiffness (1/s^2)
const DAMPING = 22 // coil damping (1/s): slightly under-damped, so it twitches
const BOUNCE = 0.6 // energy kept when the needle hits an end stop (visible peg bounce)

function useNeedle(mode: NeedleMode) {
  const ref = useRef<SVGGElement>(null)
  const sim = useRef({ angle: STOP_LEFT, vel: 0, target: STOP_LEFT, nextFlutter: 0 })

  useEffect(() => {
    const s = sim.current
    const write = () => ref.current?.style.setProperty('--needle-angle', `${s.angle.toFixed(2)}deg`)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      s.angle = RESTING_ANGLE[mode]
      s.vel = 0
      write()
      return
    }

    let raf = 0
    let last = performance.now()
    let restFor = 0
    s.nextFlutter = 0

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      // what the coil is being driven toward
      if (mode === 'off') {
        s.target = STOP_LEFT - 16 // spring returns it hard onto the zero stop
      } else if (mode === 'peak') {
        // drive far past the stop, so it arrives at speed, slams in and rebounds
        s.target = STOP_RIGHT + 38 + (Math.random() - 0.5) * 4
      } else if (now >= s.nextFlutter) {
        // signal: random flutter around the band's level, with the occasional bigger flick
        const f = FLUTTER[mode]
        const flick = Math.random() < f.flickChance
        s.target = f.base + (Math.random() * 2 - 1) * (flick ? f.flickSpread : f.spread)
        s.nextFlutter = now + f.minMs + Math.random() * (f.maxMs - f.minMs)
      }

      // semi-implicit Euler, sub-stepped for stability
      const steps = 4
      const h = dt / steps
      for (let i = 0; i < steps; i++) {
        s.vel += (SPRING * (s.target - s.angle) - DAMPING * s.vel) * h
        s.angle += s.vel * h
        if (s.angle > STOP_RIGHT) {
          s.angle = STOP_RIGHT
          if (s.vel > 0) s.vel = -s.vel * BOUNCE
        } else if (s.angle < STOP_LEFT) {
          s.angle = STOP_LEFT
          if (s.vel < 0) s.vel = -s.vel * BOUNCE
        }
      }
      write()

      // resting against a stop (power off, or pinned): park the loop
      const atStop = s.angle === STOP_LEFT || s.angle === STOP_RIGHT
      const restsAtStop = mode === 'off' || mode === 'peak'
      restFor = restsAtStop && atStop && Math.abs(s.vel) < 2 ? restFor + dt : 0
      if (restFor > 0.4) {
        s.vel = 0
        return
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode])

  return { ref, angle: sim.current.angle }
}

interface SMeterProps {
  isPowerOn: boolean
  frequency: number
  /** a ham operator is sending on this frequency */
  isReceiving: boolean
}

const METER_LABEL: Record<NeedleMode, string> = {
  off: 'S-meter, no signal',
  dead: 'S-meter, dead air around S1',
  ham: 'S-meter, amateur traffic around S4 to S7',
  keying: 'S-meter, station sending around S8',
  carrier: 'S-meter, steady carrier around S5',
  broadcast: 'S-meter, strong station at S9',
  peak: 'S-meter, signal pinned at plus 40 dB',
}

const BAND_TO_MODE: Record<Band, NeedleMode> = {
  dead: 'dead',
  reserved: 'carrier',
  ham: 'ham',
  broadcast: 'broadcast',
  ghost: 'peak',
}

function SMeter({ isPowerOn, frequency, isReceiving }: SMeterProps) {
  const band = getBandInfo(frequency).band
  // the ghost keeps the needle pinned whatever it's doing
  const mode: NeedleMode = !isPowerOn ? 'off' : isReceiving && band === 'ham' ? 'keying' : BAND_TO_MODE[band]
  const needle = useNeedle(mode)
  const needleTip = polar(0, ARC_R + 4)
  return (
    <div className="meter" role="img" aria-label={METER_LABEL[mode]} data-mode={mode}>
      <span className="meter__screw meter__screw--l" aria-hidden="true" />
      <span className="meter__screw meter__screw--r" aria-hidden="true" />

      <div className="meter__window">
        <svg className="meter__scale" viewBox="0 0 240 100" aria-hidden="true">
          <defs>
            <filter id="tp-print-wear" x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="11" result="n" />
              <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.6 0 0 0 -0.55" result="w" />
              <feComposite in="SourceGraphic" in2="w" operator="in" />
            </filter>
          </defs>

          <g filter="url(#tp-print-wear)">
            {/* black S-unit arc + red over-S9 band */}
            <path className="meter__arc" d={arcPath(S_ANGLE(1), S_ANGLE(9), ARC_R)} />
            <path className="meter__arc meter__arc--red" d={arcPath(S_ANGLE(9), DB_ANGLE[40], ARC_R + 1.6)} />

            {S_TICKS.map((t) => (
              <path key={t.s} className={`meter__tick${t.major ? ' meter__tick--major' : ''}`} d={t.d} />
            ))}
            {DB_TICKS.map((t) => (
              <path key={t.a} className={`meter__tick meter__tick--red${t.major ? ' meter__tick--major' : ''}`} d={t.d} />
            ))}

            {S_TICKS.filter((t) => t.major).map((t) => {
              const p = polar(t.a, ARC_R + 23)
              return (
                <text key={t.s} x={p.x} y={p.y} className="meter__num" textAnchor="middle" dominantBaseline="central">
                  {t.s}
                </text>
              )
            })}
            {[20, 40].map((db) => {
              const p = polar(DB_ANGLE[db], ARC_R + 25)
              return (
                <text key={db} x={p.x} y={p.y} className="meter__num meter__num--red" textAnchor="middle" dominantBaseline="central">
                  +{db}
                </text>
              )
            })}

            <text x="22" y="84" className="meter__unit">S</text>
            <text x="218" y="84" className="meter__unit meter__unit--red" textAnchor="end">dB</text>
            <text x="120" y="66" className="meter__brand" textAnchor="middle">SIGNAL</text>
          </g>

          {/* thin physical needle; --needle-angle is written every frame by useNeedle */}
          <g
            ref={needle.ref}
            className="meter__needle"
            style={{ '--needle-angle': `${needle.angle.toFixed(2)}deg` } as CSSProperties}
          >
            <line
              x1={PIVOT.x}
              y1={PIVOT.y}
              x2={needleTip.x}
              y2={needleTip.y}
              className="meter__needle-shadow"
              transform="translate(2.2 2.6)"
            />
            <line x1={PIVOT.x} y1={PIVOT.y} x2={needleTip.x} y2={needleTip.y} className="meter__needle-line" />
          </g>
        </svg>

        {/* black pivot cover at the bottom of the dial */}
        <span className="meter__hub" aria-hidden="true" />
        {/* deep glass: heavy inner shadow + glare, above everything */}
        <span className="meter__glass" aria-hidden="true" />
      </div>
    </div>
  )
}

/* ==========================================================================
   Right: DECODER horizontal slide switch (OFF left / ON right). Box = 100 x 84.
   ========================================================================== */
function DecoderSwitch({ on, onToggle }: SwitchProps) {
  const handlers = useToggleHandlers(onToggle)
  return (
    <div className="decoder">
      <svg className="tp-print" viewBox="0 0 100 84" aria-hidden="true">
        <defs>
          <InkWear id="tp-wear-dec" />
        </defs>
        <g className="tp-ink" filter="url(#tp-wear-dec)">
          <text x="50" y="22" className="tp-label">DECODER</text>
          <text x="8" y="49" className="tp-label tp-label--small">OFF</text>
          <text x="92" y="49" className="tp-label tp-label--small">ON</text>
        </g>
      </svg>

      {/* the whole plate is the touch target; the grip slides along its slot */}
      <div
        className="decoder__plate"
        data-on={on}
        role="switch"
        aria-checked={on}
        aria-label="Decoder"
        tabIndex={0}
        {...handlers}
      >
        <span className="decoder__screw decoder__screw--l" aria-hidden="true" />
        <span className="decoder__screw decoder__screw--r" aria-hidden="true" />
        <span className="decoder__slot" aria-hidden="true" />
        <span className="decoder__thumb" aria-hidden="true" />
      </div>
    </div>
  )
}

/**
 * Top Panel: MCB power breaker | S-meter | DECODER slide switch.
 * Both switches read and write the global radio state (RadioContext); the
 * S-meter needle reacts to power and to the tuned frequency.
 */
export default function TopPanel() {
  const { frequency, isPowerOn, isDecoderOn, togglePower, toggleDecoder } = useRadio()
  const { isReceiving } = useMorseDecoder()
  const { attention, nudge } = usePowerHint()

  // The breaker is the ONLY control allowed to start audio (mobile autoplay policy).
  const onPower = useCallback(() => {
    unlockAudio()
    playBreakerThunk(!isPowerOn) // KA-CHUNK
    togglePower()
  }, [isPowerOn, togglePower])

  // metal shoe scraping along the slide's track (silent until audio is unlocked).
  // It still slides with the power off; before the first power-on, show the guide.
  const onDecoder = useCallback(() => {
    if (!isPowerOn) nudge()
    playSliderScrape(!isDecoderOn)
    toggleDecoder()
  }, [isPowerOn, isDecoderOn, nudge, toggleDecoder])

  return (
    <section className="top" aria-label="Top Panel">
      <div className="top__col top__col--power">
        <PowerSwitch on={isPowerOn} onToggle={onPower} attention={attention} />
      </div>
      <div className="top__col top__col--meter">
        <SMeter isPowerOn={isPowerOn} frequency={frequency} isReceiving={isReceiving} />
      </div>
      <div className="top__col top__col--decoder">
        <DecoderSwitch on={isDecoderOn} onToggle={onDecoder} />
      </div>
    </section>
  )
}
