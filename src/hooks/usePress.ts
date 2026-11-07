import { useCallback, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * Tracks a physical press via pointer events (more reliable than CSS :active on
 * mobile). Pointer capture keeps the control held even if the finger slides off,
 * and each control tracks its own state, so both paddles can be squeezed at once.
 */
export function usePress() {
  const [pressed, setPressed] = useState(false)

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setPressed(true)
  }, [])

  const release = useCallback(() => setPressed(false), [])

  return {
    pressed,
    handlers: {
      onPointerDown,
      onPointerUp: release,
      onPointerCancel: release,
      onLostPointerCapture: release,
    },
  }
}
