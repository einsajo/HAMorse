import type { CSSProperties, ReactNode } from 'react'
import './MetalPlate.css'

interface MetalPlateProps {
  /** stamped text content */
  children: ReactNode
  /** accessible text for the whole plate */
  label: string
  className?: string
}

/* Random-looking slot angles, so the four screws aren't identically aligned */
const SCREWS = [
  { pos: 'tl', angle: 12 },
  { pos: 'tr', angle: 57 },
  { pos: 'bl', angle: -33 },
  { pos: 'br', angle: 78 },
] as const

/**
 * Stamped aluminium plate screwed to the chassis with four Phillips-head screws.
 * Purely decorative: pointer-events are disabled so it never captures touches.
 */
export default function MetalPlate({ children, label, className = '' }: MetalPlateProps) {
  return (
    <div className={`plate ${className}`.trim()} role="img" aria-label={label}>
      {SCREWS.map(({ pos, angle }) => (
        <span
          key={pos}
          className={`plate__screw plate__screw--${pos}`}
          style={{ '--screw-angle': `${angle}deg` } as CSSProperties}
          aria-hidden="true"
        />
      ))}
      <div className="plate__stamp" aria-hidden="true">
        {children}
      </div>
    </div>
  )
}
