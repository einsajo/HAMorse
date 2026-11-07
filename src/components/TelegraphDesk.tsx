import './TelegraphDesk.css'
import { usePress } from '../hooks/usePress'

/* --- Iambic squeeze keyer ------------------------------------------------ */

interface LeverProps {
  side: 'dit' | 'dah'
}

/** One horizontal lever: flat aluminium arm + bakelite thumb-piece. Presses DOWN into the desk. */
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

/** Small tactile push switch (REF / CLR) */
function UtilityButton({ label, onPress, latched }: UtilityButtonProps) {
  const { pressed, handlers } = usePress({ onPress })
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
function TxButton() {
  const { pressed, handlers } = usePress()
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
 * REF toggles the reference card; other press states are visual only for now.
 */
export default function TelegraphDesk({ isRefCardOpen, onRefToggle }: TelegraphDeskProps) {
  return (
    <section className="desk" aria-label="Telegraph Desk">
      <div className="desk__col desk__col--utils">
        <UtilityButton label="REF" onPress={onRefToggle} latched={isRefCardOpen} />
        <UtilityButton label="CLR" />
      </div>

      <div className="desk__col desk__col--keyer">
        <Keyer />
      </div>

      <div className="desk__col desk__col--tx">
        <ArmGuard />
        <TxButton />
      </div>
    </section>
  )
}
