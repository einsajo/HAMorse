import './LCDDisplay.css'
import DustCanvas from './DustCanvas'

/**
 * Amber LCD display panel.
 * Placeholder content only: frequency and buffer get wired up later.
 *
 * Each text row is drawn twice in the same grid cell: an "unlit" ghost layer of
 * every segment (dim #3A2800 silt), with the lit liquid-crystal text on top.
 */
export default function LCDDisplay() {
  return (
    <section className="lcd" aria-label="Display Panel">
      <div className="lcd__bezel">
        <div className="lcd__glass">
          <div className="lcd__row lcd__row--freq">
            <span className="lcd__stack">
              <span className="lcd__ghost" aria-hidden="true">
                888.88
              </span>
              <span className="lcd__ink">104.40</span>
            </span>
            <span className="lcd__unit lcd__ink">MHz</span>
          </div>

          <div className="lcd__divider" aria-hidden="true" />

          <div className="lcd__row lcd__row--buffer">
            <span className="lcd__stack">
              <span className="lcd__ghost lcd__ghost--matrix" aria-hidden="true" />
              <span className="lcd__ink">READY / DIT-DAH BUFFER...</span>
            </span>
          </div>

          {/* wipeable grime on the glass, above the text, below the bezel shadow */}
          <DustCanvas />
        </div>
      </div>
    </section>
  )
}
