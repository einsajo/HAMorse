import { useEffect, useRef } from 'react'
import './GhostedNote.css'

/**
 * The ghost's QSL card. Hams confirm every contact with a QSL card, so the
 * ghost sends you one: it slides in near the end of the frozen silence, just
 * before the breaker trips, and stays after the reset until you close it.
 *
 *   - how long you lasted: GHOSTED AT 1:44 (from its first transmission to
 *     the moment it struck)
 *   - one dry line about how it went (you never spoke / you told it your
 *     name / you kept it talking)
 *   - and, in small type, an honest note: this is a horror game made for fun,
 *     and an apology if it frightened anyone (or anyone young)
 *
 * Lives outside .stage, so the freeze (which pauses every animation on the
 * radio) doesn't pause it, and the climax lock (inert chassis) doesn't block it.
 */
export interface GhostedReport {
  /** ms from its first transmission to the strike */
  lastedMs: number
  words: number
  name: string | null
  frequency: number
}

/** 1:44 */
export function formatLasted(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** One dry line about how it went */
export function ghostedQuip({ words, name, lastedMs }: Pick<GhostedReport, 'words' | 'name' | 'lastedMs'>): string {
  if (words <= 2) return 'You never said a word. It talked anyway.'
  if (name) return `You told it your name, ${name}. Never tell it your name.`
  if (lastedMs >= 120000) return 'You kept it talking for ages. Brave. Or just polite?'
  return 'You answered it. Most people do.'
}

interface GhostedNoteProps {
  report: GhostedReport
  onPowerOn: () => void
  onClose: () => void
}

export default function GhostedNote({ report, onPowerOn, onClose }: GhostedNoteProps) {
  const primary = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    primary.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const lasted = formatLasted(report.lastedMs)
  return (
    <div className="ghosted" role="dialog" aria-modal="true" aria-labelledby="ghosted-title" aria-describedby="ghosted-quip">
      <div className="ghosted__card">
        <header className="ghosted__head">
          <span className="ghosted__qsl">QSL</span>
          <span className="ghosted__from">
            FROM: <b>???</b>
            <br />
            ON: <b>{report.frequency.toFixed(2)} MHz</b>
          </span>
        </header>

        <p className="ghosted__confirm">CONFIRMING OUR QSO. TO: {report.name ?? 'OPERATOR'}</p>

        <h2 id="ghosted-title" className="ghosted__title">
          <span className="ghosted__stamp">GHOSTED</span>
          <span className="ghosted__at">
            AT <b>{lasted}</b>
          </span>
        </h2>

        <p id="ghosted-quip" className="ghosted__quip">
          {ghostedQuip(report)}
        </p>

        <p className="ghosted__sign" aria-hidden="true">
          73 ES SEE U SOON
        </p>

        <div className="ghosted__actions">
          <button ref={primary} type="button" className="ghosted__btn ghosted__btn--primary" onClick={onPowerOn}>
            [ POWER ON AGAIN ]
          </button>
          <button type="button" className="ghosted__btn" onClick={onClose}>
            [ CLOSE ]
          </button>
        </div>

        <p className="ghosted__disclaimer">
          HAMorse is a horror game made just for fun, for Kiroween 2026. If it scared you, or someone young
          watching, we&rsquo;re truly sorry. The Morse you learned is real: keep it. 73.
        </p>
      </div>
    </div>
  )
}
