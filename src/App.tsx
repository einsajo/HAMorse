import './App.css'
import LCDDisplay from './components/LCDDisplay'
import TuningDial from './components/TuningDial'
import TelegraphDesk from './components/TelegraphDesk'

export default function App() {
  return (
    <main className="chassis">
      <section className="panel panel--top" aria-label="Top Panel">
        Top Panel
      </section>
      <LCDDisplay />
      <TuningDial />
      <TelegraphDesk />
    </main>
  )
}
