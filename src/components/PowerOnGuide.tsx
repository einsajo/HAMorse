import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import './PowerOnGuide.css'
import { useRadio } from '../context/RadioContext'
import { usePowerHint } from '../hooks/usePowerHint'
import { playBreakerThunk, unlockAudio } from '../utils/audioEngine'
import { AGENT_STATIONS, BROADCAST_KINDS, BROADCAST_STATIONS, HAM_STATIONS, formatMhz } from '../constants'

interface Spot {
  x: number
  y: number
  r: number
}

/**
 * The back of the note: what the red PWR lamp shows once the radio is on.
 * No theory — just the controls and who's on the band. The frequencies come
 * from constants.ts, so this can never drift from the dial. (The ghost's
 * frequency is never listed, obviously.)
 */
function StationGuide() {
  const channels: [string, string][] = [
    [BROADCAST_STATIONS.map((f) => formatMhz(f)).join(' · '), BROADCAST_STATIONS.map((f) => BROADCAST_KINDS[f]).join(' · ') + ' (listen)'],
    [formatMhz(AGENT_STATIONS.guide), 'The Guide - points you around'],
    [formatMhz(HAM_STATIONS.elmer), 'The Elmer - for beginners'],
    [formatMhz(HAM_STATIONS.tutor), 'Practice - HI, then SOS'],
    [formatMhz(HAM_STATIONS.bulletin), 'Bulletin - slow copy practice'],
    [formatMhz(HAM_STATIONS.ragchew), 'Bob - a real-feeling QSO'],
    [formatMhz(AGENT_STATIONS.stranger), 'The Stranger - someone new every boot'],
    [formatMhz(HAM_STATIONS.speed), 'Sam - speed drills'],
  ]
  return (
    <>
      <h2 id="guide-title" className="guide__title">
        <span>OPERATOR GUIDE</span>
        <span className="guide__model">HAMorse HM-13 · STATIONS &amp; KEYS</span>
      </h2>

      <div id="guide-steps">
        <ul className="guide__steps guide__steps--bare">
          <li>
            <b>VFO knob:</b> tune the band; it clicks onto stations. <b>DIT (·)</b> / <b>DAH (–)</b> key Morse,{' '}
            <b>TX SEND</b> transmits, <b>CLR</b> erases a mistake.
          </li>
          <li>
            <b>DECODER</b> ON shows your Morse as text; OFF trains your ear. <b>TX GBL</b>: on the air - anyone else
            on your frequency hears you. <b>REF</b>: the code card. <b>PWR lamp</b>: this guide.
          </li>
        </ul>

        <dl className="guide__channels">
          {channels.map(([f, who]) => (
            <div key={f} className="guide__channel">
              <dt>{f}</dt>
              <dd>{who}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  )
}

/**
 * Quick Start: a yellowed operator's note taped over the radio, shown as
 * soon as the page loads (and again if a power-dependent control is used
 * before the first power-on). A few lines on why Morse matters, then four
 * steps. The chassis dims with a spotlight on the MAIN POWER breaker.
 *
 * "THROW MAIN POWER" performs the breaker's own action (same thunk, same audio
 * unlock), from a click, which browsers accept as a user gesture. Lives inside
 * .chassis, so it scales with the radio.
 */
export default function PowerOnGuide() {
  const { isOpen, dismiss } = usePowerHint()
  const { isPowerOn, setIsPowerOn } = useRadio()
  const rootRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const [spot, setSpot] = useState<Spot | null>(null)

  // keep the spotlight centred on the breaker, whatever the radio's size
  useEffect(() => {
    if (!isOpen) return
    const chassisOf = () => rootRef.current?.parentElement ?? null
    // re-query on every measure, and ignore detached / zero-size boxes
    const measure = () => {
      const chassis = chassisOf()
      const mcb = chassis?.querySelector('.mcb')
      if (!chassis || !mcb) return
      const c = chassis.getBoundingClientRect()
      const m = mcb.getBoundingClientRect()
      if (c.width === 0 || m.width === 0) return
      setSpot({ x: m.left + m.width / 2 - c.left, y: m.top + m.height / 2 - c.top, r: Math.max(m.width, m.height) * 0.62 })
    }
    measure()
    const chassis = chassisOf()
    if (!chassis) return
    const ro = new ResizeObserver(measure)
    ro.observe(chassis)
    return () => ro.disconnect()
  }, [isOpen])

  // keyboard: focus the main action; Escape closes
  useEffect(() => {
    if (!isOpen) return
    primaryRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, dismiss])

  const powerOn = useCallback(() => {
    unlockAudio()
    playBreakerThunk(true)
    setIsPowerOn(true) // the guide closes itself on power-on
  }, [setIsPowerOn])

  if (!isOpen) return null

  const veilStyle = spot
    ? ({ '--spot-x': `${spot.x}px`, '--spot-y': `${spot.y}px`, '--spot-r': `${spot.r}px` } as CSSProperties)
    : undefined

  return (
    <div ref={rootRef} className="guide">
      <div className="guide__veil" style={veilStyle} aria-hidden="true" />

      <div className="guide__card" role="dialog" aria-labelledby="guide-title" aria-describedby="guide-steps">
        <span className="guide__tape guide__tape--l" aria-hidden="true" />
        <span className="guide__tape guide__tape--r" aria-hidden="true" />
        {!isPowerOn && (
          <span className="guide__pencil" aria-hidden="true">
            start here
            {/* pencil arrow up at the breaker (drawn, so it never depends on font glyphs) */}
            <svg className="guide__arrow" viewBox="0 0 30 30">
              <path d="M3 27 C 9 24, 15 16, 21 5" />
              <path d="M14.5 7.5 L 21.5 4 L 22.5 11.5" />
            </svg>
          </span>
        )}

        {isPowerOn ? (
          <StationGuide />
        ) : (
          <>
        <h2 id="guide-title" className="guide__title">
          <span>QUICK START</span>
          <span className="guide__model">HAMorse HM-13 · MORSE TRAINER</span>
        </h2>

        <div id="guide-steps">
          <p className="guide__intro">
            In the 1830s, <b>Samuel Morse</b> and Alfred Vail turned words into dots and dashes. Morse code still
            gets through when voice and data can&rsquo;t: a faint tone, a flashing light, a tap on a pipe.{' '}
            <b>&middot;&middot;&middot; &ndash;&ndash;&ndash; &middot;&middot;&middot;</b> means SOS everywhere on Earth. Learn it once, and
            you can always call for help. This radio teaches you, by ear and by hand.
          </p>

          <ol className="guide__steps">
            <li>
              Throw <b>MAIN POWER</b> (top left). Sound starts here; headphones help.
            </li>
            <li>
              Turn the <b>VFO</b> dial. New to ham? The <b>Elmer on 100.30</b> will help you. Fellow operators are
              on <b>100&ndash;103.50&nbsp;MHz</b>: call them and say hello.
            </li>
            <li>
              Key with <b>DIT (&middot;)</b> and <b>DAH (&ndash;)</b>, then press <b>TX SEND</b>.
            </li>
            <li>
              <b>DECODER ON</b> shows your Morse as text; <b>OFF</b> trains your ear. <b>REF</b>: the code card.{' '}
              <b>CLR</b>: erase.
            </li>
            <li>
              Tap the red <b>PWR</b> lamp any time for the operator guide: every station and control.
            </li>
          </ol>
        </div>
          </>
        )}

        <div className="guide__actions">
          {/* read again with the radio already on: just close it */}
          {!isPowerOn && (
            <button ref={primaryRef} type="button" className="guide__btn guide__btn--primary" onClick={powerOn}>
              [ THROW MAIN POWER ]
            </button>
          )}
          <button ref={isPowerOn ? primaryRef : undefined} type="button" className="guide__btn" onClick={dismiss}>
            [ GOT IT ]
          </button>
        </div>

        <p className="guide__sign" aria-hidden="true">
          73 &amp; happy keying
        </p>
      </div>
    </div>
  )
}
