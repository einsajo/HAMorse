import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import './PowerOnGuide.css'
import { useRadio } from '../context/RadioContext'
import { usePowerHint } from '../hooks/usePowerHint'
import { playBreakerThunk, unlockAudio } from '../utils/audioEngine'

interface Spot {
  x: number
  y: number
  r: number
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
  const { setIsPowerOn } = useRadio()
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
        <span className="guide__pencil" aria-hidden="true">
          start here
          {/* pencil arrow up at the breaker (drawn, so it never depends on font glyphs) */}
          <svg className="guide__arrow" viewBox="0 0 30 30">
            <path d="M3 27 C 9 24, 15 16, 21 5" />
            <path d="M14.5 7.5 L 21.5 4 L 22.5 11.5" />
          </svg>
        </span>

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
              Turn the <b>VFO</b> dial. Operators answer on the <b>HAM band, 100.00&ndash;103.50&nbsp;MHz</b>. New to
              Morse? The <b>Elmer on 100.30</b> will teach you.
            </li>
            <li>
              Key with <b>DIT (&middot;)</b> and <b>DAH (&ndash;)</b>, then press <b>TX SEND</b>.
            </li>
            <li>
              <b>DECODER ON</b> shows your Morse as text; <b>OFF</b> trains your ear. <b>REF</b>: the code card.{' '}
              <b>CLR</b>: erase.
            </li>
          </ol>
        </div>

        <div className="guide__actions">
          <button ref={primaryRef} type="button" className="guide__btn guide__btn--primary" onClick={powerOn}>
            [ THROW MAIN POWER ]
          </button>
          <button type="button" className="guide__btn" onClick={dismiss}>
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
