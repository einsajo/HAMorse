import './TuningDial.css'
import MetalPlate from './MetalPlate'

/**
 * VFO tuning dial: static physical UI only.
 * Rotation logic will later set a transform on `.vfo__knob`; the base
 * shadows sit on the non-rotating `.vfo__mount` so lighting stays fixed.
 */
export default function TuningDial() {
  return (
    <section className="tuning" aria-label="Tuning Panel">
      <MetalPlate
        className="plate--sop tuning__plate tuning__sop"
        label="Operating instructions: 1. Rotate VFO to seek signal. 2. Use DIT/DAH paddles to TX. 3. Monitor LCD buffer. Warning: no emissions on dead bands."
      >
        <span className="sop__title">OPERATING INSTRUCTIONS:</span>
        <span className="sop__step">1. ROTATE VFO TO SEEK SIGNAL.</span>
        <span className="sop__step">2. USE DIT/DAH PADDLES TO TX.</span>
        <span className="sop__step">3. MONITOR LCD BUFFER.</span>
        <span className="sop__warn">WARNING: NO EMISSIONS ON DEAD BANDS.</span>
      </MetalPlate>

      <div className="vfo" role="presentation">
        <div className="vfo__well">
          <div className="vfo__mount">
            <div className="vfo__knob">
              <div className="vfo__face">
                <span className="vfo__indicator" aria-hidden="true" />
                <span className="vfo__dimple" aria-hidden="true" />
              </div>
            </div>
            {/* fixed lighting layer above the knob (does not rotate) */}
            <div className="vfo__sheen" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="tuning__stack">
        <MetalPlate className="plate--brand" label="HAMorse HM-13">
          <span className="plate__brand">HAMorse</span>
          <span className="plate__model">HM-13</span>
        </MetalPlate>
        <MetalPlate className="plate--serial" label="Serial number SER: 1984-K1R0">
          <span className="plate__serial">SER: 1984-K1R0</span>
        </MetalPlate>
      </div>
    </section>
  )
}
