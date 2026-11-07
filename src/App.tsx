import { useCallback, useState } from 'react'
import './App.css'
import LCDDisplay from './components/LCDDisplay'
import TuningDial from './components/TuningDial'
import TelegraphDesk from './components/TelegraphDesk'
import ReferenceCard from './components/ReferenceCard'

export default function App() {
  const [isRefCardOpen, setIsRefCardOpen] = useState(false)
  const toggleRefCard = useCallback(() => setIsRefCardOpen((open) => !open), [])
  const closeRefCard = useCallback(() => setIsRefCardOpen(false), [])

  return (
    // .stage shrink-wraps the chassis: same box, same position. The card lives
    // in here *behind* the radio; the chassis itself never moves.
    <div className="stage">
      <ReferenceCard open={isRefCardOpen} onClose={closeRefCard} />

      <main className="chassis">
        <section className="panel panel--top" aria-label="Top Panel">
          Top Panel
        </section>
        <LCDDisplay />
        <TuningDial />
        <TelegraphDesk isRefCardOpen={isRefCardOpen} onRefToggle={toggleRefCard} />
      </main>
    </div>
  )
}
