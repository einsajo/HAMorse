import './TelegraphDesk.css'
import { usePress } from '../hooks/usePress'

/* --- Iambic squeeze keyer ------------------------------------------------ */

interface LeverProps {
  side: 'dit' | 'dah'
}

/** One horizontal brass lever with a circular finger pad at its tip. */
function Lever({ side }: LeverProps) {
  const { pressed, handlers } = usePress()
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
      <span className="lever__contact" aria-hidden="true" />
      <span className="lever__pad" aria-hidden="true" />
    </div>
  )
}

function Keyer() {
  return (
    <div className="keyer">
      <div className="keyer__plate" aria-hidden="true">
        <span className="keyer__screw keyer__screw--tl" />
        <span className="keyer__screw keyer__screw--tr" />
        <span className="keyer__screw keyer__screw--bl" />
        <span className="keyer__screw keyer__screw--br" />
      </div>

      <Lever side="dit" />
      <Lever side="dah" />

      {/* rear pivot blocks (fixed; the levers slide under them) */}
      <span className="keyer__pivot keyer__pivot--dit" aria-hidden="true" />
      <span className="keyer__pivot keyer__pivot--dah" aria-hidden="true" />

      {/* central contact post the levers strike */}
      <span className="keyer__post" aria-hidden="true">
        <span className="keyer__post-contact keyer__post-contact--dit" />
        <span className="keyer__post-contact keyer__post-contact--dah" />
      </span>

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
}

/** Small tactile push switch (REF / CLR) */
function UtilityButton({ label }: UtilityButtonProps) {
  const { pressed, handlers } = usePress()
  return (
    <div className="utility">
      <div className="utility__housing">
        <div
          className="utility__cap"
          data-pressed={pressed}
          role="button"
          aria-label={label}
          aria-pressed={pressed}
          {...handlers}
        />
      </div>
      <span className="utility__label silk" aria-hidden="true">
        {label}
      </span>
    </div>
  )
}

/** Large transmit button: dark mechanical housing with an inset dark-red glass lens */
function TxButton() {
  const { pressed, handlers } = usePress()
  return (
    <div className="tx">
      <span className="tx__label silk" aria-hidden="true">
        TX
      </span>
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
      <span className="tx__label silk" aria-hidden="true">
        SEND
      </span>
    </div>
  )
}

/**
 * Telegraph Desk: REF/CLR utility switches | horizontal iambic squeeze keyer | TX SEND.
 * Press states are visual only; audio / buffer logic is wired up later.
 */
export default function TelegraphDesk() {
  return (
    <section className="desk" aria-label="Telegraph Desk">
      <div className="desk__col desk__col--utils">
        <UtilityButton label="REF" />
        <UtilityButton label="CLR" />
      </div>

      <div className="desk__col desk__col--keyer">
        <Keyer />
      </div>

      <div className="desk__col desk__col--tx">
        <TxButton />
      </div>
    </section>
  )
}
