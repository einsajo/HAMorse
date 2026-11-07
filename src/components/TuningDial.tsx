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
      <MetalPlate className="plate--serial tuning__plate" label="Serial number SER: 1984-K1R0">
        <span className="plate__serial">SER: 1984-K1R0</span>
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

      <MetalPlate className="plate--brand tuning__plate" label="MorseHam MK-I">
        <span className="plate__brand">MorseHam</span>
        <span className="plate__model">MK-I</span>
      </MetalPlate>
    </section>
  )
}
