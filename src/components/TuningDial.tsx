import './TuningDial.css'
import MetalPlate from './MetalPlate'

/* --- Silk-screen scale geometry (SVG user units, matches .vfo 132 x 116) --- */
const CX = 66
const CY = 66
const F_MIN = 88
const F_MAX = 108
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

/**
 * VFO tuning dial: static physical UI only.
 * Rotation logic will later set --vfo-angle on `.vfo__knob`; the side wall and
 * shadows sit on the non-rotating `.vfo__mount` so lighting stays fixed.
 */
export default function TuningDial() {
  return (
    <section className="tuning" aria-label="Tuning Panel">
      <MetalPlate
        className="plate--sop tuning__plate tuning__sop"
        label="Operating instructions: 1. Rotate VFO to seek signal. 2. Use DIT/DAH paddles to TX. 3. Monitor LCD buffer. Warning: no emissions on dead bands."
      >
        <span className="sop__title">OPERATING INSTRUCTIONS:</span>
        <span className="sop__step">1. ROTATE VFO TO SEEK SIGNAL.</span>
        <span className="sop__step">2. USE DIT/DAH PADDLES TO TX.</span>
        <span className="sop__step">3. MONITOR LCD BUFFER.</span>
        <span className="sop__warn">WARNING: NO EMISSIONS ON DEAD BANDS.</span>
      </MetalPlate>

      <div className="vfo" role="presentation">
        <FrequencyScale />
        <div className="vfo__well">
          <div className="vfo__mount">
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
