import assert from 'node:assert/strict'
const { createRelay, sanitize, MAX_MESSAGE_CHARS } = await import('../server/tx-relay.mjs')

let n = 0
const t = async (name, fn) => { await fn(); n++; console.log('ok', name) }
const waitFor = (fn, ms = 3000) => new Promise((resolve, reject) => {
  const t0 = Date.now()
  const poll = () => {
    try {
      const v = fn()
      if (v) return resolve(v)
    } catch { /* keep waiting */ }
    if (Date.now() - t0 > ms) return reject(new Error('timed out'))
    setTimeout(poll, 20)
  }
  poll()
})
const client = (port) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/air`)
  const inbox = []
  ws.onmessage = (ev) => inbox.push(JSON.parse(String(ev.data)))
  return {
    ws,
    inbox,
    join: (f) => ws.send(JSON.stringify({ t: 'join', f })),
    tx: (f, m) => ws.send(JSON.stringify({ t: 'tx', f, m })),
    open: () => waitFor(() => ws.readyState === WebSocket.OPEN && ws),
  }
}

await t('sanitize: what a keyer could have sent', () => {
  assert.equal(sanitize('cq cq de joe!! <3'), 'CQ CQ DE JOE 3')
  assert.equal(sanitize('a  b\tc\nd'), 'A B C D')
  assert.equal(sanitize('x'.repeat(300)).length, MAX_MESSAGE_CHARS)
  assert.equal(sanitize('😀'), '')
})

const relay = createRelay()
const port = await relay.listen(0)

await t('two devices on one frequency: an over is heard by the other, not echoed to the sender', async () => {
  const a = client(port)
  const b = client(port)
  await a.open(); await b.open()
  a.join('106.30'); b.join('106.30')
  await waitFor(() => (relay.rooms.get('106.30')?.size ?? 0) === 2)
  a.tx('106.30', 'cq cq de joe k')
  const got = await waitFor(() => b.inbox.find((m) => m.t === 'tx'))
  assert.equal(got.f, '106.30')
  assert.equal(got.m, 'CQ CQ DE JOE K')
  assert.ok(typeof got.at === 'number')
  await new Promise((r) => setTimeout(r, 120))
  assert.equal(a.inbox.filter((m) => m.t === 'tx').length, 0, 'no echo to the sender')
  a.ws.close(); b.ws.close()
})

await t('another frequency hears nothing; retuning moves the room', async () => {
  const a = client(port)
  const b = client(port)
  await a.open(); await b.open()
  a.join('106.30'); b.join('103.10')
  await waitFor(() => relay.rooms.has('103.10'))
  a.tx('106.30', 'HELLO')
  await new Promise((r) => setTimeout(r, 150))
  assert.equal(b.inbox.length, 0)
  b.join('106.30') // retune onto it
  await waitFor(() => (relay.rooms.get('106.30')?.size ?? 0) === 2)
  await new Promise((r) => setTimeout(r, 2400)) // the sender's cooldown has passed
  a.tx('106.30', 'QRZ?')
  await waitFor(() => b.inbox.find((m) => m.m === 'QRZ?'))
  a.ws.close(); b.ws.close()
})

await t('one transmission per 2.5 s per connection; junk is ignored', async () => {
  const a = client(port)
  const b = client(port)
  await a.open(); await b.open()
  a.join('106.30'); b.join('106.30')
  await waitFor(() => (relay.rooms.get('106.30')?.size ?? 0) === 2)
  a.ws.send('not json at all') // ignored, the connection survives
  a.tx('106.30', 'FIRST')
  a.tx('106.30', 'SECOND') // inside the cooldown: dropped
  await waitFor(() => b.inbox.find((m) => m.m === 'FIRST'))
  await new Promise((r) => setTimeout(r, 250))
  assert.equal(b.inbox.filter((m) => m.m === 'SECOND').length, 0)
  await new Promise((r) => setTimeout(r, 2300))
  a.tx('106.30', 'THIRD')
  await waitFor(() => b.inbox.find((m) => m.m === 'THIRD'))
  a.ws.close(); b.ws.close()
})

await t('a tx for another room, or without joining, goes nowhere', async () => {
  const a = client(port)
  const b = client(port)
  await a.open(); await b.open()
  b.join('106.30')
  await waitFor(() => (relay.rooms.get('106.30')?.size ?? 0) === 1)
  a.tx('106.30', 'NOT JOINED')
  a.join('102.40')
  a.tx('106.30', 'WRONG ROOM')
  await new Promise((r) => setTimeout(r, 200))
  assert.equal(b.inbox.length, 0)
  a.ws.close(); b.ws.close()
})

relay.close()
console.log(`\n${n} relay tests passed`)
