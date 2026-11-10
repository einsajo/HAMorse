import http from 'node:http'
import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const mod = await import('../.kiro/powers/live-streams/skills/fetch-streams/scripts/fetch-streams.mjs')
const listen = (handler) => new Promise((r) => { const s = http.createServer(handler).listen(0, '127.0.0.1', () => r(s)) })
let streamHits = 0
const radio = await listen((req, res) => {
  streamHits++
  const cors = req.url.includes('nocors') ? {} : { 'Access-Control-Allow-Origin': '*' }
  if (req.url.includes('page')) { res.writeHead(200, { 'Content-Type': 'text/html', ...cors }); return res.end('<html>') }
  res.writeHead(200, { 'Content-Type': 'audio/mpeg', ...cors })
  const t = setInterval(() => res.write(Buffer.alloc(1024)), 20) // an endless stream
  res.on('close', () => clearInterval(t))
})
const R = `http://127.0.0.1:${radio.address().port}`
const dir = await listen((req, res) => {
  const tag = new URL(req.url, 'http://x').searchParams.get('tag')
  const codec = new URL(req.url, 'http://x').searchParams.get('codec')
  const lists = { jazz: [{ name: 'No CORS Jazz', url_resolved: `${R}/nocors-jazz.mp3` }, { name: 'Good Jazz', url_resolved: `${R}/jazz.mp3` }], news: [{ name: 'Fake Page', url_resolved: `${R}/page` }, { name: 'Good News', url_resolved: `${R}/news.mp3` }], sports: [{ name: 'Good Sports', url_resolved: `${R}/sports.mp3` }] }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(codec === 'MP3' ? (lists[tag] ?? []) : []))
})
const D = `http://127.0.0.1:${dir.address().port}`
let n = 0; const ok = (m) => { n++; console.log('ok', m) }

// probe rules
assert.deepEqual((await mod.probe(`${R}/jazz.mp3`, { origin: 'https://example.com', allowHttp: true })).ok, true)
assert.equal((await mod.probe(`${R}/nocors.mp3`, { origin: 'https://example.com', allowHttp: true })).reason, 'no CORS')
assert.match((await mod.probe(`${R}/page`, { origin: 'https://example.com', allowHttp: true })).reason, /^not audio/)
assert.equal((await mod.probe(`${R}/jazz.mp3`, { origin: 'https://example.com' })).reason, 'http only')
assert.equal((await mod.probe(`http://127.0.0.1:1/x.mp3`, { origin: 'https://example.com', allowHttp: true, timeout: 2000 })).reason, 'error')
ok('probe: accepts audio + CORS; rejects no-CORS, non-audio, plain http, dead hosts')

// full run against the mock directory (the curated https candidates can't be reached from the sandbox: they fail and the directory is used)
const out = join(tmpdir(), `liveStreams.test.${process.pid}.ts`)
const lines = []
const code = await mod.main(['--api', D, '--allow-http', '--out', out, '--timeout', '3000'], (l) => lines.push(l))
const ts = readFileSync(out, 'utf8')
console.log(lines.join('\n'))
assert.equal(code, 0)
assert.match(ts, /'89\.30': \{ name: "Good News", genre: 'news', url: "http:\/\/127\.0\.0\.1:\d+\/news\.mp3", verified: true/)
assert.match(ts, /'93\.50': \{ name: "Good Sports", genre: 'sports'/)
assert.match(ts, /'98\.10': \{ name: "Good Jazz", genre: 'jazz'/)
assert.ok(!ts.includes('nocors') && !ts.includes('/page'))
ok('provision: skips no-CORS and fake streams, writes verified entries for all three slots')
// the generated module has the same shape the app imports
assert.deepEqual(Object.keys(mod.currentUrls(ts)).sort(), ['89.30', '93.50', '98.10'])
const app = readFileSync(new URL('../src/data/liveStreams.ts', import.meta.url), 'utf8')
assert.deepEqual(Object.keys(mod.currentUrls(app)).sort(), ['89.30', '93.50', '98.10']) // all three provisioned (verified 2026-11-10)
ok('the generated module matches src/data/liveStreams.ts (same interface, same keys)')

// --check reports a broken current file
const bad = []
assert.equal(await mod.main(['--check', '--out', out, '--allow-http', '--origin', 'https://elsewhere.example'], (l) => bad.push(l)), 0) // ACAO * passes any origin
ok('--check re-verifies what is there')
// an empty directory: slots stay empty, exit 1, still written
const emptyDir = await listen((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]') })
const code2 = await mod.main(['--api', `http://127.0.0.1:${emptyDir.address().port}`, '--allow-http', '--out', out, '--timeout', '2000'], () => {})
assert.equal(code2, 1)
assert.match(readFileSync(out, 'utf8'), /'93\.50': null/)
ok('nothing verifiable: the slot is left null (the radio keeps its carrier) and the power exits 1')
rmSync(out)
for (const s of [radio, dir, emptyDir]) s.close()
console.log(`\n${n} power tests passed (stream servers hit ${streamHits}x, headers only)`)
process.exit(0)
