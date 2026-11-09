import { useCallback, useRef } from 'react'
import type { AnimationEvent as ReactAnimationEvent, CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import './ReferenceCard.css'
import { CHAR_TO_MORSE, MORSE_TABLE_ORDER, Q_CODES, toTypographic } from '../utils/morseDictionary'
import { REF_CARD_MOTION } from '../utils/cardMotion'
import { playPaperScrape } from '../utils/audioEngine'

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
  onClose: () => void
}

interface DragState {
  id: number
  startX: number
  startY: number
  wide: boolean
  offset: number
}

/**
 * Operator's reference card, tucked behind the (stationary) chassis.
 * Slides out on REF; tap it, or drag it back toward the radio, to put it away.
 */
export default function ReferenceCard({ open, onClose }: ReferenceCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
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

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!open || dragRef.current) return
      e.currentTarget.setPointerCapture(e.pointerId)
      dragRef.current = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        wide: window.matchMedia(WIDE_QUERY).matches,
        offset: 0,
      }
      e.currentTarget.dataset.dragging = 'true'
    },
    [open],
  )

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.id) return
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
  }, [])

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.id) return
      dragRef.current = null
      delete e.currentTarget.dataset.dragging
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
    [onClose],
  )

  return (
    <div
      ref={cardRef}
      className="refcard"
      style={MOTION_STYLE}
      data-open={open}
      data-armed={armedRef.current}
      aria-hidden={!open}
      onAnimationStart={onAnimationStart}
      onAnimationEnd={() => {
        if (!open) setDrag(0)
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="refcard__sheet">
        <header className="refcard__head">
          <span>HAMorse HM-13</span>
          <span>OPERATOR REF. CARD</span>
        </header>

        <dl className="refcard__morse">
          {MORSE.map(([ch, code]) => (
            <div key={ch} className="refcard__entry">
              <dt>{ch}</dt>
              <dd>{code}</dd>
            </div>
          ))}
        </dl>

        <dl className="refcard__q">
          {QCODE_ROWS.map(([code, meaning]) => (
            <div key={code} className="refcard__qrow">
              <dt>{code}:</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>

        <p className="refcard__note">
          {'Dial drifts below 90MHz in the cold. '}
          <span className="refcard__sig">- Nevlin</span>
        </p>
      </div>
    </div>
  )
}
