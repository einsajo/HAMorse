import assert from 'node:assert/strict'
import * as C from './.out/constants.mjs'
import * as A from './.out/utils/agentEngine.mjs'
import { CHAR_TO_MORSE } from './.out/utils/morseDictionary.mjs'
let n = 0
const t = async (name, fn) => { await fn(); n++; console.log('ok', name) }
const collect = async (it) => { const out = []; for await (const e of it) out.push(e); return out }
const textOf = (evs) => evs.filter((e) => e.type === 'text').map((e) => e.text).join('')
const local = (persona) => A.createAgentSession(persona, persona.localBrain({ rng: () => 0, tempo: 0 }))
const keyable = (txt) => { for (const ch of txt) if (ch !== ' ') assert.ok(CHAR_TO_MORSE[ch], `no code for ${ch} in ${txt}`) }

await t('wandering ghost: legal spots clear of every station AND agent; reseeding moves it; detents follow', () => {
  for (const f of C.GHOST_SPOTS) {
    for (const s of C.OCCUPIED_FREQUENCIES) assert.ok(Math.abs(f - s) >= 0.5 - 1e-9)
    assert.ok(Math.abs(f - C.DIAL_START_MHZ) >= 1 - 1e-9)
  }
  assert.ok(C.OCCUPIED_FREQUENCIES.includes(90.2) && C.OCCUPIED_FREQUENCIES.includes(102.75))
  const seen = new Set(); for (let i = 0; i < 50; i++) seen.add(C.reseedGhostFrequency())
  assert.ok(seen.size > 20)
  const g = C.reseedGhostFrequency(() => 0)
  assert.equal(C.getGhostFrequency(), g)
  assert.equal(C.getBandInfo(g).band, 'ghost')
  assert.ok(C.getDetents().some((d) => d.frequency === g))
  const g2 = C.reseedGhostFrequency(() => 0.999)
  assert.notEqual(g2, g); assert.ok(!C.getDetents().some((d) => d.frequency === g)); assert.ok(C.getDetents().some((d) => d.frequency === g2))
  const d = [...C.getDetents()].sort((a, b) => a.frequency - b.frequency)
  for (let i = 1; i < d.length; i++) assert.ok(d[i].frequency - d[i - 1].frequency > d[i].captureMhz + d[i - 1].captureMhz, `overlap ${d[i].frequency}`)
})
await t('agent stations: two-way, on their own frequencies', () => {
  for (const [id, f] of Object.entries(C.AGENT_STATIONS)) { assert.equal(C.agentStationAt(f), id); assert.deepEqual(C.getBandInfo(f), { band: 'ham', canTransmit: true }) }
  assert.equal(C.getBandInfo(90.25).band, 'dead')
})
await t('a fresh cast every boot: random ragchewer identity, random ghost archetype', () => {
  const casts = Array.from({ length: 40 }, () => A.createCast())
  assert.ok(new Set(casts.map((c) => c.ghost.identity.archetype)).size >= 4, 'archetypes vary')
  assert.ok(new Set(casts.map((c) => JSON.stringify(c.stranger.identity))).size >= 30, 'identities vary')
  const c = A.createCast({ rng: () => 0.5 })
  for (const k of ['name', 'age', 'gender', 'location', 'quirk']) assert.ok(c.stranger.identity[k], k)
  assert.match(c.stranger.systemPrompt, /randomly select an age, gender, location, and quirk/)
  assert.match(c.stranger.systemPrompt, new RegExp(`you are ${c.stranger.identity.name}`))
  assert.ok(A.GHOST_ARCHETYPES.some((a) => c.ghost.systemPrompt.includes(a.name)))
  assert.match(c.ghost.systemPrompt, /never quote films or books verbatim/)
})
await t('the Guide weaves in the REAL tutor frequencies (from the constants)', async () => {
  const g = A.createCast({ rng: () => 0 }).guide
  assert.match(g.systemPrompt, /100\.30 for Elmer/); assert.match(g.systemPrompt, /103\.10 for the speed drill/)
  assert.ok(!g.systemPrompt.includes('100.60') && !g.systemPrompt.includes('101.80'))
  const s = local(g)
  assert.equal(textOf(await collect(s.turn('CQ DE JOE K'))).trim(), 'GE OM. DE DOC. UR 579. HW? K')
  const help = textOf(await collect(s.turn('SRI NEW TO CW. HELP?')))
  assert.match(help, /ELMER ON 100\.30/)
  assert.ok(!(await collect(s.turn('73 SK'))).some((e) => e.type === 'climax'))
  assert.equal(g.cq(), 'CQ CQ DE DOC K ')
})
await t('the Stranger chats about itself, the weather and its rig', async () => {
  const p = A.createCast({ rng: () => 0 }).stranger
  const s = local(p)
  assert.match(textOf(await collect(s.turn('GE'))), new RegExp(`NAME ${p.identity.name}. QTH ${p.identity.location}`))
  assert.match(textOf(await collect(s.turn('FB'))), new RegExp(`WX HR ${p.identity.weather}`))
  assert.match(textOf(await collect(s.turn('R'))), new RegExp(`RIG HR ${p.identity.rig}`))
  assert.equal(s.exchange, 3); assert.ok(!s.climaxed)
})
await t('the ghost: casual, then its archetype shows, then it strikes; leaving makes it strike at once', async () => {
  const p = A.createCast({ rng: () => 0 }).ghost // archetype 0: torrance
  assert.equal(p.identity.archetype, 'torrance')
  const s = local(p)
  assert.equal(textOf(await collect(s.turn('CQ DE JOE'))).trim(), 'GE OM. UR 599 HR. FB SIG. NAME? K')
  assert.match(textOf(await collect(s.turn('NAME JOE'))), /HOTEL IS EMPTY/)
  await collect(s.turn('YES'))
  const last = await collect(s.turn('WHO R U'))
  assert.match(textOf(last), /DOOR|KNOCK/); assert.equal(last[last.length - 1].type, 'climax')
  const q = local(A.createCast({ rng: () => 0.3 }).ghost)
  await collect(q.turn('CQ'))
  const r = await collect(q.turn('73 SK'))
  assert.equal(r[r.length - 1].type, 'climax')
})
await t('every local reply is keyable and short (every persona, many boots)', async () => {
  for (let k = 0; k < 25; k++) {
    const cast = A.createCast()
    for (const id of ['guide', 'stranger', 'ghost']) {
      const s = A.createAgentSession(cast[id], cast[id].localBrain({ tempo: 0 }))
      for (const heard of ['CQ', 'NAME IS ANNA', 'HELP?', 'HELLO', 'WX']) {
        const txt = textOf(await collect(s.turn(heard))); assert.ok(txt.length <= A.AGENT_MAX_REPLY_CHARS); keyable(txt)
      }
    }
  }
  keyable(A.LOST_SIGNAL_TEXT); keyable(A.DEAD_BAND_TEXT)
})
// ---- the network: latency is interference
const enc = new TextEncoder()
const streamFetch = (chunks, { delays = [], ok = true } = {}) => async (url, init) => {
  streamFetch.last = JSON.parse(init.body)
  return { ok, status: ok ? 200 : 500, body: new ReadableStream({ async start(c) { for (let i = 0; i < chunks.length; i++) { await new Promise((r) => setTimeout(r, delays[i] ?? 0)); if (init.signal?.aborted) return c.error(new DOMException('aborted', 'AbortError')); c.enqueue(enc.encode(chunks[i])) } c.close() } }) }
}
const hang = () => async (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))
await t('remote route: one route for every persona, NDJSON/SSE streamed; the ghost may strike, the others never', async () => {
  const cast = A.createCast({ rng: () => 0 })
  const ghost = A.createAgentSession(cast.ghost, A.createRemoteBrain('https://agents.example/agent', { fetchImpl: streamFetch(['{"text":"GE "}\n{"te', 'xt":"OM"}\n', 'data: {"climax":true}\n']) }))
  const evs = await collect(ghost.turn('cq de joe'))
  assert.equal(textOf(evs), 'GE OM'); assert.equal(evs[evs.length - 1].type, 'climax')
  assert.equal(streamFetch.last.agent, 'ghost'); assert.equal(streamFetch.last.heard, 'CQ DE JOE'); assert.equal(streamFetch.last.system, cast.ghost.systemPrompt)
  const guide = A.createAgentSession(cast.guide, A.createRemoteBrain('https://agents.example/agent', { fetchImpl: streamFetch(['{"text":"FB"}\n{"climax":true}\n']) }))
  const g = await collect(guide.turn('HI'))
  assert.equal(textOf(g), 'FB'); assert.ok(!g.some((e) => e.type === 'climax')); assert.equal(streamFetch.last.agent, 'guide')
})
await t('slower than 6 s, a stall, a failure, or offline: the signal fades (QSB... LOST SIG / DEAD BAND); the turn does not count', async () => {
  const p = A.createCast().guide
  const run = async (brain) => { const s = A.createAgentSession(p, brain); const evs = await collect(s.turn('CQ')); return { s, evs, txt: textOf(evs) } }
  const t0 = Date.now()
  const slow = await run(A.createRemoteBrain('x', { timeoutMs: 300, fetchImpl: hang() }))
  assert.equal(slow.txt, A.LOST_SIGNAL_TEXT); assert.equal(slow.evs[slow.evs.length - 1].type, 'lost'); assert.equal(slow.s.exchange, 0)
  assert.ok(Date.now() - t0 < 1500, 'the timeout fires')
  const stall = await run(A.createRemoteBrain('x', { timeoutMs: 300, fetchImpl: streamFetch(['{"text":"GE OM"}\n', '{"text":" K"}\n'], { delays: [0, 2000] }) }))
  assert.equal(stall.txt, 'GE OM ' + A.LOST_SIGNAL_TEXT, 'what got through is kept, then it fades'); assert.equal(stall.s.exchange, 0)
  const http500 = await run(A.createRemoteBrain('x', { fetchImpl: streamFetch([], { ok: false }) }))
  assert.equal(http500.txt, A.LOST_SIGNAL_TEXT)
  const cors = await run(A.createRemoteBrain('x', { fetchImpl: async () => { throw new TypeError('Failed to fetch') } }))
  assert.equal(cors.txt, A.LOST_SIGNAL_TEXT)
  const silent = await run(A.createRemoteBrain('x', { fetchImpl: streamFetch([]) }))
  assert.equal(silent.txt, A.LOST_SIGNAL_TEXT)
  let fetched = false
  const offline = await run(A.createRemoteBrain('x', { isOnline: () => false, fetchImpl: async () => { fetched = true } }))
  assert.equal(offline.txt, A.DEAD_BAND_TEXT); assert.ok(!fetched, 'offline: no request at all')
})
await t('the default brain timeout is the 6 s budget', () => { assert.equal(A.AGENT_TIMEOUT_MS, 6000) })
await t('cut off by the radio (retune / power off) is silent, not a fade', async () => {
  const s = A.createAgentSession(A.createCast().guide, A.createRemoteBrain('x', { fetchImpl: hang() }))
  const ac = new AbortController(); setTimeout(() => ac.abort(), 50)
  assert.deepEqual(await collect(s.turn('CQ', ac.signal)), [])
})
await t('selection: registered > window.__agentBrains > route > local; no route = never any network', async () => {
  const p = A.createCast({ rng: () => 0 }).stranger
  assert.match(A.defaultAgentBrain(p).name, /^stranger-local/)
  A.registerAgentBrain('stranger', { name: 'bridge', async *respond() { yield { type: 'text', text: 'BRIDGE' } } })
  assert.equal(A.defaultAgentBrain(p).name, 'bridge'); A.registerAgentBrain('stranger', null)
  globalThis.__agentBrains = { stranger: { name: 'hosted', async *respond() {} } }
  assert.equal(A.defaultAgentBrain(p).name, 'hosted'); delete globalThis.__agentBrains
  globalThis.__ghostBrain = { name: 'legacy', async *respond() {} }
  assert.equal(A.defaultAgentBrain(A.createCast().ghost).name, 'legacy'); delete globalThis.__ghostBrain
  const saved = globalThis.fetch; globalThis.fetch = () => { throw new Error('no network allowed') }
  try { const s = A.createAgentSession(p, A.defaultAgentBrain(p)); assert.ok(textOf(await collect(s.turn('GE'))).length > 5) } finally { globalThis.fetch = saved }
})
await t('the ghost speaks unprompted: reacts to the power, the dial, your silence; each counts; it still strikes by the 4th', async () => {
  const p = A.createCast({ rng: () => 0 }).ghost
  const s = local(p)
  await collect(s.turn('CQ DE JOE NAME JOE K'))
  const power = textOf(await collect(s.turn('', undefined, 'power')))
  assert.ok(A.GHOST_REACTIONS.power.some((l) => power.trim() === l.replace('{YOU}', 'JOE')), power)
  const dial = await collect(s.turn('', undefined, 'dial'))
  assert.ok(A.GHOST_REACTIONS.dial.some((l) => textOf(dial).includes(l.replace('{YOU}', 'JOE').split(' ')[0])))
  assert.ok(!dial.some((e) => e.type === 'climax'))
  const silence = await collect(s.turn('', undefined, 'silence'))
  assert.equal(silence[silence.length - 1].type, 'climax', 'the 4th transmission strikes, even unprompted')
  assert.equal(s.exchange, 4)
  assert.match(s.history[2].text, /^\[THE OPERATOR JUST TRIED TO SWITCH THE RADIO OFF/)
  assert.equal(A.nameFrom(s.history, ''), 'JOE', 'the bracketed events never become a name')
})
await t('every reaction and whisper is keyable, for every archetype', () => {
  for (const lines of Object.values(A.GHOST_REACTIONS)) for (const l of lines) keyable(l.replace('{YOU}', 'OM').replace('{TIME}', '0214'))
  for (let i = 0; i < 30; i++) { const g = A.createCast().ghost; assert.ok(g.whispers.length >= 4); for (const w of g.whispers) keyable(w) }
  assert.match(A.createCast().ghost.systemPrompt, /\[BRACKETS\]/)
})
await t('a live route is told what the operator is doing (event), with no words', async () => {
  let body = null
  const brain = { name: 'spy', async *respond(input) { body = input; yield { type: 'text', text: 'X' } } }
  const s = A.createAgentSession(A.createCast().ghost, brain)
  await collect(s.turn('ignored', undefined, 'silence'))
  assert.equal(body.event, 'silence'); assert.equal(body.heard, '')
  await collect(s.turn('HI'))
  assert.equal(body.event, null); assert.equal(body.heard, 'HI')
})
await t('it knows how late it is where you are', async () => {
  const p = A.createCast({ rng: () => 0 }).ghost
  const s = A.createAgentSession(p, p.localBrain({ rng: () => 4.5 / 7, tempo: 0 })) // the 5th of 7 silence lines: the time
  await collect(s.turn('CQ'))
  const txt = textOf(await collect(s.turn('', undefined, 'silence')))
  const now = new Date(); const hh = String(now.getHours()).padStart(2, '0')
  assert.match(txt, new RegExp(`ITS ${hh}\\d\\d HR`)); keyable(txt)
})
await t('nameFrom: a given name beats a later guess; filler and Q-codes are never a name', async () => {
  const op = (text) => ({ role: 'operator', text })
  assert.equal(A.nameFrom([op('CQ CQ DE NAME JOE K')], 'WHO ARE U'), 'JOE')
  assert.equal(A.nameFrom([], 'TNX FER QSO'), null)
  assert.equal(A.nameFrom([], 'WHO ARE YOU'), null)
  assert.equal(A.nameFrom([], 'PSE LEAVE ME ALONE'), null)
  assert.equal(A.nameFrom([], 'GE OM DE SAM K'), 'SAM')
  assert.equal(A.nameFrom([op('HI')], 'OP MIA'), 'MIA')
})
await t('first contact: land on the ghost, key nothing, and it calls an ordinary CQ (no climax, keyable, counts as a transmission)', async () => {
  const ghost = A.createCast({ rng: () => 0.3 }).ghost
  const s = local(ghost)
  const evs = await collect(s.turn('', undefined, 'arrival'))
  const txt = textOf(evs)
  assert.ok(A.GHOST_REACTIONS.arrival.some((l) => txt.includes(l.split(' ')[0])), txt)
  assert.match(txt, /CQ|QRZ/)
  assert.ok(!evs.some((e) => e.type === 'climax'))
  keyable(txt)
  assert.equal(s.exchange, 1)
  assert.ok(A.HAUNT_EVENT_TEXT.arrival.length > 20)
})
console.log(`\n${n} agent tests passed`)
