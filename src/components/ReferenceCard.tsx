import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { AnimationEvent as ReactAnimationEvent, CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import './ReferenceCard.css'
import { CHAR_TO_MORSE, MORSE_TABLE_ORDER, Q_CODES, toTypographic } from '../utils/morseDictionary'
import { REF_CARD_MOTION } from '../utils/cardMotion'
import { playPaperScrape } from '../utils/audioEngine'
import { useMorseDecoder } from '../hooks/useMorseDecoder'
import { useRadio } from '../context/RadioContext'
import { formatMhz, getGhostFrequency } from '../constants'
import { learnedChars } from '../utils/progress'
import type { Progress } from '../utils/progress'

/**
 * Must match the media query in ReferenceCard.css. Wider than the radio's own
 * 3:4 means spare space is beside the chassis (slide right); otherwise it's
 * above/below it (slide up).
 */
const WIDE_QUERY = '(min-aspect-ratio: 3/4)'

/** Drag this far back toward the radio (px) to put the card away */
const CLOSE_DISTANCE = 40
/** Movement below this (px) counts as a tap */
const TAP_SLOP = 6

/* --- The loupe ----------------------------------------------------------------
   The card is small on a phone (and not big on a desktop), so a magnifying
   loupe reads it. Touch: press and hold for HOLD_MS and the loupe appears just
   above your finger (so the finger never hides what you're reading); slide
   to read; lift to put it down. A quick tap still puts the card away, and a
   quick swipe toward the radio still closes it. Mouse: the loupe follows the
   pointer while it's over the card, like a reading glass; click to put the
   card away. */
const HOLD_MS = 170
/** what the magnified type should measure (px); the zoom is chosen per screen */
const LOUPE_TARGET_FONT_PX = 22
const LOUPE_MIN_ZOOM = 1.8
const LOUPE_MAX_ZOOM = 3.4
/** loupe diameter: a share of the shorter screen side, within these bounds (px) */
const LOUPE_MIN_D = 150
const LOUPE_MAX_D = 230
const LOUPE_SCREEN_SHARE = 0.46
/** the metal rim, as a share of the diameter */
const LOUPE_RIM = 0.055
/** gap between the fingertip and the bottom of the loupe (px) */
const LOUPE_FINGER_GAP = 26
/** keep the loupe this far inside the screen edges (px) */
const LOUPE_EDGE = 6

/* Printed from the same dictionary the decoder uses, so the card can never
   disagree with what the radio actually decodes. */
const MORSE: [string, string][] = MORSE_TABLE_ORDER.map((ch) => [ch, toTypographic(CHAR_TO_MORSE[ch])])

const QCODE_ROWS: [string, string][] = Object.entries(Q_CODES).map(([code, q]) => [code, q.meaning])

/* animation durations come from the shared motion timeline (also used for the sound) */
const MOTION_STYLE = {
  '--refcard-out-dur': `${REF_CARD_MOTION.open.durationMs}ms`,
  '--refcard-in-dur': `${REF_CARD_MOTION.close.durationMs}ms`,
} as CSSProperties

interface ReferenceCardProps {
  open: boolean
  /** blown out of its slot by the haunt's blast (a violent, fast eject) */
  ejected?: boolean
  onClose: () => void
}

type GestureMode = 'pending' | 'drag' | 'loupe'

interface DragState {
  id: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  wide: boolean
  offset: number
  /** pending: just touched (tap, drag or hold?); drag: sliding the card; loupe: magnifying */
  mode: GestureMode
  hold: ReturnType<typeof setTimeout> | null
}

interface LoupeGeometry {
  zoom: number
  diameter: number
  rim: number
  /** 'touch' sits above the finger; 'mouse' is centred on the pointer */
  kind: 'touch' | 'mouse'
}

/** A small magnifying-glass mark (drawn, so it never depends on font glyphs) */
function LensIcon() {
  return (
    <svg className="refcard__stamp-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="4.6" />
      <path d="M10 10 L14.5 14.5" />
    </svg>
  )
}

/**
 * How far the card has rotted: the card belonged to a dead operator, and it
 * changes as the ghost talks. Every time you pull it out, it is a little
 * worse; the Morse table itself is never touched (it still teaches).
 *   0  a dead man's card: a water tide-mark, foxing, and in the bottom-right
 *      corner a frequency someone pencilled and ringed: the ghost's, this session
 *   1  someone has circled four letters in pencil: H, E, L, P
 *   2  a newer, shakier note under Nevlin's; damp mould spreads up the card
 *   3  fingernail scratches; DECEASED stamped across the header; black greasy
 *      thumbprints at the edges; and a third hand, not Nevlin's, writes to YOU
 * When the haunt strikes, black grease (the radio's liquid crystal) floods
 * down over the whole card.
 */
export type CardRot = 0 | 1 | 2 | 3

/** Pencil rings round these letters, in this order (they spell it) */
const CIRCLED = ['H', 'E', 'L', 'P'] as const

/** Fingernail scratches across the card: groups of near-parallel strokes (viewBox 0..100, stretched) */
const SCRATCHES: readonly string[] = [
  'M56 8 C 61 30, 65 52, 68 78', 'M60.5 7 C 65.5 29, 69.5 51, 72.5 76', 'M65 9 C 70 31, 73 50, 77 74', 'M69.5 12 C 73.5 30, 76.5 48, 80.5 70',
  'M16 30 C 24 46, 29 62, 33 92', 'M20.5 29 C 28.5 45, 33.5 61, 37.5 90', 'M25 32 C 32 47, 37 61, 41 86',
]

/** Long runs of grease down the card when it floods: [x (% of the width), half-width, length, delay s] */
const GREASE_DRIPS: readonly (readonly [number, number, number, number])[] = [
  [6, 4, 62, 0.35], [19, 2.5, 40, 0.6], [31, 5, 86, 0.2], [47, 3, 52, 0.75], [58, 4.5, 90, 0.4],
  [71, 2.5, 34, 0.9], [83, 5.5, 80, 0.3], [94, 3, 46, 0.55],
]

/**
 * Black grease: the radio's own liquid crystal, the same pitch-black with an
 * oily sheen as the LCD's bleed (no blood, no faces). Rot 3: a few greasy
 * thumbprints and a wipe at the edges, clear of the type. The haunt: it floods
 * down over the whole card from the top edge, in runs and drips, wet and glossy.
 */
function Grease({ idPrefix }: { idPrefix: string }) {
  const id = (k: string) => `${idPrefix}-grease-${k}`
  const wet = `url(#${id('wet')})`
  return (
    <svg className="refcard__grease" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {/* organic, wet edges with a hard specular sheen, lit from the top left */}
        <filter id={id('wet')} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="3" seed="9" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G" result="shape" />
          <feGaussianBlur in="shape" stdDeviation="2.6" result="soft" />
          <feSpecularLighting in="soft" surfaceScale="5" specularConstant="0.85" specularExponent="26" lightingColor="#b8afd6" result="spec">
            <fePointLight x="90" y="-80" z="140" />
          </feSpecularLighting>
          <feComposite in="spec" in2="shape" operator="in" result="sheen" />
          <feMerge>
            <feMergeNode in="shape" />
            <feMergeNode in="sheen" />
          </feMerge>
        </filter>
        <filter id={id('ooze')} x="-10%" y="-10%" width="120%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <linearGradient id={id('oil')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#050505" />
          <stop offset="0.55" stopColor="#0b0910" />
          <stop offset="1" stopColor="#050505" />
        </linearGradient>
        {/* the thin-film rainbow at the edge of a pool, very faint */}
        <linearGradient id={id('film')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5a3d8a" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#2f6b5a" stopOpacity="0.45" />
          <stop offset="1" stopColor="#8a6a2a" stopOpacity="0.5" />
        </linearGradient>
      </defs>

      {/* rot 3: greasy thumbprints and a wipe, at the edges, clear of the type */}
      <g className="refcard__grease-prints" filter={wet} fill="none" stroke="#070608" strokeLinecap="round">
        <g transform="translate(6 112) rotate(-28)" strokeWidth="1.6" opacity="0.8">
          <ellipse rx="13" ry="17" />
          <ellipse rx="9.5" ry="13" />
          <ellipse rx="6" ry="9" />
          <ellipse rx="2.8" ry="5" />
        </g>
        <g transform="translate(232 7) rotate(64)" strokeWidth="1.5" opacity="0.7">
          <ellipse rx="11" ry="15" />
          <ellipse rx="7.5" ry="11" />
          <ellipse rx="4" ry="7" />
        </g>
        <path d="M2 186 C 30 178, 52 182, 78 190" strokeWidth="7" opacity="0.55" />
      </g>

      {/* the haunt: it floods down from the top edge, in runs */}
      <g className="refcard__grease-flood">
        <g filter={`url(#${id('ooze')})`}>
          <path
            fill={`url(#${id('oil')})`}
            d="M0 0 H400 V58 C 380 74, 366 60, 350 82 C 334 104, 318 76, 300 92 C 280 110, 266 84, 246 98 C 224 114, 212 90, 192 104 C 170 120, 156 92, 136 108 C 116 124, 102 96, 84 110 C 64 126, 48 98, 30 114 C 18 124, 8 108, 0 116 Z"
          />
          {/* the runs: each crawls down the card and ends in a heavy bulb */}
          {GREASE_DRIPS.map(([x, w, len, delay]) => {
            const top = 96
            const end = top + len * 1.05
            return (
              <g key={x} className="refcard__grease-run" style={{ '--len': len * 1.05, animationDelay: `${delay}s` } as CSSProperties}>
                <path d={`M${x * 4} ${top} V${end}`} stroke="#060509" strokeWidth={w * 2} strokeLinecap="round" pathLength={len * 1.05} />
                <ellipse className="refcard__grease-bulb" cx={x * 4} cy={end} rx={w * 1.5} ry={w * 1.9} fill="#060509" style={{ animationDelay: `${delay}s` } as CSSProperties} />
              </g>
            )
          })}
        </g>
        {/* wet: painted highlights, an oily rim and a glint on every bulb (no filter: they must stay crisp) */}
        <g className="refcard__grease-sheen" fill="none" strokeLinecap="round">
          <path d="M22 104 C 44 92, 62 116, 84 100 C 104 88, 118 112, 138 98" stroke="rgba(214, 206, 246, 0.42)" strokeWidth="1.6" />
          <path d="M196 94 C 216 82, 228 104, 248 90 C 268 76, 282 100, 302 84" stroke="rgba(214, 206, 246, 0.36)" strokeWidth="1.4" />
          <path d="M318 78 C 334 92, 348 66, 366 64 C 378 62, 388 60, 398 52" stroke="rgba(214, 206, 246, 0.3)" strokeWidth="1.2" />
          {/* a soft gloss across the pool, where the room light catches it */}
          <ellipse cx="120" cy="40" rx="70" ry="9" fill="rgba(214, 206, 246, 0.07)" stroke="none" transform="rotate(-4 120 40)" />
          <ellipse cx="300" cy="30" rx="52" ry="6" fill="rgba(214, 206, 246, 0.06)" stroke="none" transform="rotate(3 300 30)" />
          <path
            d="M0 117 C 8 109, 18 125, 30 115 C 48 99, 64 127, 84 111 C 102 97, 116 125, 136 109 C 156 93, 170 121, 192 105 C 212 91, 224 115, 246 99 C 266 85, 280 111, 300 93 C 318 77, 334 105, 350 83 C 366 61, 380 75, 400 59"
            stroke={`url(#${id('film')})`}
            strokeWidth="2.2"
          />
          {GREASE_DRIPS.map(([x, w, len, delay]) => (
            <ellipse
              key={x}
              className="refcard__grease-bulb"
              cx={x * 4 - w * 0.5}
              cy={96 + len * 1.05 - w * 0.7}
              rx={w * 0.45}
              ry={w * 0.6}
              fill="rgba(226, 220, 255, 0.55)"
              style={{ animationDelay: `${delay}s` } as CSSProperties}
            />
          ))}
        </g>
      </g>
    </svg>
  )
}

/** The printed card. Rendered twice: the card itself, and the copy the loupe magnifies. */
function CardSheet({ idPrefix, rot, name, ghostMhz, progress }: { idPrefix: string; rot: CardRot; name: string | null; ghostMhz: number; progress: Progress }) {
  const id = (k: string) => `${idPrefix}-${k}`
  const learned = new Set(learnedChars(progress.learned))
  return (
    <div className="refcard__sheet" data-rot={rot}>
      {/* the stains are under the type: ink sits on top of the damage */}
      <svg className="refcard__stain refcard__stain--tide" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <filter id={id('tide')} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" seed="23" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="18" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        <g filter={`url(#${id('tide')})`}>
          <ellipse cx="50" cy="52" rx="40" ry="36" fill="rgba(120, 92, 48, 0.12)" stroke="rgba(92, 64, 30, 0.42)" strokeWidth="2.2" />
          <ellipse cx="56" cy="58" rx="24" ry="20" fill="none" stroke="rgba(92, 64, 30, 0.2)" strokeWidth="1.2" />
        </g>
      </svg>
      <svg className="refcard__stain refcard__stain--mould" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <filter id={id('mould')} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.16" numOctaves="4" seed="3" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.22  0 0 0 0 0.16  0 0 0 -2.6 1.55" result="spots" />
            <feComposite in="spots" in2="SourceGraphic" operator="in" />
          </filter>
          <radialGradient id={id('damp')} cx="50%" cy="100%" r="80%">
            <stop offset="0%" stopColor="#000" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#${id('damp')})`} filter={`url(#${id('mould')})`} />
      </svg>


      <header className="refcard__head">
        <span>HAMorse HM-13</span>
        {/* rubber-stamped by the factory: how to read the small print */}
        <span className="refcard__stamp" aria-hidden="true">
          <LensIcon />
          <span className="refcard__stamp-touch">HOLD TO MAGNIFY</span>
          <span className="refcard__stamp-hover">HOVER TO MAGNIFY</span>
        </span>
        <span>OPERATOR REF. CARD</span>
      </header>

      <dl className="refcard__morse">
        {MORSE.map(([ch, code]) => {
          const ring = (CIRCLED as readonly string[]).indexOf(ch)
          return (
            <div key={ch} className="refcard__entry" data-learned={learned.has(ch) || undefined}>
              <dt
                className={ring >= 0 ? 'refcard__circled' : undefined}
                style={ring >= 0 ? ({ '--i': ring } as CSSProperties) : undefined}
              >
                {ch}
              </dt>
              <dd>{code}</dd>
            </div>
          )
        })}
      </dl>

      <dl className="refcard__q">
        {QCODE_ROWS.map(([code, meaning]) => (
          <div key={code} className="refcard__qrow">
            <dt>{code}:</dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>

      <div className="refcard__note">
        {/* your own pencil: the best speed you've sent at */}
        {progress.bestWpm !== null && (
          <p className="refcard__line refcard__line--best" aria-label={`Your best sending speed: ${progress.bestWpm} words per minute`}>
            BEST: {progress.bestWpm} WPM
          </p>
        )}
        <p className="refcard__line refcard__line--nevlin">
          {'Dial drifts below 90MHz in the cold. '}
          <span className="refcard__sig">- Nevlin</span>
        </p>
        <p className="refcard__line refcard__line--late" aria-hidden={rot < 2}>
          it answers back. dont reply
        </p>
      </div>

      {/* and a third hand, not Nevlin's, across the corner */}
      <p className="refcard__line refcard__line--ghost" aria-hidden={rot < 3}>
        {name ? `HELLO ${name}` : 'I SEE U'}
      </p>

      {/* fingernails, dragged across the card */}
      <svg className="refcard__scratches" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {SCRATCHES.map((d) => (
          <g key={d}>
            <path d={d} className="refcard__scratch-shadow" vectorEffect="non-scaling-stroke" />
            <path d={d} className="refcard__scratch" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
      </svg>

      <span className="refcard__deceased" aria-hidden="true">
        DECEASED
      </span>

      {/* pencilled in the corner and ringed, by someone who found it: where the ghost is tonight */}
      <span className="refcard__hint">
        <span className="refcard__hint-text">{formatMhz(ghostMhz)}</span>
      </span>

      <Grease idPrefix={idPrefix} />
    </div>
  )
}

/** Where the rim engraving runs: a circle just inside the rim (viewBox 0..100) */
const RIM_TEXT_PATH = 'M 50 50 m -46.4 0 a 46.4 46.4 0 1 1 92.8 0 a 46.4 46.4 0 1 1 -92.8 0'

/**
 * Operator's reference card, tucked behind the (stationary) chassis.
 * Slides out on REF; tap it, or drag it back toward the radio, to put it away;
 * hold it (touch) or hover it (mouse) to read it through the loupe.
 */
export default function ReferenceCard({ open, ejected = false, onClose }: ReferenceCardProps) {
  const { dread, victimName, progress } = useMorseDecoder()
  const { isHaunted, sessionId } = useRadio()
  // the ghost's frequency this session (it moves on every hard reset)
  const ghostMhz = useMemo(() => getGhostFrequency(), [sessionId])
  const rot = (isHaunted ? 3 : Math.min(3, Math.max(0, dread))) as CardRot
  const cardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const loupeRef = useRef<HTMLDivElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const geometryRef = useRef<LoupeGeometry | null>(null)
  // The friction keyframes only run once the card has been used, so the
  // close animation doesn't play (and flash the card) on first load.
  const armedRef = useRef(false)
  if (open) armedRef.current = true

  /**
   * Cardstock scraping through the chassis slot, locked to the friction
   * keyframes. Triggered by the card's OWN animationstart (so it never runs on
   * first load, and fires for REF, tap and drag alike), and offset by how far
   * the animation has already run when the event arrives, read from the Web
   * Animations API, so the stick / snap land on the exact visual frames.
   */
  const onAnimationStart = useCallback((e: ReactAnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const opening = e.animationName === 'refcard-out'
    if (!opening && e.animationName !== 'refcard-in') return
    let elapsedMs = 0
    const el = e.currentTarget
    const timeline = document.timeline?.currentTime
    if (typeof el.getAnimations === 'function' && typeof timeline === 'number') {
      const anim = el
        .getAnimations()
        .find((a) => (a as Animation & { animationName?: string }).animationName === e.animationName)
      if (anim && typeof anim.startTime === 'number') elapsedMs = Math.max(0, timeline - anim.startTime)
    }
    playPaperScrape(opening, elapsedMs)
  }, [])

  const setDrag = (px: number) => cardRef.current?.style.setProperty('--drag', `${px}px`)

  /* --- Loupe: pure DOM writes (it follows the finger every frame) ----------- */

  /** Aim the loupe at viewport point (x, y) */
  const aimLoupe = useCallback((x: number, y: number) => {
    const card = cardRef.current
    const loupe = loupeRef.current
    const paper = paperRef.current
    const g = geometryRef.current
    const stage = card?.parentElement
    if (!card || !loupe || !paper || !g || !stage) return
    const rect = card.getBoundingClientRect()
    const stageRect = stage.getBoundingClientRect()
    const r = g.diameter / 2

    // the point of the card being read (kept on the card)
    const px = Math.min(rect.width, Math.max(0, x - rect.left))
    const py = Math.min(rect.height, Math.max(0, y - rect.top))

    // where the loupe sits: centred on a mouse pointer; above a fingertip
    // (or below it, near the top of the screen), always fully on screen
    let cx = x
    let cy = y
    if (g.kind === 'touch') {
      cy = y - LOUPE_FINGER_GAP - r
      if (cy - r < LOUPE_EDGE) cy = y + LOUPE_FINGER_GAP + r
    }
    const vw = window.innerWidth
    const vh = window.innerHeight
    cx = Math.min(vw - LOUPE_EDGE - r, Math.max(LOUPE_EDGE + r, cx))
    cy = Math.min(vh - LOUPE_EDGE - r, Math.max(LOUPE_EDGE + r, cy))

    loupe.style.setProperty('--lx', `${(cx - stageRect.left).toFixed(1)}px`)
    loupe.style.setProperty('--ly', `${(cy - stageRect.top).toFixed(1)}px`)
    // the magnified copy: the read point lands in the middle of the glass
    const viewR = r - g.rim
    paper.style.transform = `translate(${(viewR - px * g.zoom).toFixed(2)}px, ${(viewR - py * g.zoom).toFixed(2)}px) scale(${g.zoom})`
  }, [])

  const showLoupe = useCallback(
    (x: number, y: number, kind: LoupeGeometry['kind']) => {
      const card = cardRef.current
      const loupe = loupeRef.current
      const paper = paperRef.current
      if (!card || !loupe || !paper) return
      if (!geometryRef.current || geometryRef.current.kind !== kind) {
        const sheet = card.querySelector('.refcard__sheet')
        const fontPx = sheet ? parseFloat(getComputedStyle(sheet).fontSize) : 10
        const zoom = Math.min(LOUPE_MAX_ZOOM, Math.max(LOUPE_MIN_ZOOM, LOUPE_TARGET_FONT_PX / (fontPx || 10)))
        const short = Math.min(window.innerWidth, window.innerHeight)
        const diameter = Math.round(Math.min(LOUPE_MAX_D, Math.max(LOUPE_MIN_D, short * LOUPE_SCREEN_SHARE)))
        geometryRef.current = { zoom, diameter, rim: Math.round(diameter * LOUPE_RIM), kind }
        const g = geometryRef.current
        loupe.style.setProperty('--d', `${g.diameter}px`)
        loupe.style.setProperty('--rim', `${g.rim}px`)
        // the copy is laid out at the card's own size, so it wraps exactly like the card
        paper.style.width = `${card.offsetWidth}px`
        paper.style.height = `${card.offsetHeight}px`
        const label = `HAMorse \u00b7 HM-13 READING LOUPE \u00b7 ${zoom.toFixed(1)}\u00d7 \u00b7`
        loupe.querySelectorAll('textPath').forEach((t) => (t.textContent = label))
        if (kind === 'touch' && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(8)
      }
      aimLoupe(x, y)
      loupe.dataset.show = 'true'
      card.dataset.loupe = kind
    },
    [aimLoupe],
  )

  const hideLoupe = useCallback(() => {
    geometryRef.current = null
    if (loupeRef.current) loupeRef.current.dataset.show = 'false'
    if (cardRef.current) delete cardRef.current.dataset.loupe
  }, [])

  // put the loupe away whenever the card goes away
  useEffect(() => {
    if (!open) hideLoupe()
  }, [open, hideLoupe])

  /* --- Gestures --------------------------------------------------------------- */

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!open || dragRef.current) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const isMouse = e.pointerType === 'mouse'
      const d: DragState = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        wide: window.matchMedia(WIDE_QUERY).matches,
        offset: 0,
        // a mouse press is a click or a drag (the mouse loupe is hover);
        // a finger might be about to tap, drag or hold to magnify
        mode: isMouse ? 'drag' : 'pending',
        hold: null,
      }
      if (isMouse) hideLoupe()
      else {
        d.hold = setTimeout(() => {
          d.hold = null
          if (dragRef.current !== d || d.mode !== 'pending') return
          d.mode = 'loupe'
          showLoupe(d.lastX, d.lastY, 'touch')
        }, HOLD_MS)
      }
      dragRef.current = d
      e.currentTarget.dataset.dragging = 'true'
    },
    [open, hideLoupe, showLoupe],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      if (!d) {
        // reading glass: a mouse hovering over the open card
        if (open && e.pointerType === 'mouse' && e.buttons === 0) showLoupe(e.clientX, e.clientY, 'mouse')
        return
      }
      if (e.pointerId !== d.id) return
      d.lastX = e.clientX
      d.lastY = e.clientY
      if (d.mode === 'loupe') {
        aimLoupe(e.clientX, e.clientY)
        return
      }
      if (d.mode === 'pending') {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < TAP_SLOP) return
        if (d.hold !== null) clearTimeout(d.hold) // moved before the hold: it's a drag
        d.hold = null
        d.mode = 'drag'
      }
      // "back toward the radio" is down in portrait and left in wide layouts
      const raw = d.wide ? e.clientX - d.startX : e.clientY - d.startY
      const rect = e.currentTarget.getBoundingClientRect()
      const max = d.wide ? rect.width : rect.height
      const sign = d.wide ? -1 : 1 // +1 = the direction that points back at the radio
      const toward = raw * sign
      // free travel back toward the radio; a short rubber-band pull away from it
      const eased = toward >= 0 ? Math.min(toward, max) : Math.max(toward * 0.2, -16)
      d.offset = eased * sign
      setDrag(d.offset)
    },
    [open, aimLoupe, showLoupe],
  )

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.id) return
      dragRef.current = null
      if (d.hold !== null) clearTimeout(d.hold)
      delete e.currentTarget.dataset.dragging
      if (d.mode === 'loupe') {
        // done reading: put the loupe down, the card stays out
        hideLoupe()
        return
      }
      const moved = Math.hypot(e.clientX - d.startX, e.clientY - d.startY)
      const towardRadio = d.wide ? -d.offset : d.offset
      if (e.type !== 'pointercancel' && (moved < TAP_SLOP || towardRadio > CLOSE_DISTANCE)) {
        // keep the drag offset so the close animation starts where the finger let go;
        // it is cleared once the card is tucked away (onAnimationEnd)
        onClose()
      } else {
        setDrag(0) // not far enough: ease back out (--drag is transitioned)
      }
    },
    [onClose, hideLoupe],
  )

  const onPointerLeave = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && !dragRef.current) hideLoupe()
    },
    [hideLoupe],
  )

  return (
    <>
      <div
        ref={cardRef}
        className="refcard"
        style={MOTION_STYLE}
        data-open={open}
        data-armed={armedRef.current}
        data-eject={ejected && open}
        aria-hidden={!open}
        onAnimationStart={onAnimationStart}
        onAnimationEnd={() => {
          if (!open) setDrag(0)
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={onPointerLeave}
      >
        <CardSheet idPrefix="refcard" rot={rot} name={victimName} ghostMhz={ghostMhz} progress={progress} />
      </div>

      {/* The reading loupe: above the radio, never takes the pointer */}
      <div ref={loupeRef} className="loupe" data-show="false" aria-hidden="true">
        <div className="loupe__view">
          <div ref={paperRef} className="loupe__paper">
            <CardSheet idPrefix="loupe-card" rot={rot} name={victimName} ghostMhz={ghostMhz} progress={progress} />
          </div>
        </div>
        <div className="loupe__glass" />
        <svg className="loupe__marks" viewBox="0 0 100 100">
          <defs>
            <path id="loupe-rim-path" d={RIM_TEXT_PATH} />
          </defs>
          {/* engraved: a dark cut with a light lower lip */}
          <text className="loupe__engrave loupe__engrave--lip">
            <textPath href="#loupe-rim-path" startOffset="2%">
              HAMorse · HM-13 READING LOUPE ·
            </textPath>
          </text>
          <text className="loupe__engrave">
            <textPath href="#loupe-rim-path" startOffset="2%">
              HAMorse · HM-13 READING LOUPE ·
            </textPath>
          </text>
          {/* index marks, with the radio's red needle colour at 12 o'clock */}
          <path className="loupe__ticks" d="M50 1.2 V4.4 M98.8 50 H95.6 M50 98.8 V95.6 M1.2 50 H4.4" />
          <circle className="loupe__index" cx="50" cy="2.8" r="1.1" />
        </svg>
      </div>
    </>
  )
}
