import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import './App.css'
import LCDDisplay from './components/LCDDisplay'
import TuningDial from './components/TuningDial'
import TelegraphDesk from './components/TelegraphDesk'
import ReferenceCard from './components/ReferenceCard'
import TopPanel from './components/TopPanel'
import RadioAudio from './components/RadioAudio'
import PowerOnGuide from './components/PowerOnGuide'
import { RadioProvider, useRadio } from './context/RadioContext'
import { useHauntSequence } from './hooks/useHauntSequence'
import type { HauntPhase } from './hooks/useHauntSequence'
import { MorseDecoderProvider, useMorseDecoder } from './hooks/useMorseDecoder'
import GhostFace from './components/GhostFace'
import { PowerHintProvider } from './hooks/usePowerHint'
import GhostedNote from './components/GhostedNote'
import type { GhostedReport } from './components/GhostedNote'
import { getGhostFrequency } from './constants'
import { playBreakerThunk, unlockAudio } from './utils/audioEngine'

/** the QSL card slides in this far into the 10 s freeze (4 s before the breaker trips) */
const GHOSTED_NOTE_INTO_FREEZE_MS = 6000

/**
 * The stage, which also plays the climax (it needs the radio state, so it
 * lives inside RadioProvider): data-haunt drives the corrupted LCD, the
 * shattered glass and the dripping liquid (CSS), the veil drives the
 * blackout and the flash, and the blast forces the reference card out.
 */
function Stage({ children }: { children: (props: { isRefCardOpen: boolean; ejected: boolean; toggleRefCard: () => void; closeRefCard: () => void }) => ReactNode }) {
  const { isHaunted, hardReset, setIsPowerOn } = useRadio()
  const { glitch, dread, isGhostTransmitting, ghostEncounter } = useMorseDecoder()
  const [isRefCardOpen, setIsRefCardOpen] = useState(false)
  const [ejected, setEjected] = useState(false)
  const toggleRefCard = useCallback(() => setIsRefCardOpen((open) => !open), [])
  const closeRefCard = useCallback(() => {
    setEjected(false)
    setIsRefCardOpen(false)
  }, [])
  const eject = useCallback(() => {
    setEjected(true)
    setIsRefCardOpen(true)
  }, [])
  // the trip: the breaker throws itself, and the radio wakes up fresh next time
  const trip = useCallback(() => {
    setEjected(false)
    setIsRefCardOpen(false)
    hardReset()
  }, [hardReset])
  const phase: HauntPhase = useHauntSequence(isHaunted, eject, trip)

  // the ghost's QSL card: how long you lasted, measured at the moment it struck
  const [ghosted, setGhosted] = useState<GhostedReport | null>(null)
  const pendingReport = useRef<GhostedReport | null>(null)
  useEffect(() => {
    if (phase === 'flash' && !pendingReport.current) {
      const e = ghostEncounter()
      const now = performance.now()
      pendingReport.current = { lastedMs: e.metAt === null ? 0 : now - e.metAt, words: e.words, name: e.name, frequency: getGhostFrequency() }
    }
    if (phase !== 'frozen') return
    const show = setTimeout(() => {
      setGhosted(pendingReport.current)
      pendingReport.current = null
    }, GHOSTED_NOTE_INTO_FREEZE_MS)
    return () => clearTimeout(show)
  }, [phase, ghostEncounter])
  const closeGhosted = useCallback(() => setGhosted(null), [])
  // pressed before the breaker has tripped: it waits for the reset, then switches on
  const wantsPower = useRef(false)
  const switchOn = useCallback(() => {
    playBreakerThunk(true)
    setIsPowerOn(true) // ...and it isn't really gone (the aftermath)
  }, [setIsPowerOn])
  const powerOnAgain = useCallback(() => {
    setGhosted(null)
    unlockAudio() // inside the tap: a real user gesture
    if (phase === 'none') switchOn()
    else wantsPower.current = true
  }, [phase, switchOn])
  useEffect(() => {
    if (phase !== 'none' || !wantsPower.current) return
    wantsPower.current = false
    const t = setTimeout(switchOn, 600) // a beat after the trip's own thunk
    return () => clearTimeout(t)
  }, [phase, switchOn])

  // during the climax nothing on the radio answers: not a tap, and not a key either
  // (inert also takes focus off the breaker, so Enter can't flip it mid-scare)
  const stageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const chassis = stageRef.current?.querySelector('.chassis')
    if (!chassis) return
    chassis.toggleAttribute('inert', phase !== 'none')
    if (phase !== 'none' && document.activeElement instanceof HTMLElement && chassis.contains(document.activeElement)) document.activeElement.blur()
  }, [phase])

  return (
    <>
      <div
        ref={stageRef}
        className="stage"
        data-haunt={phase}
        data-glitch={glitch?.kind ?? 'none'}
        data-dread={dread}
        data-ghost-tx={isGhostTransmitting}
      >
        {children({ isRefCardOpen, ejected, toggleRefCard, closeRefCard })}
        {/* the lamp dipping during a glitch (keyed, so each glitch replays its animation) */}
        {glitch && <div key={glitch.id} className="glitch-veil" data-kind={glitch.kind} aria-hidden="true" />}
      </div>
      {/* build-up flicker / blackout / flash (with the face): over everything, never takes the pointer */}
      <div className="haunt-veil" data-phase={phase} aria-hidden="true">
        {phase === 'flash' && <GhostFace idPrefix="veil-face" className="haunt-veil__face" />}
      </div>
      {ghosted && <GhostedNote report={ghosted} onPowerOn={powerOnAgain} onClose={closeGhosted} />}
    </>
  )
}

export default function App() {
  return (
    // RadioProvider holds the global radio state (frequency / power / decoder);
    // PowerHintProvider drives the Quick Start note shown before the first power-on;
    // MorseDecoderProvider holds the one shared decoder (paddles write, LCD reads).
    // .stage shrink-wraps the chassis: same box, same position. The card lives
    // in here *behind* the radio; the chassis itself never moves.
    <RadioProvider>
      <PowerHintProvider>
        <MorseDecoderProvider>
          {/* the synthesised static follows power + band; renders nothing */}
          <RadioAudio />
          <Stage>
            {({ isRefCardOpen, ejected, toggleRefCard, closeRefCard }) => (
              <>
                <ReferenceCard open={isRefCardOpen} ejected={ejected} onClose={closeRefCard} />

                <main className="chassis">
                  <TopPanel />
                  <LCDDisplay />
                  <TuningDial />
                  <TelegraphDesk isRefCardOpen={isRefCardOpen} onRefToggle={toggleRefCard} />

                  {/* Quick Start note: only before the first power-on, when a control needs power */}
                  <PowerOnGuide />
                </main>
              </>
            )}
          </Stage>
        </MorseDecoderProvider>
      </PowerHintProvider>
    </RadioProvider>
  )
}
