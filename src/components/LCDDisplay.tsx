import './LCDDisplay.css'
import DustCanvas from './DustCanvas'
import { formatFrequency, useRadio } from '../context/RadioContext'
import { useMorseDecoder } from '../hooks/useMorseDecoder'
import type { TxStatus } from '../hooks/useMorseDecoder'
import type { CSSProperties } from 'react'

/* --- The haunt: shattered glass and black liquid -------------------------------
   Drawn once (deterministic, so it never changes between renders): cracks
   radiating from an off-centre impact, two rings of concentric fractures
   joining them, a few glinting shards, and the viscous #050505 liquid that
   crawls down the glass. Only shown in the corrupted phase (App.css /
   LCDDisplay.css: .stage[data-haunt='corrupt']). */
const GLASS_W = 400
const GLASS_H = 130
const IMPACT = { x: 268, y: 50 }

function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SHATTER = (() => {
  const rng = seeded(1984)
  const rays = 13
  const reach = Math.hypot(GLASS_W, GLASS_H)
  const angles = Array.from({ length: rays }, (_, i) => ((i + rng() * 0.6) / rays) * Math.PI * 2)
  // each crack: a jagged polyline out to (past) the edge of the glass
  const cracks = angles.map((a) => {
    const pts: [number, number][] = [[IMPACT.x, IMPACT.y]]
    let r = 0
    let ang = a
    while (r < reach) {
      r += 14 + rng() * 26
      ang += (rng() - 0.5) * 0.22
      pts.push([IMPACT.x + Math.cos(ang) * r, IMPACT.y + Math.sin(ang) * r])
    }
    return pts
  })
  const at = (crack: [number, number][], k: number) => crack[Math.min(crack.length - 1, k)]
  // concentric fractures: join neighbouring cracks a few segments out
  const rings = [1, 3].map((k) =>
    cracks.map((c, i) => {
      const p = at(c, k + (rng() < 0.3 ? 1 : 0))
      const q = at(cracks[(i + 1) % cracks.length], k)
      const mx = (p[0] + q[0]) / 2 + (rng() - 0.5) * 8
      const my = (p[1] + q[1]) / 2 + (rng() - 0.5) * 8
      return `M${p[0].toFixed(1)} ${p[1].toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${q[0].toFixed(1)} ${q[1].toFixed(1)}`
    }),
  )
  // glinting shards near the impact
  const shards = cracks
    .map((c, i) => ({ c, n: cracks[(i + 1) % cracks.length] }))
    .filter(() => rng() < 0.5)
    .map(({ c, n }) => [at(c, 0), at(c, 1), at(n, 1)].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '))
  const line = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')
  return { cracks: cracks.map(line), rings: rings.flat(), shards }
})()

/** The drips: [left %, width cqw, final length %, duration s, delay s] */
const DRIPS: readonly (readonly [number, number, number, number, number])[] = [
  [6, 1.6, 72, 7.5, 0.2],
  [17, 1.0, 46, 9, 1.4],
  [29, 2.2, 96, 6.5, 0],
  [41, 1.2, 58, 8.5, 2.2],
  [55, 1.8, 84, 7, 0.8],
  [66, 1.0, 38, 10, 3],
  [78, 2.4, 104, 6, 0.4],
  [90, 1.3, 64, 8, 1.8],
]

function HauntGlass() {
  return (
    <div className="lcd__haunt" aria-hidden="true">
      <div className="lcd__drips">
        {DRIPS.map(([x, w, len, dur, delay]) => (
          <span
            key={x}
            className="lcd__drip"
            style={{ '--x': `${x}%`, '--w': `${w}cqw`, '--len': `${len}%`, '--dur': `${dur}s`, '--delay': `${delay}s` } as CSSProperties}
          />
        ))}
      </div>
      <svg className="lcd__shatter" viewBox={`0 0 ${GLASS_W} ${GLASS_H}`} preserveAspectRatio="none">
        <defs>
          {/* merges the drips into one viscous mass */}
          <filter id="lcd-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
          </filter>
        </defs>
        {SHATTER.shards.map((pts) => (
          <polygon key={pts} className="lcd__shard" points={pts} />
        ))}
        {/* each crack: a dark fracture with a light edge where it catches the light */}
        <g className="lcd__crack-shadow">
          {[...SHATTER.cracks, ...SHATTER.rings].map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <g className="lcd__crack">
          {[...SHATTER.cracks, ...SHATTER.rings].map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <circle className="lcd__impact" cx={IMPACT.x} cy={IMPACT.y} r="5" />
      </svg>
    </div>
  )
}

/**
 * Amber LCD display panel.
 * Power OFF: backlight dead (dark glass), no text; the bezel, stain and dust stay.
 * Power ON: amber backlight with the live frequency (always two decimals), and
 * the RX / TX annunciators in the top-left corner (TX SEND feedback). With the
 * DECODER ON, what you've keyed but not yet sent is underlined, and the
 * annunciator says PRESS TX: nothing goes out until you've checked it.
 * Buffer row: DECODER OFF = blank (only the display: keying, decoding and
 * station replies carry on unseen). DECODER ON on a broadcaster = a faint
 * blinking "RX ONLY"; on dead air = "DEAD BAND". DECODER ON on the ham band or
 * the ghost frequency = the decoded message followed by the dits/dahs being
 * keyed right now, so every tap shows immediately. When the text is wider than
 * the glass, the oldest characters scroll off to the left.
 *
 * Each text row is drawn twice in the same grid cell: an "unlit" ghost layer of
 * every segment (dim #3A2800 silt), with the lit liquid-crystal text on top.
 */
const STATUS_TEXT = {
  'rx-only': 'RX ONLY',
  'dead-band': 'DEAD BAND',
} as const

/** What the TX annunciator spells next to the TX flag */
const TX_TEXT: Record<Exclude<TxStatus, 'idle'>, string> = {
  sending: 'SEND',
  'no-reply': 'NO REPLY',
  inhibit: 'INHIBIT',
  busy: 'BUSY',
  empty: 'NO MSG',
}

/** Screen-reader wording for the annunciator */
const TX_SPOKEN: Record<Exclude<TxStatus, 'idle'>, string> = {
  sending: 'Transmitting',
  'no-reply': 'No reply',
  inhibit: 'Transmit inhibited on this frequency',
  busy: 'Frequency busy, wait for the other station',
  empty: 'Nothing keyed to send',
}

/**
 * The status annunciators in the corner of the glass, like a real rig's LCD:
 * printed RX and TX flags (faint when unlit, dark when lit) and a short
 * message. TX SEND shows "TX SEND" with dots counting up . .. ... while the
 * over goes out and the far end is awaited; RX lights while another station
 * is sending. They are status, not decoded text, so they show with the
 * DECODER OFF too.
 */
function Annunciator({ tx, rx, draft }: { tx: TxStatus; rx: boolean; draft: boolean }) {
  const txLit = tx === 'sending' || tx === 'inhibit' || tx === 'empty' || tx === 'no-reply'
  // while TX SEND... is up, TX owns the display; RX takes over once it clears
  const rxLit = (rx && tx !== 'sending') || tx === 'busy'
  // DECODER ON and something keyed but unsent: a gentle prompt to check it and press TX SEND
  if (tx === 'idle' && draft && !rx) {
    return (
      <span className="lcd__annun" data-tx="ready">
        <span className="lcd__flag" data-lit="false" aria-hidden="true">
          RX
        </span>
        <span className="lcd__flag" data-lit="false" aria-hidden="true">
          TX
        </span>
        <span className="lcd__annun-msg lcd__ink" role="status" aria-label="Unsent: check it, then press TX SEND">
          PRESS TX
        </span>
      </span>
    )
  }
  return (
    <span className="lcd__annun" data-tx={tx}>
      <span className="lcd__flag" data-lit={rxLit} aria-hidden="true">
        RX
      </span>
      <span className="lcd__flag" data-lit={txLit} aria-hidden="true">
        TX
      </span>
      <span className="lcd__annun-msg lcd__ink" role="status" aria-label={tx === 'idle' ? (rx ? 'Receiving' : '') : TX_SPOKEN[tx]}>
        {tx !== 'idle' && TX_TEXT[tx]}
        {tx === 'sending' && (
          <span className="lcd__dots" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        )}
      </span>
    </span>
  )
}

export default function LCDDisplay() {
  const { frequency, isPowerOn, isHaunted } = useRadio()
  const { currentSymbol, decodedMessage, draftFrom, status, isReceiving, txStatus } = useMorseDecoder()
  // what's been sent / received, and your unsent draft after it (underlined)
  const sentText = decodedMessage.slice(0, draftFrom)
  const draftText = decodedMessage.slice(draftFrom)
  const hasDraft = status === 'ready' && !isReceiving && (draftText.trim() !== '' || currentSymbol !== '')
  const freqText = formatFrequency(frequency)

  return (
    <section className="lcd" aria-label="Display Panel" data-power={isPowerOn ? 'on' : 'off'}>
      <div className="lcd__bezel">
        <div className="lcd__glass">
          <div className="lcd__row lcd__row--freq">
            <Annunciator tx={txStatus} rx={isReceiving} draft={hasDraft} />
            <span className="lcd__stack">
              <span className="lcd__ghost" aria-hidden="true">
                888.88
              </span>
              <span className="lcd__ink" aria-live="polite" aria-label={`${freqText} megahertz`}>
                {freqText}
              </span>
            </span>
            <span className="lcd__unit lcd__ink">MHz</span>
          </div>

          <div className="lcd__divider" aria-hidden="true" />

          <div className="lcd__row lcd__row--buffer" data-status={status} data-receiving={isReceiving}>
            <span className="lcd__stack">
              <span className="lcd__ghost lcd__ghost--matrix" aria-hidden="true" />
              {/* viewport pins the newest text to the right edge once it overflows */}
              <span className="lcd__ink lcd__buffer">
                {(status === 'rx-only' || status === 'dead-band') && (
                  <span className="lcd__warning" role="status">
                    {STATUS_TEXT[status]}
                  </span>
                )}
                {status === 'ready' && (
                  <span className="lcd__buffer-text">
                    <span aria-live="polite" aria-label={`Decoded: ${decodedMessage || 'nothing yet'}`}>
                      {sentText}
                      {draftText !== '' && (
                        <span className="lcd__draft" data-unsent={hasDraft}>
                          {draftText}
                        </span>
                      )}
                    </span>
                    <span className="lcd__symbol" aria-hidden="true">
                      {currentSymbol}
                    </span>
                    <span className="lcd__cursor" aria-hidden="true" />
                  </span>
                )}
              </span>
            </span>
          </div>

          {/* the haunt: the glass shatters and something black seeps down it */}
          {isHaunted && <HauntGlass />}

          {/* permanent, un-wipeable stain/fog baked into the old glass */}
          <span className="lcd__stain" aria-hidden="true" />

          {/* wipeable grime on the glass, above the stain, below the bezel shadow */}
          <DustCanvas />
        </div>
      </div>
    </section>
  )
}
