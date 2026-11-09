import './LCDDisplay.css'
import DustCanvas from './DustCanvas'
import { formatFrequency, useRadio } from '../context/RadioContext'
import { useMorseDecoder } from '../hooks/useMorseDecoder'

/**
 * Amber LCD display panel.
 * Power OFF: backlight dead (dark glass), no text; the bezel, stain and dust stay.
 * Power ON: amber backlight with the live frequency (always two decimals).
 * Buffer row: DECODER OFF = blank. DECODER ON on a broadcaster = a faint
 * blinking "RX ONLY"; on dead air = "DEAD BAND". DECODER ON on the ham band or
 * the ghost frequency = the decoded message followed by the dits/dahs being
 * keyed right now, so every tap shows immediately. When the text is wider than
 * the glass, the oldest characters scroll off to the left.
 *
 * Each text row is drawn twice in the same grid cell: an "unlit" ghost layer of
 * every segment (dim #3A2800 silt), with the lit liquid-crystal text on top.
 */
const STATUS_TEXT = {
  'rx-only': 'RX ONLY',
  'dead-band': 'DEAD BAND',
} as const

export default function LCDDisplay() {
  const { frequency, isPowerOn } = useRadio()
  const { currentSymbol, decodedMessage, status } = useMorseDecoder()
  const freqText = formatFrequency(frequency)

  return (
    <section className="lcd" aria-label="Display Panel" data-power={isPowerOn ? 'on' : 'off'}>
      <div className="lcd__bezel">
        <div className="lcd__glass">
          <div className="lcd__row lcd__row--freq">
            <span className="lcd__stack">
              <span className="lcd__ghost" aria-hidden="true">
                888.88
              </span>
              <span className="lcd__ink" aria-live="polite" aria-label={`${freqText} megahertz`}>
                {freqText}
              </span>
            </span>
            <span className="lcd__unit lcd__ink">MHz</span>
          </div>

          <div className="lcd__divider" aria-hidden="true" />

          <div className="lcd__row lcd__row--buffer" data-status={status}>
            <span className="lcd__stack">
              <span className="lcd__ghost lcd__ghost--matrix" aria-hidden="true" />
              {/* viewport pins the newest text to the right edge once it overflows */}
              <span className="lcd__ink lcd__buffer">
                {(status === 'rx-only' || status === 'dead-band') && (
                  <span className="lcd__warning" role="status">
                    {STATUS_TEXT[status]}
                  </span>
                )}
                {status === 'ready' && (
                  <span className="lcd__buffer-text">
                    <span aria-live="polite" aria-label={`Decoded: ${decodedMessage || 'nothing yet'}`}>
                      {decodedMessage}
                    </span>
                    <span className="lcd__symbol" aria-hidden="true">
                      {currentSymbol}
                    </span>
                    <span className="lcd__cursor" aria-hidden="true" />
                  </span>
                )}
              </span>
            </span>
          </div>

          {/* permanent, un-wipeable stain/fog baked into the old glass */}
          <span className="lcd__stain" aria-hidden="true" />

          {/* wipeable grime on the glass, above the stain, below the bezel shadow */}
          <DustCanvas />
        </div>
      </div>
    </section>
  )
}
