import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import './TuningDial.css'
import MetalPlate from './MetalPlate'
import { FREQ_MAX, FREQ_MIN, formatFrequency, isTunedTo, useRadio } from '../context/RadioContext'
import { DETENT_FREQUENCIES } from '../constants'

/* --- Silk-screen scale geometry (SVG user units, matches .vfo 132 x 116) --- */
/*
 * The printed scale must be concentric with the knob's *visible* top face, so
 * the dimple points exactly at the ticks. The face is not at the well centre
 * (66, 66): .vfo__mount lifts it by 4% of its own height to show the knob's
 * side wall. In SVG units: the well is 100 units, minus its 3% padding (3% of
 * the 132-unit .vfo width, each side), so the lift is 0.04 * (100 - 2 * 3.96).
 * Keep in sync with `.vfo__well { padding: 3% }` and `.vfo__mount { translateY(-4%) }`.
 */
const WELL_SIZE = 100
const WELL_PADDING = 0.03 * 132
const KNOB_LIFT = 0.04 * (WELL_SIZE - 2 * WELL_PADDING) // = 3.68 units
const CX = 66
const CY = 66 - KNOB_LIFT
const F_MIN = FREQ_MIN
const F_MAX = FREQ_MAX
const TICK_IN = 52.5
const TICK_MINOR_OUT = 56
const TICK_MAJOR_OUT = 58.5
const LABEL_R = 63
const MAJOR_EVERY = 4 // label 88, 92, 96, 100, 104, 108

/** 88 MHz at 9 o'clock, sweeping clockwise over the top to 108 MHz at 3 o'clock */
const polar = (mhz: number, r: number) => {
  const a = Math.PI - ((mhz - F_MIN) / (F_MAX - F_MIN)) * Math.PI
  return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) }
}

const fmt = (n: number) => Math.round(n * 100) / 100

const TICKS = Array.from({ length: F_MAX - F_MIN + 1 }, (_, i) => {
  const mhz = F_MIN + i
  const major = (mhz - F_MIN) % MAJOR_EVERY === 0
  const a = polar(mhz, TICK_IN)
  const b = polar(mhz, major ? TICK_MAJOR_OUT : TICK_MINOR_OUT)
  return { mhz, major, d: `M${fmt(a.x)} ${fmt(a.y)}L${fmt(b.x)} ${fmt(b.y)}` }
})

const LABELS = TICKS.filter((t) => t.major).map(({ mhz }) => ({ mhz, ...polar(mhz, LABEL_R) }))

/** Upper-half frequency scale, printed in worn silkscreen ink on the chassis */
function FrequencyScale() {
  return (
    <svg className="vfo__scale" viewBox="0 0 132 116" aria-hidden="true">
      <defs>
        {/* erodes the ink: fine noise knocks holes out of the print */}
        <filter id="vfo-ink-wear" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7" result="noise" />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3.2 0 0 0 -0.95"
            result="wear"
          />
          <feComposite in="SourceGraphic" in2="wear" operator="in" />
        </filter>
      </defs>

      <g className="vfo__ink" filter="url(#vfo-ink-wear)">
        {/* thin baseline arc under the ticks */}
        <path
          className="vfo__tick"
          d={`M${CX - TICK_IN} ${CY}A${TICK_IN} ${TICK_IN} 0 0 1 ${CX + TICK_IN} ${CY}`}
        />
        {TICKS.map((t) => (
          <path key={t.mhz} className={`vfo__tick${t.major ? ' vfo__tick--major' : ''}`} d={t.d} />
        ))}
        {LABELS.map((l) => (
          <text
            key={l.mhz}
            className="vfo__num"
            x={fmt(l.x)}
            y={fmt(l.y)}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {l.mhz}
          </text>
        ))}
        <text className="vfo__unit" x={CX + LABEL_R} y={CY + 8} textAnchor="middle" dominantBaseline="central">
          MHz
        </text>
      </g>
    </svg>
  )
}

/* --- VFO mechanics ---------------------------------------------------------
   The knob's travel is 180 degrees, hard-stopped at both ends, matching the
   printed scale: 9 o'clock (-90deg) = 88.00 MHz ... 3 o'clock (+90deg) = 108.00.
   The frequency in RadioContext is the single source of truth; the knob's
   visual angle is always derived from it, so the two can never disagree. */
