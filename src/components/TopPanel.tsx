import type { CSSProperties } from 'react'
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

const r2 = (n: number) => Math.round(n * 100) / 100
const deg = (d: number) => (d * Math.PI) / 180

/* ==========================================================================
   Left: MAIN POWER bat-lever toggle + unlit LED jewel (box = 100 x 80 units)
   ========================================================================== */
function PowerSwitch() {
  return (
    <div className="power" aria-label="Main power switch, off" role="img">
      <svg className="tp-print" viewBox="0 0 100 80" aria-hidden="true">
        <defs>
          <InkWear id="tp-wear-power" />
        </defs>
        <g className="tp-ink" filter="url(#tp-wear-power)">
          <text x="58" y="9" className="tp-label">ON</text>
          <text x="58" y="78" className="tp-label">OFF</text>
          <text x="22" y="52" className="tp-label tp-label--small">PWR</text>
        </g>
      </svg>

      <span className="power__led" aria-hidden="true" />

      <span className="power__ring" aria-hidden="true">
        <span className="power__nut" />
      </span>

      {/* bat lever, thrown DOWN (= OFF); drawn above the bushing */}
      <svg className="power__lever" viewBox="0 0 100 80" aria-hidden="true">
        <defs>
          <linearGradient id="tp-bat" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#2b2d31" />
            <stop offset="0.28" stopColor="#8d9095" />
            <stop offset="0.42" stopColor="#a4a7ab" />
            <stop offset="0.62" stopColor="#6c6f74" />
            <stop offset="1" stopColor="#222326" />
          </linearGradient>
          <radialGradient id="tp-bat-tip" cx="0.42" cy="0.38" r="0.65">
            <stop offset="0" stopColor="#a9acb0" />
            <stop offset="0.45" stopColor="#74777c" />
            <stop offset="1" stopColor="#26282b" />
          </radialGradient>
          <filter id="tp-bat-shadow" x="-60%" y="-30%" width="220%" height="180%">
            <feDropShadow dx="1.6" dy="3.2" stdDeviation="1.6" floodColor="#000" floodOpacity="0.85" />
            <feDropShadow dx="0.4" dy="0.8" stdDeviation="0.4" floodColor="#000" floodOpacity="0.9" />
          </filter>
        </defs>
        <g filter="url(#tp-bat-shadow)">
          {/* tapered shaft from the pivot (58, 34) down to the tip */}
          <path d="M55.4 34 L60.6 34 L62.6 62 L53.4 62 Z" fill="url(#tp-bat)" />
          {/* oxidised grime line down one side */}
          <path d="M55.9 35 L56.6 35 L54.6 61 L53.9 61 Z" fill="rgba(20,19,16,0.45)" />
          {/* rounded bat tip */}
          <ellipse cx="58" cy="63" rx="5.4" ry="4.8" fill="url(#tp-bat-tip)" />
          <ellipse cx="58" cy="63" rx="5.4" ry="4.8" fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="0.5" />
          {/* pivot boss */}
          <circle cx="58" cy="34" r="4" fill="url(#tp-bat-tip)" stroke="rgba(0,0,0,0.7)" strokeWidth="0.5" />
        </g>
      </svg>
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
   Right: AM / FM / CW chicken-head mode selector (box = 100 x 84 units)
   ========================================================================== */
const KNOB = { x: 50, y: 52 }
const MODES = [
  { label: 'AM', a: -50 },
  { label: 'FM', a: 0 },
  { label: 'CW', a: 50 },
]
const MODE_SELECTED = 'CW'

function ModeSelector() {
  const at = (a: number, r: number) => ({
    x: r2(KNOB.x + r * Math.sin(deg(a))),
    y: r2(KNOB.y - r * Math.cos(deg(a))),
  })
  const pointer = MODES.find((m) => m.label === MODE_SELECTED)!.a

  return (
    <div className="mode" role="img" aria-label={`Mode selector set to ${MODE_SELECTED}`}>
      <svg className="tp-print" viewBox="0 0 100 84" aria-hidden="true">
        <defs>
          <InkWear id="tp-wear-mode" />
        </defs>
        <g className="tp-ink" filter="url(#tp-wear-mode)">
          {MODES.map((m) => {
            const t0 = at(m.a, 22.5)
            const t1 = at(m.a, 25.5)
            const l = at(m.a, 31)
            return (
              <g key={m.label}>
                <path className="tp-tick" d={`M${t0.x} ${t0.y}L${t1.x} ${t1.y}`} />
                <text x={l.x} y={l.y} className="tp-label" dominantBaseline="central">
                  {m.label}
                </text>
              </g>
            )
          })}
          <text x="50" y="81" className="tp-label tp-label--small">MODE</text>
        </g>
      </svg>

      {/* filter on the non-rotating wrapper keeps the shadow falling downward */}
      <div className="mode__knob" aria-hidden="true">
        <span className="mode__skirt" />
        <span className="mode__body" style={{ '--mode-angle': `${pointer}deg` } as CSSProperties}>
          <span className="mode__head" />
        </span>
        <span className="mode__sheen" />
      </div>
    </div>
  )
}

/** Top Panel: MAIN POWER toggle | S-meter | mode selector (static hardware only). */
export default function TopPanel() {
  return (
    <section className="top" aria-label="Top Panel">
      <div className="top__col top__col--power">
        <PowerSwitch />
      </div>
      <div className="top__col top__col--meter">
        <SMeter />
      </div>
      <div className="top__col top__col--mode">
        <ModeSelector />
      </div>
    </section>
  )
}
