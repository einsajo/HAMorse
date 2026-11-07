import './TuningDial.css'

/**
 * VFO tuning dial: static physical UI only.
 * Rotation logic will later set a transform on `.vfo__knob`; the base
 * shadows sit on the non-rotating `.vfo__mount` so lighting stays fixed.
 */
export default function TuningDial() {
  return (
    <section className="tuning" aria-label="Tuning Panel">
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
    </section>
  )
}
