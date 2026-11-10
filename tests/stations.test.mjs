import assert from 'node:assert/strict'
import * as S from './.out/utils/stations.mjs'
import { CHAR_TO_MORSE } from './.out/utils/morseDictionary.mjs'
import { getDetents, hamStationAt, getBandInfo, RESERVED_RX_FREQUENCIES, HAM_STATIONS, AGENT_STATIONS } from './.out/constants.mjs'
const DETENTS = getDetents()

let n = 0
const t = (name, fn) => { fn(); n++; console.log('ok', name) }
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length] }
const w = (word, wpm = null) => ({ word, wpm })

t('timing: standard 20 WPM', () => {
  const x = S.timingForWpm(20)
  assert.deepEqual([x.ditMs, x.dahMs, x.elementGapMs, x.elementGapMs + x.charGapMs, x.elementGapMs + x.charGapMs + x.wordGapMs], [60, 180, 60, 180, 420])
})
t('timing: Farnsworth 18/8 (ARRL)', () => {
  const x = S.timingForWpm(18, 8)
  const ta = (60 * 18 - 37.2 * 8) / (8 * 18) * 1000
  assert.equal(x.ditMs, 67)
  assert.ok(Math.abs(x.elementGapMs + x.charGapMs - 3 * ta / 19) <= 1)
  assert.ok(Math.abs(x.elementGapMs + x.charGapMs + x.wordGapMs - 7 * ta / 19) <= 1)
})
t('every scripted text is keyable', () => {
  const texts = [...S.BULLETIN_TEXTS, ...S.ELMER_WORDS, ...Object.values(S.ELMER_LINES), S.ELMER_ORDER, 'GE OM. DE SAM. TNX FER CALL. WANT SOME SPEED PRACTICE? Y OR N K FB. I SEND 5 LTR GRPS, U SEND THEM BACK. OK OM. TNX FER QSO. 73 SK 1ST LTR IS E. 102.40 103.10 FOR A QSO, OR SPEED.', 'GE. DE ELMER. R U NEW TO CW? K SRI SEND Y OR N HI FB. WE START EASY. E IS 1 DIT. NEXT UR TURN NOT QUITE TRY AGN NO WORRIES LISTEN STILL THERE? 73 ES GL CU SK WB LAST TIME U GOT TO FB OM. TRY BOB ON 101.40 OR SAM 101.80 WORDS WID ME NO PROBLEM JUST 1 THAT KNOW 6 LTRS NOW CAN SOMETIME HALF WAY ALL DONE NUMBERS THEM VY GUD R NICE PERFECT SOLID', 'GE. UR RST 579. NAME BOB. UR NAME? K FB QTH OHIO UR QTH? TNX QSO 73 SK SRI E E CQ DE', 'R UR 12WPM. QRQ 22. GRP NIL. QRS CQ QRQ DE SAM K GE. I SEND 5 LTR GRPS. U SEND THEM BACK. WPM WB AGN QRZ? CLOSE TOP SPEED HI TU FER PRACTICE 73 SK SOLID CPY VY FB NICE FIST', S.TUTOR_REPLIES.afterHi, S.TUTOR_REPLIES.afterSos]
  for (const ch of texts.join(' ')) if (ch !== ' ') assert.ok(CHAR_TO_MORSE[ch], `no code for ${ch}`)
})
t('spokenMorse / normaliseWord / measureWpm', () => {
  assert.equal(S.spokenMorse('A'), 'DIDAH'); assert.equal(S.spokenMorse('S'), 'DIDIDIT'); assert.equal(S.spokenMorse('T'), 'DAH')
  assert.equal(S.normaliseWord('NAME?'), 'NAME'); assert.equal(S.normaliseWord('?'), '?'); assert.equal(S.normaliseWord('JOE.'), 'JOE')
  assert.equal(S.measureWpm(1, 500), null)
  // 5 letters, each 600 ms apart (start to start) = 100 CPM = 20 WPM
  assert.equal(S.measureWpm(5, 600 * 4.6), 20)
})
t('stations sit on their frequencies, with narrow non-overlapping detents', () => {
  const st = S.createStations()
  for (const s of Object.values(st)) { assert.equal(hamStationAt(s.frequency), s.id); assert.equal(getBandInfo(s.frequency).band, 'ham') }
  const sorted = [...DETENTS].sort((a, b) => a.frequency - b.frequency)
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].frequency - sorted[i - 1].frequency > sorted[i].captureMhz + sorted[i - 1].captureMhz, `overlap at ${sorted[i].frequency}`)
  for (const d of DETENTS) assert.ok(d.escapeMhz > d.captureMhz)
  assert.equal(hamStationAt(100.4), null)
})
t('bulletin: starts on tune-in, rotates after the pause, never answers', () => {
  const b = S.createStations().bulletin
  assert.match(b.onTuneIn().text, /^VVV/)
  assert.equal(b.onIdle(S.BULLETIN_PAUSE_MS - 1), null)
  assert.match(b.onIdle(S.BULLETIN_PAUSE_MS).text, /QUICK BROWN FOX/)
  assert.equal(b.onWord(w('HI')), null)
  assert.ok(b.onTuneIn().timing.wordGapMs > 1000) // Farnsworth: long spaces
})
const memStore = (init = []) => { const mem = new Map(init); return { mem, storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) } } }
const L = S.ELMER_LINES
t('elmer: introduces himself, pauses, asks; one letter answers; welcome chat, then the first letter', () => {
  const { mem, storage } = memStore()
  const e = S.createStations({ rng: () => 0, storage }).elmer
  assert.equal(e.onTuneIn().text, 'GE. DE ELMER. I AM AN OLD CW OP. ')
  assert.equal(e.onIdle(S.ELMER_FOLLOW_UP_MS - 1), null) // a breath first
  assert.equal(e.onIdle(S.ELMER_FOLLOW_UP_MS).text, 'I HELP NEW OPS. R U NEW TO CW? Y OR N K ')
  assert.equal(e.onIdle(S.ELMER_FOLLOW_UP_MS), null) // said once
  assert.equal(e.onWord(w('K')), null) // procedure, not an answer
  assert.equal(e.onWord(w('HI')).text, 'HI HI. R U NEW TO CW? SEND Y OR N K ')
  assert.equal(e.onWord(w('XQ')).text, 'SRI, I NEED Y OR N. R U NEW? K ')
  assert.equal(e.onWord(w('Y')).text, 'FB. GLAD U CAME BY. I SEND A LTR, U SEND IT BACK. ')
  assert.equal(e.onIdle(S.ELMER_FOLLOW_UP_MS).text, '1ST LTR IS E. E IS 1 DIT. SEND E K ')
  assert.equal(e.onWord(w('T')).text, 'NOT QUITE. E IS DIT. TRY AGN K ')
  assert.equal(e.onWord(w('T')).text, 'NO WORRIES. LISTEN. E E E. SEND E K ')
  assert.equal(e.onWord(w('E')).text, 'FB. NEXT T. T IS DAH. T T T. UR TURN K ')
  assert.equal(mem.get('hamorse.elmer.learned'), '2')
  assert.equal(e.onWord(w('T')).text, 'FB. SEND E K ') // reviews of earlier letters
  assert.equal(e.onWord(w('HI')).text, 'HI HI. SEND E K ')
  assert.equal(e.onWord(w('E')).text, 'FB. SEND E K ')
  assert.equal(e.onWord(w('E')).text, 'FB. NEXT I. I IS DIDIT. I I I. UR TURN K ')
  assert.equal(e.onWord(w('?')).text, 'NEXT I. I IS DIDIT. I I I. UR TURN K ')
  assert.equal(e.onIdle(24999), null)
  assert.equal(e.onIdle(25000).text, 'STILL THERE? NEXT I. I IS DIDIT. I I I. UR TURN K ')
  assert.ok(e.onIdle(25000)); assert.equal(e.onIdle(25000), null) // twice at most
  assert.equal(e.onWord(w('73')).text, '73 ES GL. CU AGN SK ')
  assert.equal(e.onIdle(99999), null)
  assert.match(e.onWord(w('GE')).text, /^WB\. NEXT I\./)
})
t('elmer: chat at an easy pace, lessons slower', () => {
  const e = S.createStations({ rng: () => 0 }).elmer
  const intro = e.onTuneIn(), ask = e.onIdle(S.ELMER_FOLLOW_UP_MS)
  assert.equal(intro.timing, S.ELMER_CHAT_TIMING); assert.equal(ask.timing, S.ELMER_CHAT_TIMING)
  const welcome = e.onWord(w('Y')), first = e.onIdle(S.ELMER_FOLLOW_UP_MS)
  assert.equal(welcome.timing, S.ELMER_CHAT_TIMING); assert.equal(first.timing, S.ELMER_TIMING)
  assert.equal(e.onWord(w('T')).timing, S.ELMER_TIMING)
  assert.ok(S.ELMER_CHAT_TIMING.wordGapMs < S.ELMER_TIMING.wordGapMs)
})
t('elmer: answering during the intro pause skips the question; silence gets help, a dit means yes', () => {
  const e = S.createStations({ rng: () => 0 }).elmer
  e.onTuneIn()
  assert.equal(e.onWord(w('Y')).text, L.welcome) // keen: answered before he asked
  assert.equal(e.onIdle(S.ELMER_FOLLOW_UP_MS).text, '1ST LTR IS E. E IS 1 DIT. SEND E K ')
  const q = S.createStations({ rng: () => 0 }).elmer
  q.onTuneIn(); q.onIdle(S.ELMER_FOLLOW_UP_MS)
  assert.equal(q.onIdle(S.ELMER_ASK_IDLE_MS - 1), null)
  assert.equal(q.onIdle(S.ELMER_ASK_IDLE_MS).text, 'NO RUSH. IF U R NEW, TAP 1 DIT K ')
  assert.equal(q.onWord(w('E')).text, L.welcome) // a dit (E) = yes
  assert.equal(q.onTuneIn().text, 'WB. 1ST LTR IS E. E IS 1 DIT. SEND E K ') // retune mid-chat: straight back in
})
t('elmer: not new -> pointers to Bob and Sam (new frequencies), then words', () => {
  const e = S.createStations({ rng: () => 0 }).elmer
  e.onTuneIn(); e.onIdle(S.ELMER_FOLLOW_UP_MS)
  assert.equal(e.onWord(w('N')).text, 'FB OM. TRY BOB ON 102.40 FOR A QSO, OR SAM ON 103.10 FOR SPEED. OR WORDS WID ME. ')
  assert.equal(e.onIdle(S.ELMER_FOLLOW_UP_MS).text, 'SEND CQ K ')
  assert.equal(e.onWord(w('CX')).text, 'NOT QUITE. AGN CQ K ')
  assert.match(e.onWord(w('CQ')).text, /^FB\. SEND [A-Z0-9]{2,} K $/)
})
t('elmer: returning student welcomed back, milestones, words after all 36', () => {
  const { storage } = memStore([['telegraph-ghost.elmer.learned', '5']]) // the pre-rename key is still honoured
  const e = S.createStations({ rng: () => 0, storage }).elmer
  assert.equal(e.onTuneIn().text, 'GE. WB. NICE TO HEAR U AGN. LAST TIME U GOT TO N. ')
  assert.equal(e.onIdle(S.ELMER_FOLLOW_UP_MS).text, 'SEND N K ')
  assert.match(e.onWord(w('N')).text, /U KNOW 6 LTRS NOW\. NEXT M\. M IS DAHDAH\./)
  const all = memStore([['hamorse.elmer.learned', String(S.ELMER_ORDER.length)]])
  const f = S.createStations({ rng: () => 0, storage: all.storage }).elmer
  f.onTuneIn(); f.onIdle(S.ELMER_FOLLOW_UP_MS)
  assert.match(f.onWord(w('0')).text, /U KNOW THEM ALL\. NOW WORDS\. SEND [A-Z0-9]{2,} K $/)
})
t('tutor 101.00: HI then SOS, exactly as before', () => {
  const tu = S.createStations().tutor
  assert.equal(tu.onTuneIn(), null)
  assert.equal(tu.onWord(w('HI')).text, 'GUD COPY. SEND SOS ')
  assert.equal(tu.onWord(w('SOS')).text, 'FB. 73. ')
  assert.equal(tu.onWord(w('CHI')), null)
  assert.equal(tu.onWord(w('HI')).timing, S.REPLY_TIMING)
})
t('ragchew: full QSO with echoes, K or silence ends an over', () => {
  const r = S.createStations().ragchew
  assert.equal(r.onTuneIn().text, 'CQ CQ DE BOB BOB K ')
  assert.equal(r.onIdle(29999), null)
  assert.equal(r.onIdle(30000).text, 'CQ CQ DE BOB K ')
  assert.equal(r.onWord(w('BOB')), null); assert.equal(r.onWord(w('DE')), null)
  assert.equal(r.onWord(w('K')).text, 'GE. UR RST 579. NAME BOB. UR NAME? K ')
  for (const x of ['R', 'TNX', 'NAME', 'IS']) assert.equal(r.onWord(w(x)), null)
  assert.equal(r.onWord(w('JOE')), null)
  assert.equal(r.onIdle(S.RAGCHEW_OVER_IDLE_MS - 1), null)
  assert.equal(r.onIdle(S.RAGCHEW_OVER_IDLE_MS).text, 'FB JOE. QTH OHIO. UR QTH? K ')
  assert.equal(r.onIdle(60000), null) // mid-QSO: no CQ
  assert.equal(r.onWord(w('K')).text, 'SRI. UR QTH? K ') // an over with no QTH in it
  assert.equal(r.onIdle(4000), null) // that over is finished: nothing pending
})
t('ragchew: SRI when nothing usable; QTH, 73, E E', () => {
  const r = S.createStations().ragchew
  r.onTuneIn(); r.onWord(w('CQ')); r.onWord(w('K'))
  assert.equal(r.onWord(w('K')).text, 'SRI. UR NAME? K ')
  r.onWord(w('MY')); r.onWord(w('NAME')); r.onWord(w('IS')); r.onWord(w('ANN'))
  assert.equal(r.onWord(w('K')).text, 'FB ANN. QTH OHIO. UR QTH? K ')
  r.onWord(w('QTH')); r.onWord(w('LONDON'))
  assert.equal(r.onWord(w('K')).text, 'FB. LONDON. TNX QSO ANN. 73 SK ')
  r.onWord(w('73'))
  assert.equal(r.onWord(w('SK')).text, 'E E ')
  assert.equal(r.onIdle(30000).text, 'CQ CQ DE BOB K ') // back to calling
  r.onWord(w('HI')); assert.match(r.onIdle(3500).text, /^GE\./)
  assert.equal(r.onTuneIn().text, 'CQ CQ DE BOB BOB K ') // tune-in resets the QSO
  r.onWord(w('X')); assert.match(r.onIdle(3500).text, /^GE\./)
})
t('sam: calls CQ QRQ; hello, then asks before the drill; Y explains, then the group', () => {
  const sp = S.createStations({ rng: () => 0 }).speed // every group is AAAAA, praise is FB
  const F = S.SPEED_FOLLOW_UP_MS
  assert.equal(sp.onTuneIn().text, 'CQ QRQ CQ QRQ DE SAM K ')
  assert.equal(sp.onIdle(39999), null)
  assert.equal(sp.onIdle(40000).text, 'CQ QRQ CQ QRQ DE SAM K ')
  assert.equal(sp.onWord(w('K')), null)
  assert.equal(sp.onWord(w('GE')).text, 'GE OM. DE SAM. TNX FER CALL. ')
  assert.equal(sp.onIdle(F - 1), null)
  assert.equal(sp.onIdle(F).text, 'WANT SOME SPEED PRACTICE? Y OR N K ')
  assert.equal(sp.onWord(w('MAYBE')).text, 'SRI. WANT SOME SPEED PRACTICE? Y OR N K ')
  const ex = sp.onWord(w('Y'))
  assert.equal(ex.text, 'FB. I SEND 5 LTR GRPS, U SEND THEM BACK. 20 WPM. ')
  assert.equal(ex.timing.ditMs, 60)
  assert.equal(sp.onIdle(F).text, 'GRP AAAAA ')
  assert.equal(sp.onWord(w('?')).text, 'GRP AAAAA ')
  const ok = sp.onWord(w('AAAAA', 14))
  assert.equal(ok.text, 'FB. UR 14WPM. QRQ 22. GRP AAAAA ')
  assert.equal(ok.timing.ditMs, Math.round(1200 / 22))
  assert.equal(sp.onWord(w('AAAAX')).text, 'CLOSE. QRS 20. AGN GRP AAAAA ')
  assert.equal(sp.onWord(w('ZZZZZ')).text, 'NIL. QRS 18. AGN GRP AAAAA ')
  assert.equal(sp.onWord(w('QRS')).text, 'R QRS 16. GRP AAAAA ')
  for (let i = 0; i < 5; i++) sp.onWord(w('ZZZZZ'))
  assert.match(sp.onWord(w('ZZZZZ')).text, /QRS 15\./)
  let last
  for (let i = 0; i < 14; i++) last = sp.onWord(w('AAAAA'))
  assert.match(last.text, /TOP SPEED HI\. GRP AAAAA $/)
  assert.equal(sp.onIdle(29999), null)
  assert.equal(sp.onIdle(30000).text, 'QRZ? GRP AAAAA ')
  sp.onIdle(30000); assert.equal(sp.onIdle(30000), null)
  assert.equal(sp.onTuneIn().text, 'WB. GRP AAAAA ')
  assert.equal(sp.onWord(w('73')).text, 'TU FER PRACTICE. 73 SK ')
  assert.equal(sp.onTuneIn().text, 'CQ QRQ CQ QRQ DE SAM K ')
  assert.equal(sp.onWord(w('R')).text, 'WB OM. WANT SOME SPEED PRACTICE? Y OR N K ') // remembers you
  assert.equal(sp.onWord(w('N')).text, 'OK OM. TNX FER QSO. 73 SK ')
  assert.equal(sp.onIdle(40000).text, 'CQ QRQ CQ QRQ DE SAM K ') // calling again
})
t('sam: random groups really vary', () => {
  const sp = S.createStations().speed
  sp.onTuneIn(); sp.onWord(w('GE')); sp.onWord(w('Y')); const a = sp.onIdle(S.SPEED_FOLLOW_UP_MS).text.trim().split(' ').pop()
  const b = sp.onWord(w(a)).text.trim().split(' ').pop()
  assert.match(a, /^[A-Z0-9]{5}$/); assert.match(b, /^[A-Z0-9]{5}$/)
})
t('reserved receive-only slots: in the gaps, RX only, nobody there, own detents (102.75 is now the Stranger)', () => {
  const st = Object.values(HAM_STATIONS).sort((a, b) => a - b)
  assert.equal(RESERVED_RX_FREQUENCIES.length, st.length - 2)
  assert.equal(AGENT_STATIONS.stranger, (st[3] + st[4]) / 2)
  RESERVED_RX_FREQUENCIES.forEach((f, i) => {
    assert.ok(Math.abs(f - (st[i] + st[i + 1]) / 2) < 1e-9, `${f} is midway`)
    assert.deepEqual(getBandInfo(f), { band: 'reserved', canTransmit: false })
    assert.equal(hamStationAt(f), null)
    assert.ok(DETENTS.some((d) => d.frequency === f))
  })
  assert.equal(getBandInfo(100.5).band, 'ham') // the rest of the gap is open band
})
t('tutors are strictly local: no network code, and they work with the network gone', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../src/utils/stations.ts', import.meta.url), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '') // ignore comments
  assert.ok(!/\bfetch\b|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon|import\(/.test(code), 'stations.ts must never touch the network')
  assert.ok(!/^import .*(agentEngine|audioEngine)/m.test(src), 'stations.ts must not depend on the agents')
  const saved = globalThis.fetch
  globalThis.fetch = () => { throw new Error('offline') }
  try {
    const st = S.createStations({ rng: () => 0 })
    assert.ok(st.elmer.onTuneIn().text.startsWith('GE. DE ELMER'))
    assert.ok(st.speed.onTuneIn().text.startsWith('CQ QRQ'))
    assert.ok(st.ragchew.onTuneIn().text.startsWith('CQ CQ DE BOB'))
    assert.ok(st.tutor.onWord(w('HI')).text.startsWith('GUD COPY'))
    assert.ok(st.bulletin.onTuneIn().text.startsWith('VVV'))
  } finally { globalThis.fetch = saved }
})
console.log(`\n${n} station tests passed`)
