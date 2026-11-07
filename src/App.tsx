import './App.css'
import LCDDisplay from './components/LCDDisplay'
import TuningDial from './components/TuningDial'

export default function App() {
  return (
    <main className="chassis">
      <section className="panel panel--top" aria-label="Top Panel">
        Top Panel
      </section>
      <LCDDisplay />
      <TuningDial />
      <section className="panel panel--telegraph" aria-label="Telegraph Desk">
        Telegraph Desk
      </section>
    </main>
  )
}
