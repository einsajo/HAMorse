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
 * Quick Start: a yellowed operator's note taped over the radio, shown when
 * someone uses a power-dependent control before the radio has ever been
 * switched on. The chassis dims with a spotlight on the MAIN POWER breaker.
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

        <ol id="guide-steps" className="guide__steps">
          <li>
            Throw the <b>MAIN POWER</b> breaker (top left) to switch on. Your browser only allows sound once
            the radio is on.
          </li>
          <li>
            Turn the <b>VFO</b> dial to tune. Broadcast stations are receive-only; transmit on the{' '}
            <b>HAM band, 100.00–102.00&nbsp;MHz</b>. Real-feeling operators live there; tune around to meet them.
            New to Morse? The <b>Elmer on 100.60</b> will teach you.
          </li>
          <li>
            Tap <b>DIT (·)</b> and <b>DAH (–)</b> to send Morse. You'll hear a 700&nbsp;Hz tone.
          </li>
          <li>
            <b>DECODER ON</b> shows the Morse as text on the screen. Switch it <b>OFF</b> and the screen goes
            blank but the radio still works: copy and send by ear.
          </li>
          <li>
            <b>REF</b> pulls out the Morse code card. <b>CLR</b> clears the screen.
          </li>
        </ol>

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
