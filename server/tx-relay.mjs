#!/usr/bin/env node
/**
 * The air: a tiny WebSocket relay so people tuned to the same frequency can
 * really talk to each other (the TX ARM switch's real purpose).
 *
 * Rooms are named by frequency ("106.30"). A client sends
 *   {"t":"join","f":"106.30"}   (retuning re-joins)
 *   {"t":"tx","f":"106.30","m":"CQ CQ DE JOE"}
 * and everyone else in the room gets {"t":"tx","f","m","at"}. Messages are
 * sanitized server-side to what a keyer can send (A-Z 0-9 . , ? /, 64
 * characters), one transmission per 2.5 s per connection. Nothing is stored,
 * nobody has an account, and there is no history: like the air, it only
 * exists while someone is sending it.
 *
 * Standalone:  node server/tx-relay.mjs   (port 8788, PORT to change)
 * then run the app with VITE_RELAY_URL=ws://localhost:8788/air
 * No dependencies: the WebSocket framing is implemented here directly
 * (RFC 6455, text messages only), so `npm ci` is not needed for the relay.
 */
import http from 'node:http'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
export const MAX_MESSAGE_CHARS = 64
const MAX_WORD_CHARS = 200
const MAX_ROOM = 50
const MAX_SOCKETS = 1000
const TX_COOLDOWN_MS = 2500
const KEYABLE = /[^A-Z0-9 .,?/]/g

/** What a keyer could have sent: upper case, keyable characters only, single spaces, capped */
export function sanitize(text) {
  return String(text ?? '')
    .toUpperCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(KEYABLE, '')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_CHARS)
}

/* --- Minimal WebSocket framing (text only) -------------------------------------- */

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64')
}

/** Parse whatever whole frames are in `buf`; returns [frames, rest] */
function parseFrames(buf) {
  const frames = []
  let off = 0
  for (;;) {
    if (buf.length - off < 2) break
    const b0 = buf[off]
    const b1 = buf[off + 1]
    const fin = (b0 & 0x80) !== 0
    const opcode = b0 & 0x0f
    const masked = (b1 & 0x80) !== 0
    let len = b1 & 0x7f
    let head = 2
    if (len === 126) {
      if (buf.length - off < 4) break
      len = buf.readUInt16BE(off + 2)
      head = 4
    } else if (len === 127) {
      if (buf.length - off < 10) break
      const big = buf.readBigUInt64BE(off + 2)
      if (big > 65536n) throw new Error('frame too large')
      len = Number(big)
      head = 10
    }
    const maskLen = masked ? 4 : 0
    if (buf.length - off < head + maskLen + len) break
    let payload = buf.subarray(off + head + maskLen, off + head + maskLen + len)
    if (masked) {
      const mask = buf.subarray(off + head, off + head + 4)
      const un = Buffer.allocUnsafe(len)
      for (let i = 0; i < len; i++) un[i] = payload[i] ^ mask[i & 3]
      payload = un
    }
    frames.push({ fin, opcode, payload })
    off += head + maskLen + len
  }
  return [frames, buf.subarray(off)]
}

function frame(opcode, payload) {
  const len = payload.length
  let head
  if (len < 126) {
    head = Buffer.from([0x80 | opcode, len])
  } else if (len < 65536) {
    head = Buffer.allocUnsafe(4)
    head[0] = 0x80 | opcode
    head[1] = 126
    head.writeUInt16BE(len, 2)
  } else {
    head = Buffer.allocUnsafe(10)
    head[0] = 0x80 | opcode
    head[1] = 127
    head.writeBigUInt64BE(BigInt(len), 2)
  }
  return Buffer.concat([head, payload])
}

/** The relay. Rooms by frequency; {t:'tx'} is sanitized and forwarded to everyone else in the room. */
export function createRelay({ onFull } = {}) {
  const rooms = new Map() // freq -> Set<client>
  const sockets = new Set()

  const leave = (client) => {
    if (!client.room) return
    const room = rooms.get(client.room)
    if (room) {
      room.delete(client)
      if (!room.size) rooms.delete(client.room)
    }
    client.room = null
  }

  const handleMessage = (client, text) => {
    if (text.length > MAX_WORD_CHARS) return
    let msg
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }
    const freq = typeof msg.f === 'string' ? msg.f.slice(0, 12) : null
    if (msg.t === 'join') {
      if (!freq || !/^\d{2,3}\.\d{1,2}$/.test(freq)) return
      if (client.room === freq) return
      const room = rooms.get(freq) ?? new Set()
      if (!rooms.has(freq) && room.size >= MAX_ROOM) return
      leave(client)
      room.add(client)
      rooms.set(freq, room)
      client.room = freq
      return
    }
    if (msg.t === 'tx') {
      if (!client.room || msg.f !== client.room) return
      const now = Date.now()
      if (now - client.lastTx < TX_COOLDOWN_MS) return
      const m = sanitize(msg.m)
      if (!m) return
      client.lastTx = now
      const out = frame(0x1, Buffer.from(JSON.stringify({ t: 'tx', f: client.room, m, at: now })))
      for (const other of rooms.get(client.room) ?? []) {
        if (other !== client && !other.sock.destroyed) other.sock.write(out)
      }
    }
  }

  const server = http.createServer((req, res) => {
    if (req.url === '/health') return res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok')
    res.writeHead(426, { 'Content-Type': 'text/plain' }).end('upgrade required')
  })

  server.on('upgrade', (req, sock) => {
    if (!req.url?.startsWith('/air') || String(req.headers.upgrade).toLowerCase() !== 'websocket' || !req.headers['sec-websocket-key']) {
      return sock.destroy()
    }
    if (sockets.size >= MAX_SOCKETS) {
      onFull?.()
      return sock.destroy()
    }
    sock.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${acceptKey(req.headers['sec-websocket-key'])}\r\n\r\n`,
    )
    const client = { sock, buf: Buffer.alloc(0), room: null, lastTx: 0, fragments: [] }
    sockets.add(client)

    const close = () => {
      if (!sockets.has(client)) return
      sockets.delete(client)
      leave(client)
      sock.destroy()
    }
    sock.on('data', (chunk) => {
      let frames
      try {
        ;[frames, client.buf] = parseFrames(Buffer.concat([client.buf, chunk]))
      } catch {
        return close()
      }
      for (const f of frames) {
        if (f.opcode === 0x8) return close()
        if (f.opcode === 0x9) {
          sock.write(frame(0xA, f.payload))
          continue
        }
        if (f.opcode === 0x0 && client.fragments.length) {
          client.fragments.push(f.payload)
          if (f.fin) {
            const whole = Buffer.concat(client.fragments)
            client.fragments = []
            if (whole.length <= MAX_WORD_CHARS) handleMessage(client, whole.toString('utf8'))
          }
          continue
        }
        if (f.opcode !== 0x1) continue
        if (!f.fin) {
          client.fragments = [f.payload]
          continue
        }
        handleMessage(client, f.payload.toString('utf8'))
      }
    })
    sock.on('error', close)
    sock.on('close', close)
  })

  return {
    server,
    rooms,
    listen: (port = 0) => new Promise((r) => server.listen(port, '0.0.0.0', () => r(server.address().port))),
    close: () => {
      for (const c of sockets) c.sock.destroy()
      server.close()
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || process.env.RELAY_PORT || 8788)
  const relay = createRelay()
  relay.listen(port).then((p) => console.log(`the air is open on ws://0.0.0.0:${p}/air`))
}