const ANGLE_MIN = -90
const ANGLE_MAX = 90

const clampAngle = (deg: number) => Math.min(ANGLE_MAX, Math.max(ANGLE_MIN, deg))

const freqToAngle = (mhz: number) =>
  ANGLE_MIN + ((mhz - FREQ_MIN) / (FREQ_MAX - FREQ_MIN)) * (ANGLE_MAX - ANGLE_MIN)

const angleToFreq = (deg: number) =>
  FREQ_MIN + ((clampAngle(deg) - ANGLE_MIN) / (ANGLE_MAX - ANGLE_MIN)) * (FREQ_MAX - FREQ_MIN)

/** Pointer bearing around the knob centre: 0deg = 12 o'clock, clockwise positive */
const bearing = (x: number, y: number, cx: number, cy: number) =>
  (Math.atan2(x - cx, cy - y) * 180) / Math.PI

/** Wrap a bearing difference into -180..180, so crossing 6 o'clock doesn't jump */
const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180

/** Ignore the pointer this close to the centre, where the bearing is unstable */
const DEAD_ZONE = 0.18 // fraction of the knob radius

/* --- Magnetic tuning gravity -----------------------------------------------
   Exact decimals are hard to hit by finger on a small knob, so the dial has
   detents at these stations. A drag that comes within SNAP_RANGE of a target
   snaps the frequency onto it exactly. The pull has hysteresis: once captured,
   the drag must travel SNAP_RANGE + SNAP_STICKINESS away before it pops out,
   so leaving the station takes a slightly harder pull than entering it. */
// every station has a detent, broadcasters and the ghost alike, so the ghost's
// detent is no giveaway: it feels like one more station on the dial
const TARGET_FREQUENCIES: readonly number[] = DETENT_FREQUENCIES
const SNAP_RANGE = 0.2 // MHz: capture zone either side of a target
const SNAP_STICKINESS = 0.12 // MHz: extra travel needed to break free

/** Short haptic "click" when the dial drops into a detent (where supported) */
const detentClick = () => {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(12)
}

/** Keyboard tuning steps, in MHz */
const KEY_STEP: Record<string, number> = {
  ArrowUp: 0.05,
  ArrowRight: 0.05,
  ArrowDown: -0.05,
  ArrowLeft: -0.05,
  PageUp: 1,
  PageDown: -1,
}

interface DragState {
  id: number
  cx: number
  cy: number
  minR: number
  /** last pointer bearing; null while the pointer sits in the dead zone */
  last: number | null
  /** unrounded knob angle, accumulated from pointer movement */
  angle: number
  /** detent the drag is currently held in, if any */
  captured: number | null
}

/** Apply the detents: returns the frequency to publish for a raw drag position */
function applyGravity(d: DragState, raw: number, targets: readonly number[]): number {
  if (d.captured !== null) {
    if (Math.abs(raw - d.captured) <= SNAP_RANGE + SNAP_STICKINESS + 1e-9) return d.captured
    d.captured = null // pulled hard enough: pop out of the detent
  }
  const hit = targets.find((t) => Math.abs(raw - t) <= SNAP_RANGE + 1e-9)
  if (hit === undefined) return raw
  d.captured = hit
  detentClick()
  return hit
}

/**
 * Drag-to-rotate. pointerdown on the knob, then window-level pointermove /
 * pointerup, so the drag keeps working when the finger slides off the knob.
 * Rotation follows the change in the pointer's bearing around the knob centre,
 * is clamped to the hard stops, and is pulled into the station detents. The knob turns whether or not the power is
 * on (it's a mechanical dial); the LCD simply stays dark until the MCB is on.
 */
