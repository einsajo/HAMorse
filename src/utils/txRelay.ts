/**
 * The air, client side (server/tx-relay.mjs): with TX GBL flipped, the radio
 * joins the room for the frequency you're on. Your overs are heard by every
 * other device tuned there, and theirs are keyed out loud like any station.
 *
 * No accounts and no history: the connection is the whole thing. Retuning
 * re-joins; the connection re-opens itself with a short backoff if it drops.
 */

export interface TxRelay {
  /** join / move to this frequency's room (MHz, two decimals) */
  setFrequency(mhz: number): void
  /** broadcast an over to everyone else in the room */
  send(text: string): void
  close(): void
}

/** The configured relay (VITE_RELAY_URL), or null: the air stays silent */
export function txRelayUrl(): string | null {
  // a host page may point the air elsewhere (the preview harness does; production never sets it)
  const override = (globalThis as { __RELAY_URL?: unknown }).__RELAY_URL
  if (typeof override === 'string' && override) return override
  const env = import.meta.env ?? {}
  const url = env.VITE_RELAY_URL
  return typeof url === 'string' && url ? url : null
}

export function createTxRelay(url: string, onMessage: (text: string) => void): TxRelay {
  let ws: WebSocket | null = null
  let freq: number | null = null
  let closed = false
  let retry: ReturnType<typeof setTimeout> | null = null
  let backoff = 1000

  const join = () => {
    if (ws?.readyState === WebSocket.OPEN && freq !== null) ws.send(JSON.stringify({ t: 'join', f: freq.toFixed(2) }))
  }

  const connect = () => {
    if (closed || freq === null) return
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
    try {
      ws = new WebSocket(url)
    } catch {
      ws = null
      return schedule()
    }
    ws.onopen = () => {
      backoff = 1000
      join()
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as { t?: unknown; m?: unknown }
        if (msg.t === 'tx' && typeof msg.m === 'string' && msg.m) onMessage(msg.m)
      } catch {
        /* not for us */
      }
    }
    const lost = () => {
      ws = null
      schedule()
    }
    ws.onclose = lost
    ws.onerror = lost
  }

  const schedule = () => {
    if (closed || retry !== null) return
    retry = setTimeout(() => {
      retry = null
      backoff = Math.min(5000, backoff * 1.6)
      connect()
    }, backoff)
  }

  return {
    setFrequency(mhz) {
      freq = mhz
      if (ws?.readyState === WebSocket.OPEN) join()
      else connect()
    },
    send(text) {
      if (ws?.readyState === WebSocket.OPEN && freq !== null) ws.send(JSON.stringify({ t: 'tx', f: freq.toFixed(2), m: text }))
    },
    close() {
      closed = true
      if (retry !== null) clearTimeout(retry)
      retry = null
      const w = ws
      ws = null
      try {
        w?.close()
      } catch {
        /* already gone */
      }
    },
  }
}
