import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/** Translucent grime: tints the glass but keeps the LCD text legible */
const GRIME_COLOR = 'rgba(40, 35, 30, 0.35)'
/** Wipe stroke, in CSS pixels */
const WIPE_WIDTH = 45
const WIPE_SOFTNESS = 14

interface Point {
  x: number
  y: number
}

/** Paints the grime layer: a translucent film, a few smudges, and fine dust specks. */
function paintGrime(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, w, h)

  // Base film
  ctx.fillStyle = GRIME_COLOR
  ctx.fillRect(0, 0, w, h)

  // Uneven smudges: grime builds up more in some areas
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const r = (0.25 + Math.random() * 0.35) * Math.max(w, h)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(40, 35, 30, 0.08)')
    g.addColorStop(1, 'rgba(40, 35, 30, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

  // Grime collects in the corners and along the gasket
  const edge = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.65)
  edge.addColorStop(0, 'rgba(40, 35, 30, 0)')
  edge.addColorStop(1, 'rgba(40, 35, 30, 0.12)')
  ctx.fillStyle = edge
  ctx.fillRect(0, 0, w, h)

  // Tiny low-opacity dust specks: pale fluff and dark grit
  const specks = Math.round((w * h) / 90)
  for (let i = 0; i < specks; i++) {
    const pale = Math.random() < 0.6
    const a = 0.04 + Math.random() * (pale ? 0.16 : 0.12)
    ctx.fillStyle = pale ? `rgba(225, 210, 185, ${a})` : `rgba(20, 16, 12, ${a})`
    ctx.beginPath()
    ctx.arc(Math.random() * w, Math.random() * h, 0.3 + Math.random() * Math.random() * 1.1, 0, Math.PI * 2)
    ctx.fill()
  }

  // A few longer lint fibres
  ctx.lineCap = 'round'
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const len = 4 + Math.random() * 10
    const ang = Math.random() * Math.PI
    ctx.strokeStyle = `rgba(225, 210, 185, ${0.06 + Math.random() * 0.08})`
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(
      x + Math.cos(ang) * len * 0.5 + (Math.random() - 0.5) * 4,
      y + Math.sin(ang) * len * 0.5 + (Math.random() - 0.5) * 4,
      x + Math.cos(ang) * len,
      y + Math.sin(ang) * len,
    )
    ctx.stroke()
  }

  ctx.restore()
}

/**
 * Wipeable grime on the LCD glass.
 * Swiping erases the grime with soft-edged strokes using 'destination-out'.
 */
export default function DustCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const dprRef = useRef(1)
  const lastRef = useRef<Point | null>(null)
  const pointerRef = useRef<number | null>(null)

  // Size the backing store to the element (DPR-aware) and repaint the grime
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctxRef.current = ctx

    let lastW = 0
    let lastH = 0
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect()
      if (width === 0 || height === 0) return
      if (Math.round(width) === lastW && Math.round(height) === lastH) return
      lastW = Math.round(width)
      lastH = Math.round(height)
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      dprRef.current = dpr
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // draw in CSS pixels
      paintGrime(ctx, width, height)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  const toLocal = (e: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const wipe = useCallback((from: Point, to: Point) => {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0, 0, 0, 1)'
    ctx.lineWidth = WIPE_WIDTH
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    // shadowBlur ignores the transform, so scale it to device pixels; the
    // shadow is composited with destination-out too, which feathers the edges
    ctx.shadowColor = 'rgba(0, 0, 0, 1)'
    ctx.shadowBlur = WIPE_SOFTNESS * dprRef.current
    ctx.beginPath()
    if (from.x === to.x && from.y === to.y) {
      // single tap: soft round dab (zero-length strokes aren't drawn reliably)
      ctx.fillStyle = 'rgba(0, 0, 0, 1)'
      ctx.arc(to.x, to.y, WIPE_WIDTH / 2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
    }
    ctx.restore()
  }, [])

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current !== null) return // one wiping finger at a time
    pointerRef.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toLocal(e)
    lastRef.current = p
    wipe(p, p) // a zero-length round stroke wipes a soft dot
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== pointerRef.current || !lastRef.current) return
    const p = toLocal(e)
    wipe(lastRef.current, p)
    lastRef.current = p
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== pointerRef.current) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    pointerRef.current = null
    lastRef.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      className="lcd__dust"
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  )
}