function useVfoDrag(
  frequency: number,
  setFrequency: (mhz: number) => void,
  targets: readonly number[] = TARGET_FREQUENCIES,
) {
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const freqRef = useRef(frequency)

  useEffect(() => {
    freqRef.current = frequency
  }, [frequency])

  // unmounting mid-drag must not leave window listeners behind
  useEffect(() => () => stopRef.current?.(), [])

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0 || dragRef.current) return
      e.preventDefault()
      const r = e.currentTarget.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const minR = (Math.min(r.width, r.height) / 2) * DEAD_ZONE
      const outside = Math.hypot(e.clientX - cx, e.clientY - cy) >= minR
      dragRef.current = {
        id: e.pointerId,
        cx,
        cy,
        minR,
        last: outside ? bearing(e.clientX, e.clientY, cx, cy) : null,
        angle: freqToAngle(freqRef.current),
        // starting a drag while parked on a station: it begins held in the detent
        captured: targets.find((t) => isTunedTo(freqRef.current, t)) ?? null,
      }

      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current
        if (!d || ev.pointerId !== d.id) return
        if (Math.hypot(ev.clientX - d.cx, ev.clientY - d.cy) < d.minR) {
          d.last = null // re-anchor once the pointer leaves the dead zone
          return
        }
        const b = bearing(ev.clientX, ev.clientY, d.cx, d.cy)
        if (d.last !== null) {
          const next = clampAngle(d.angle + wrap(b - d.last))
          if (next !== d.angle) {
            d.angle = next
            setFrequency(applyGravity(d, angleToFreq(next), targets))
          }
        }
        d.last = b
      }

      const stop = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onEnd)
        window.removeEventListener('pointercancel', onEnd)
        dragRef.current = null
        stopRef.current = null
        setDragging(false)
      }

      const onEnd = (ev: PointerEvent) => {
        if (ev.pointerId === dragRef.current?.id) stop()
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onEnd)
      window.addEventListener('pointercancel', onEnd)
      stopRef.current = stop
      setDragging(true)
    },
    [setFrequency, targets],
  )

  return { dragging, onPointerDown }
}

/**
 * VFO tuning dial, wired to the global frequency (RadioContext).
 * Drag (or arrow keys) to tune: --vfo-angle rotates `.vfo__knob`; the side wall
 * and shadows sit on the non-rotating `.vfo__mount` so lighting stays fixed.
 */
export default function TuningDial() {
  const { frequency, setFrequency } = useRadio()
  const { dragging, onPointerDown } = useVfoDrag(frequency, setFrequency)
  const angle = freqToAngle(frequency)

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      let next: number | null = null
      if (e.key in KEY_STEP) next = frequency + KEY_STEP[e.key]
      else if (e.key === 'Home') next = FREQ_MIN
      else if (e.key === 'End') next = FREQ_MAX
      if (next === null) return
      e.preventDefault()
      setFrequency(next)
    },
    [frequency, setFrequency],
  )

  return (
    <section className="tuning" aria-label="Tuning Panel">
      <MetalPlate
        className="plate--sop tuning__plate tuning__sop"
        label="Operating instructions: 1. Rotate VFO for tuning. 2. Use Morse TX (decoder available). 3. Reference card included. Warning: avoid interrupting broadcasts."
      >
        <span className="sop__title">OPERATING INSTRUCTIONS:</span>
        <span className="sop__step">1. ROTATE VFO FOR TUNING.</span>
        <span className="sop__step">2. USE MORSE TX (DECODER AVAIL).</span>
        <span className="sop__step">3. REF CARD INCLUDED.</span>
        <span className="sop__warn">WARNING: AVOID INTERRUPTING BROADCASTS.</span>
      </MetalPlate>

      {/* --vfo-angle is derived from the global frequency, so knob and LCD always agree */}
      <div className="vfo" style={{ '--vfo-angle': `${angle}deg` } as CSSProperties}>
        <FrequencyScale />
        <div className="vfo__well">
          <div
            className="vfo__mount"
            data-dragging={dragging}
            role="slider"
            tabIndex={0}
            aria-label="VFO tuning dial"
            aria-orientation="horizontal"
            aria-valuemin={FREQ_MIN}
            aria-valuemax={FREQ_MAX}
            aria-valuenow={frequency}
            aria-valuetext={`${formatFrequency(frequency)} megahertz`}
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
          >
            <div className="vfo__knob">
              <div className="vfo__face">
                <span className="vfo__dimple" aria-hidden="true" />
              </div>
            </div>
            {/* fixed lighting layer above the knob (does not rotate) */}
            <div className="vfo__sheen" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="tuning__stack">
        <MetalPlate className="plate--brand" label="HAMorse HM-13">
          <span className="plate__brand">HAMorse</span>
          <span className="plate__model">HM-13</span>
        </MetalPlate>
        <MetalPlate className="plate--serial" label="Serial number SER: 1984-K1R0">
          <span className="plate__serial">SER: 1984-K1R0</span>
        </MetalPlate>
      </div>
    </section>
  )
}
