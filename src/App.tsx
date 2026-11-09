import { useCallback, useState } from 'react'
import './App.css'
import LCDDisplay from './components/LCDDisplay'
import TuningDial from './components/TuningDial'
import TelegraphDesk from './components/TelegraphDesk'
import ReferenceCard from './components/ReferenceCard'
import TopPanel from './components/TopPanel'
import RadioAudio from './components/RadioAudio'
import PowerOnGuide from './components/PowerOnGuide'
import { RadioProvider } from './context/RadioContext'
import { MorseDecoderProvider } from './hooks/useMorseDecoder'
import { PowerHintProvider } from './hooks/usePowerHint'

export default function App() {
  const [isRefCardOpen, setIsRefCardOpen] = useState(false)
  const toggleRefCard = useCallback(() => setIsRefCardOpen((open) => !open), [])
  const closeRefCard = useCallback(() => setIsRefCardOpen(false), [])

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
          <div className="stage">
            <ReferenceCard open={isRefCardOpen} onClose={closeRefCard} />

            <main className="chassis">
              <TopPanel />
              <LCDDisplay />
              <TuningDial />
              <TelegraphDesk isRefCardOpen={isRefCardOpen} onRefToggle={toggleRefCard} />

              {/* Quick Start note: only before the first power-on, when a control needs power */}
              <PowerOnGuide />
            </main>
          </div>
        </MorseDecoderProvider>
      </PowerHintProvider>
    </RadioProvider>
  )
}
