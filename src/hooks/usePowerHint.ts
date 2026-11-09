import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useRadio } from '../context/RadioContext'

/** How long the breaker glows after a nudge once the guide has been dismissed */
const ATTENTION_MS = 2400

export interface PowerHintState {
  /** The Quick Start guide is showing */
  isOpen: boolean
  /** The MAIN POWER breaker should glow to draw the eye */
  attention: boolean
  /**
   * A power-dependent control was used. Before the radio has ever been
   * switched on, this opens the Quick Start guide (or, once it has been
   * dismissed, just makes the breaker glow). After the first power-on it does
   * nothing: the user already knows where the power is.
   */
  nudge: () => void
  /** Close the guide; later nudges only make the breaker glow */
  dismiss: () => void
}

const PowerHintContext = createContext<PowerHintState | null>(null)

/** Must sit inside <RadioProvider>. */
export function PowerHintProvider({ children }: { children?: ReactNode }) {
  const { isPowerOn } = useRadio()
  const [isOpen, setIsOpen] = useState(false)
  const [glowing, setGlowing] = useState(false)

  const poweredOnce = useRef(isPowerOn)
  const dismissed = useRef(false)
  const glowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const glow = useCallback(() => {
    setGlowing(true)
    if (glowTimer.current !== null) clearTimeout(glowTimer.current)
    glowTimer.current = setTimeout(() => {
      glowTimer.current = null
      setGlowing(false)
    }, ATTENTION_MS)
  }, [])

  // the first power-on retires the guide for good
  useEffect(() => {
    if (!isPowerOn) return
    poweredOnce.current = true
    setIsOpen(false)
    setGlowing(false)
    if (glowTimer.current !== null) clearTimeout(glowTimer.current)
    glowTimer.current = null
  }, [isPowerOn])

  useEffect(
    () => () => {
      if (glowTimer.current !== null) clearTimeout(glowTimer.current)
    },
    [],
  )

  const nudge = useCallback(() => {
    if (poweredOnce.current) return
    if (dismissed.current) glow()
    else setIsOpen(true)
  }, [glow])

  const dismiss = useCallback(() => {
    dismissed.current = true
    setIsOpen(false)
    glow() // one last pointer at the breaker
  }, [glow])

  const value = useMemo<PowerHintState>(
    () => ({ isOpen, attention: isOpen || glowing, nudge, dismiss }),
    [isOpen, glowing, nudge, dismiss],
  )
  return createElement(PowerHintContext.Provider, { value }, children)
}

/** Read / drive the power-on hint. Must be used inside <PowerHintProvider>. */
export function usePowerHint(): PowerHintState {
  const ctx = useContext(PowerHintContext)
  if (!ctx) throw new Error('usePowerHint() must be used inside <PowerHintProvider>')
  return ctx
}
