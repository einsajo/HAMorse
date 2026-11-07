import { useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import './ReferenceCard.css'

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

const MORSE: [string, string][] = [
  ['A', '·–'], ['B', '–···'], ['C', '–·–·'], ['D', '–··'], ['E', '·'], ['F', '··–·'],
  ['G', '––·'], ['H', '····'], ['I', '··'], ['J', '·–––'], ['K', '–·–'], ['L', '·–··'],
  ['M', '––'], ['N', '–·'], ['O', '–––'], ['P', '·––·'], ['Q', '––·–'], ['R', '·–·'],
  ['S', '···'], ['T', '–'], ['U', '··–'], ['V', '···–'], ['W', '·––'], ['X', '–··–'],
  ['Y', '–·––'], ['Z', '––··'],
  ['1', '·––––'], ['2', '··–––'], ['3', '···––'], ['4', '····–'], ['5', '·····'],
  ['6', '–····'], ['7', '––···'], ['8', '–––··'], ['9', '––––·'], ['0', '–––––'],
]

const Q_CODES: [string, string][] = [
  ['CQ', 'Calling any station'],
  ['QRT', 'Stop transmission'],
]

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
      setDrag(0)
      if (e.type === 'pointercancel') return
      if (moved < TAP_SLOP || towardRadio > CLOSE_DISTANCE) onClose()
    },
    [onClose],
  )

  return (
    <div
      ref={cardRef}
      className="refcard"
      data-open={open}
      aria-hidden={!open}
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
          {Q_CODES.map(([code, meaning]) => (
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
