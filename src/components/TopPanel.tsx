import { useCallback, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import './TopPanel.css'

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

function PowerSwitch({ on, onToggle }: SwitchProps) {
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
        role="switch"
        aria-checked={on}
        aria-label="Main power"
        tabIndex={0}
        {...handlers}
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

function SMeter() {
  const needleTip = polar(0, ARC_R + 4)
  return (
    <div className="meter" role="img" aria-label="S-meter, no signal">
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
              const p = polar(t.a, ARC_R + 21)
              return (
                <text key={t.s} x={p.x} y={p.y} className="meter__num" textAnchor="middle" dominantBaseline="central">
                  {t.s}
                </text>
              )
            })}
            {[20, 40].map((db) => {
              const p = polar(DB_ANGLE[db], ARC_R + 22)
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

          {/* thin physical needle, resting at zero (left stop) */}
          <g className="meter__needle" style={{ '--needle-angle': `${NEEDLE_REST}deg` } as CSSProperties}>
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
 * Switch state is local for now; it will be lifted when audio / decoding is wired up.
 */
export default function TopPanel() {
  const [isPowerOn, setIsPowerOn] = useState(false)
  const [isDecoderOn, setIsDecoderOn] = useState(false)
  const togglePower = useCallback(() => setIsPowerOn((v) => !v), [])
  const toggleDecoder = useCallback(() => setIsDecoderOn((v) => !v), [])

  return (
    <section className="top" aria-label="Top Panel">
      <div className="top__col top__col--power">
        <PowerSwitch on={isPowerOn} onToggle={togglePower} />
      </div>
      <div className="top__col top__col--meter">
        <SMeter />
      </div>
      <div className="top__col top__col--decoder">
        <DecoderSwitch on={isDecoderOn} onToggle={toggleDecoder} />
      </div>
    </section>
  )
}
