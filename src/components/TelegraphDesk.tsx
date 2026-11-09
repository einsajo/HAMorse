import { useCallback } from 'react'
import './TelegraphDesk.css'
import { usePress } from '../hooks/usePress'
import { useMorseDecoder } from '../hooks/useMorseDecoder'
import type { MorseTap } from '../hooks/useMorseDecoder'
import { usePowerHint } from '../hooks/usePowerHint'
import { useRadio } from '../context/RadioContext'
import { playButtonRelease, playButtonSnap } from '../utils/audioEngine'

/* --- Iambic squeeze keyer ------------------------------------------------ */

interface LeverProps {
  side: 'dit' | 'dah'
  /** fired the instant the lever is pushed down */
  onTap: (type: MorseTap) => void
}

const SYMBOL: Record<LeverProps['side'], MorseTap> = { dit: '.', dah: '-' }

/**
 * One horizontal lever: flat aluminium arm + bakelite thumb-piece. Presses DOWN
 * into the desk, and keys a dit (".") or dah ("-") the moment it is pressed.
 * The lever always moves (it is mechanical); the decoder decides whether the
 * tap is translated.
 */
function Lever({ side, onTap }: LeverProps) {
  const { pressed, handlers } = usePress({ onPress: () => onTap(SYMBOL[side]) })
  return (
    <div
      className={`lever lever--${side}`}
      data-pressed={pressed}
      role="button"
      aria-label={side.toUpperCase()}
      aria-pressed={pressed}
      {...handlers}
    >
      <span className="lever__arm" aria-hidden="true" />
      <span className="lever__pad" aria-hidden="true" />
    </div>
  )
}

function Keyer({ onTap }: { onTap: (type: MorseTap) => void }) {
  return (
    <div className="keyer">
      <div className="keyer__plate" aria-hidden="true">
        <span className="keyer__screw keyer__screw--tl" />
        <span className="keyer__screw keyer__screw--tr" />
        <span className="keyer__screw keyer__screw--bl" />
        <span className="keyer__screw keyer__screw--br" />
      </div>

      <Lever side="dit" onTap={onTap} />
      <Lever side="dah" onTap={onTap} />

      {/* rear pivot blocks (fixed; the levers slide under them) */}
      <span className="keyer__pivot keyer__pivot--dit" aria-hidden="true" />
      <span className="keyer__pivot keyer__pivot--dah" aria-hidden="true" />

      {/* central post: solid, clean metal */}
      <span className="keyer__post" aria-hidden="true" />

      <div className="keyer__labels silk" aria-hidden="true">
        <span>DIT</span>
        <span>DAH</span>
      </div>
    </div>
  )
}

/* --- Buttons -------------------------------------------------------------- */

interface UtilityButtonProps {
  label: string
  onPress?: () => void
  /** latching switch: stays partly depressed while its function is engaged */
  latched?: boolean
}

/** Small tactile push switch (REF / CLR): clicks going down, and again (lighter) coming up */
function UtilityButton({ label, onPress, latched }: UtilityButtonProps) {
  const { pressed, handlers } = usePress({
    onPress: () => {
      playButtonSnap()
      onPress?.()
    },
    onRelease: playButtonRelease,
  })
  return (
    <div className="utility">
      <div className="utility__housing">
        <div
          className="utility__cap"
          data-pressed={pressed}
          data-latched={latched ?? false}
          role="button"
          aria-label={label}
          aria-pressed={latched ?? pressed}
          {...handlers}
        />
      </div>
      <span className="utility__label silk" aria-hidden="true">
        {label}
      </span>
    </div>
  )
}

/**
 * TX SEND: same footprint as REF / CLR, but a dark knurled housing with an
 * inset dark-red glass lens.
 */
function TxButton({ onPress }: { onPress?: () => void }) {
  const { pressed, handlers } = usePress({
    onPress: () => {
      playButtonSnap()
      onPress?.()
    },
    onRelease: playButtonRelease,
  })
  return (
    <div className="utility tx">
      <div className="tx__housing">
        <div
          className="tx__lens"
          data-pressed={pressed}
          role="button"
          aria-label="TX SEND"
          aria-pressed={pressed}
          {...handlers}
        />
      </div>
      <span className="utility__label silk" aria-hidden="true">
        TX SEND
      </span>
    </div>
  )
}

/**
 * TX ARM: a guarded "missile" safety toggle. A hinged, faded-red translucent
 * cover sits closed over a small bat toggle, on a hazard-striped steel plate.
 * Mirrors REF over CLR on the left so the desk stays symmetrical. Static for now.
 */
function ArmGuard() {
  return (
    <div className="utility guard" role="img" aria-label="TX arm safety switch, cover closed">
      <div className="guard__plate" aria-hidden="true">
        <span className="guard__screw guard__screw--a" />
        <span className="guard__screw guard__screw--b" />
        <span className="guard__well">
          <span className="guard__toggle" />
        </span>
        <span className="guard__cover">
          <span className="guard__hinge" />
        </span>
      </div>
      <span className="utility__label silk" aria-hidden="true">
        TX ARM
      </span>
    </div>
  )
}

interface TelegraphDeskProps {
  isRefCardOpen: boolean
  onRefToggle: () => void
}

/**
 * Telegraph Desk: REF/CLR switches | horizontal iambic squeeze keyer | TX ARM guard / TX SEND.
 * REF toggles the reference card; DIT / DAH key the Morse decoder; CLR clears it;
 * TX SEND sends what you've keyed at once and hands the frequency over.
 */
export default function TelegraphDesk({ isRefCardOpen, onRefToggle }: TelegraphDeskProps) {
  // DIT / DAH feed the shared decoder; CLR wipes its buffer
  const { handleTap, clearButton, sendOver } = useMorseDecoder()
  const { isPowerOn } = useRadio()
  const { nudge } = usePowerHint()

  // these all need power; before the first power-on they bring up the Quick Start guide
  const onTap = useCallback(
    (type: MorseTap) => {
      if (!isPowerOn) nudge()
      handleTap(type)
    },
    [isPowerOn, nudge, handleTap],
  )
  // CLR: wipes your unsent draft first; pressed again (or with no draft), the screen
  const onClear = useCallback(() => {
    if (!isPowerOn) nudge()
    clearButton()
  }, [isPowerOn, nudge, clearButton])
  // TX SEND: send what you've keyed now and hand the frequency over
  const onSend = useCallback(() => {
    if (!isPowerOn) nudge()
    sendOver()
  }, [isPowerOn, nudge, sendOver])

  return (
    <section className="desk" aria-label="Telegraph Desk">
      <div className="desk__col desk__col--utils">
        <UtilityButton label="REF" onPress={onRefToggle} latched={isRefCardOpen} />
        <UtilityButton label="CLR" onPress={onClear} />
      </div>

      <div className="desk__col desk__col--keyer">
        <Keyer onTap={onTap} />
      </div>

      <div className="desk__col desk__col--tx">
        <ArmGuard />
        <TxButton onPress={onSend} />
      </div>
    </section>
  )
}
