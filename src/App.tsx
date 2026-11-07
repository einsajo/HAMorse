import './App.css'
import LCDDisplay from './components/LCDDisplay'

export default function App() {
  return (
    <main className="chassis">
      <section className="panel panel--top" aria-label="Top Panel">
        Top Panel
      </section>
      <LCDDisplay />
      <section className="panel panel--tuning" aria-label="Tuning Panel">
        Tuning Panel
      </section>
      <section className="panel panel--telegraph" aria-label="Telegraph Desk">
        Telegraph Desk
      </section>
    </main>
  )
}
