import './LCDDisplay.css'
import DustCanvas from './DustCanvas'
import { formatFrequency, useRadio } from '../context/RadioContext'
import { useMorseDecoder } from '../hooks/useMorseDecoder'
import type { TxStatus } from '../hooks/useMorseDecoder'

/**
 * Amber LCD display panel.
 * Power OFF: backlight dead (dark glass), no text; the bezel, stain and dust stay.
 * Power ON: amber backlight with the live frequency (always two decimals), and
 * the RX / TX annunciators in the top-left corner (TX SEND feedback). With the
 * DECODER ON, what you've keyed but not yet sent is underlined, and the
 * annunciator says PRESS TX: nothing goes out until you've checked it.
 * Buffer row: DECODER OFF = blank (only the display: keying, decoding and
 * station replies carry on unseen). DECODER ON on a broadcaster = a faint
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

/** What the TX annunciator spells next to the TX flag */
const TX_TEXT: Record<Exclude<TxStatus, 'idle'>, string> = {
  sending: 'SEND',
  'no-reply': 'NO REPLY',
  inhibit: 'INHIBIT',
  busy: 'BUSY',
  empty: 'NO MSG',
}

/** Screen-reader wording for the annunciator */
const TX_SPOKEN: Record<Exclude<TxStatus, 'idle'>, string> = {
  sending: 'Transmitting',
  'no-reply': 'No reply',
  inhibit: 'Transmit inhibited on this frequency',
  busy: 'Frequency busy, wait for the other station',
  empty: 'Nothing keyed to send',
}

/**
 * The status annunciators in the corner of the glass, like a real rig's LCD:
 * printed RX and TX flags (faint when unlit, dark when lit) and a short
 * message. TX SEND shows "TX SEND" with dots counting up . .. ... while the
 * over goes out and the far end is awaited; RX lights while another station
 * is sending. They are status, not decoded text, so they show with the
 * DECODER OFF too.
 */
function Annunciator({ tx, rx, draft }: { tx: TxStatus; rx: boolean; draft: boolean }) {
  const txLit = tx === 'sending' || tx === 'inhibit' || tx === 'empty' || tx === 'no-reply'
  // while TX SEND... is up, TX owns the display; RX takes over once it clears
  const rxLit = (rx && tx !== 'sending') || tx === 'busy'
  // DECODER ON and something keyed but unsent: a gentle prompt to check it and press TX SEND
  if (tx === 'idle' && draft && !rx) {
    return (
      <span className="lcd__annun" data-tx="ready">
        <span className="lcd__flag" data-lit="false" aria-hidden="true">
          RX
        </span>
        <span className="lcd__flag" data-lit="false" aria-hidden="true">
          TX
        </span>
        <span className="lcd__annun-msg lcd__ink" role="status" aria-label="Unsent: check it, then press TX SEND">
          PRESS TX
        </span>
      </span>
    )
  }
  return (
    <span className="lcd__annun" data-tx={tx}>
      <span className="lcd__flag" data-lit={rxLit} aria-hidden="true">
        RX
      </span>
      <span className="lcd__flag" data-lit={txLit} aria-hidden="true">
        TX
      </span>
      <span className="lcd__annun-msg lcd__ink" role="status" aria-label={tx === 'idle' ? (rx ? 'Receiving' : '') : TX_SPOKEN[tx]}>
        {tx !== 'idle' && TX_TEXT[tx]}
        {tx === 'sending' && (
          <span className="lcd__dots" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        )}
      </span>
    </span>
  )
}

export default function LCDDisplay() {
  const { frequency, isPowerOn } = useRadio()
  const { currentSymbol, decodedMessage, draftFrom, status, isReceiving, txStatus } = useMorseDecoder()
  // what's been sent / received, and your unsent draft after it (underlined)
  const sentText = decodedMessage.slice(0, draftFrom)
  const draftText = decodedMessage.slice(draftFrom)
  const hasDraft = status === 'ready' && !isReceiving && (draftText.trim() !== '' || currentSymbol !== '')
  const freqText = formatFrequency(frequency)

  return (
    <section className="lcd" aria-label="Display Panel" data-power={isPowerOn ? 'on' : 'off'}>
      <div className="lcd__bezel">
        <div className="lcd__glass">
          <div className="lcd__row lcd__row--freq">
            <Annunciator tx={txStatus} rx={isReceiving} draft={hasDraft} />
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

          <div className="lcd__row lcd__row--buffer" data-status={status} data-receiving={isReceiving}>
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
                      {sentText}
                      {draftText !== '' && (
                        <span className="lcd__draft" data-unsent={hasDraft}>
                          {draftText}
                        </span>
                      )}
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
