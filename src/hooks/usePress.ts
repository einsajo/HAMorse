import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

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
 * Keyboard too: the control is focusable, and Enter / Space press it down and
 * let it up (held keys don't auto-repeat into extra presses).
 */
const isPressKey = (e: ReactKeyboardEvent) => e.key === 'Enter' || e.key === ' '

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

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      if (!isPressKey(e)) return
      e.preventDefault() // Space must not scroll the page
      if (e.repeat || downRef.current) return
      downRef.current = true
      setPressed(true)
      onPress?.()
    },
    [onPress],
  )

  const onKeyUp = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      if (isPressKey(e)) release()
    },
    [release],
  )

  return {
    pressed,
    handlers: {
      tabIndex: 0,
      onPointerDown,
      onPointerUp: release,
      onPointerCancel: release,
      onLostPointerCapture: release,
      onKeyDown,
      onKeyUp,
      onBlur: release,
    },
  }
}
