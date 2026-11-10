import { useCallback, useState } from 'react'
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
import { MorseDecoderProvider } from './hooks/useMorseDecoder'
import { PowerHintProvider } from './hooks/usePowerHint'

/**
 * The stage, which also plays the climax (it needs the radio state, so it
 * lives inside RadioProvider): data-haunt drives the corrupted LCD, the
 * shattered glass and the dripping liquid (CSS), the veil drives the
 * blackout and the flash, and the blast forces the reference card out.
 */
function Stage({ children }: { children: (props: { isRefCardOpen: boolean; ejected: boolean; toggleRefCard: () => void; closeRefCard: () => void }) => ReactNode }) {
  const { isHaunted, hardReset } = useRadio()
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

  return (
    <>
      <div className="stage" data-haunt={phase}>
        {children({ isRefCardOpen, ejected, toggleRefCard, closeRefCard })}
      </div>
      {/* blackout / flash: over everything, never takes the pointer */}
      <div className="haunt-veil" data-phase={phase} aria-hidden="true" />
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
