import { useCallback, useState } from 'react'
import './App.css'
import LCDDisplay from './components/LCDDisplay'
import TuningDial from './components/TuningDial'
import TelegraphDesk from './components/TelegraphDesk'
import ReferenceCard from './components/ReferenceCard'
import TopPanel from './components/TopPanel'
import { RadioProvider } from './context/RadioContext'

export default function App() {
  const [isRefCardOpen, setIsRefCardOpen] = useState(false)
  const toggleRefCard = useCallback(() => setIsRefCardOpen((open) => !open), [])
  const closeRefCard = useCallback(() => setIsRefCardOpen(false), [])

  return (
    // RadioProvider holds the global radio state (frequency / power / decoder).
    // .stage shrink-wraps the chassis: same box, same position. The card lives
    // in here *behind* the radio; the chassis itself never moves.
    <RadioProvider>
      <div className="stage">
        <ReferenceCard open={isRefCardOpen} onClose={closeRefCard} />

        <main className="chassis">
          <TopPanel />
          <LCDDisplay />
          <TuningDial />
          <TelegraphDesk isRefCardOpen={isRefCardOpen} onRefToggle={toggleRefCard} />
        </main>
      </div>
    </RadioProvider>
  )
}
