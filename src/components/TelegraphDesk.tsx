import './TelegraphDesk.css'

interface PaddleProps {
  kind: 'dit' | 'dah'
}

/** One tarnished-aluminium lever. Static for now; press state is wired up later. */
function Paddle({ kind }: PaddleProps) {
  return (
    <div className={`paddle paddle--${kind}`} aria-label={kind.toUpperCase()} role="img">
      <div className="paddle__lever">
        <span className="paddle__pad" aria-hidden="true" />
      </div>
    </div>
  )
}

/**
 * Telegraph Desk: iambic paddle key (static hardware only).
 * Side columns are reserved for the REF/CLR buttons (left) and TX (right).
 */
export default function TelegraphDesk() {
  return (
    <section className="desk" aria-label="Telegraph Desk">
      <div className="desk__slot desk__slot--left" aria-hidden="true" />

      <div className="key">
        {/* tension springs + thumb screws on the outside of each paddle */}
        <span className="key__spring key__spring--left" aria-hidden="true" />
        <span className="key__spring key__spring--right" aria-hidden="true" />

        {/* recessed hinge block the paddles pivot from */}
        <div className="key__base" aria-hidden="true">
          <div className="key__channel">
            <span className="key__knuckle key__knuckle--left" />
            <span className="key__knuckle key__knuckle--right" />
            <span className="key__pin" />
          </div>
        </div>

        <span className="key__thumbscrew key__thumbscrew--left" aria-hidden="true" />
        <span className="key__thumbscrew key__thumbscrew--right" aria-hidden="true" />

        <div className="key__paddles">
          <Paddle kind="dit" />
          <Paddle kind="dah" />
        </div>

        <div className="key__labels" aria-hidden="true">
          <span>DIT</span>
          <span>DAH</span>
        </div>
      </div>

      <div className="desk__slot desk__slot--right" aria-hidden="true" />
    </section>
  )
}
