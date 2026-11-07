import { useCallback, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

interface UsePressOptions {
  /** fired the instant the control is pushed down (physical switches act on press) */
  onPress?: () => void
}

/**
 * Tracks a physical press via pointer events (more reliable than CSS :active on
 * mobile). Pointer capture keeps the control held even if the finger slides off,
 * and each control tracks its own state, so both paddles can be squeezed at once.
 */
export function usePress({ onPress }: UsePressOptions = {}) {
  const [pressed, setPressed] = useState(false)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return // primary button / touch / pen only
      e.currentTarget.setPointerCapture?.(e.pointerId)
      setPressed(true)
      onPress?.()
    },
    [onPress],
  )

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
