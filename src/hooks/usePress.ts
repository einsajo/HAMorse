import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

interface UsePressOptions {
  /** fired the instant the control is pushed down (physical switches act on press) */
  onPress?: () => void
  /** fired once when the control comes back up (e.g. a tactile switch's release click) */
  onRelease?: () => void
}

/**
 * Tracks a physical press via pointer events (more reliable than CSS :active on
 * mobile). Pointer capture keeps the control held even if the finger slides off,
 * and each control tracks its own state, so both paddles can be squeezed at once.
 */
export function usePress({ onPress, onRelease }: UsePressOptions = {}) {
  const [pressed, setPressed] = useState(false)
  // pointerup, pointercancel and lostpointercapture can all arrive for one press:
  // only the first one releases (and clicks)
  const downRef = useRef(false)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return // primary button / touch / pen only
      e.currentTarget.setPointerCapture?.(e.pointerId)
      downRef.current = true
      setPressed(true)
      onPress?.()
    },
    [onPress],
  )

  const release = useCallback(() => {
    if (!downRef.current) return
    downRef.current = false
    setPressed(false)
    onRelease?.()
  }, [onRelease])

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
