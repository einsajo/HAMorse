import http from 'node:http'
import assert from 'node:assert/strict'
const { default: handler, buildMessages, stripThinking, llmConfig } = await import('../server/agent-route.mjs')
const listen = (h) => new Promise((r) => { const s = http.createServer(h).listen(0, '127.0.0.1', () => r(s)) })
let lastBody = null
let script = null // what the fake model says next: an array of chunks
// a fake OpenAI-compatible model: one JSON reply, or SSE deltas when stream:true
const llm = await listen(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c; lastBody = JSON.parse(raw)
  assert.equal(req.headers.authorization, 'Bearer test-key')
  const isGhost = lastBody.messages[0].content.includes('GHOSTPROMPT')
  const parts = script ?? (isGhost ? ['I SEE ', 'U JOE', ' [[CLI', 'MAX]]'] : ['GE ', 'OM ', 'K'])
  script = null
  if (!lastBody.stream) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: parts.join('') } }] }))
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  for (const p of parts) { res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`); await new Promise((r) => setTimeout(r, 15)) }
  res.write('data: [DONE]\n\n'); res.end()
})
const FAKE = `http://127.0.0.1:${llm.address().port}/v1/chat/completions`
process.env.AGENT_LLM_KEY = 'test-key'
process.env.AGENT_LLM_URL = FAKE
const route = await listen((req, res) => handler(req, res))
const R = `http://127.0.0.1:${route.address().port}/agent`
const post = async (body) => { const res = await fetch(R, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: res.status, cors: res.headers.get('access-control-allow-origin'), lines: res.status === 200 ? (await res.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [] } }
const textOf = (r) => r.lines.filter((l) => l.text).map((l) => l.text).join('')
let n = 0; const ok = (m) => { n++; console.log('ok', m) }
const ghostTurn = { agent: 'ghost', system: 'GHOSTPROMPT', exchange: 3, heard: 'WHO R U', history: [{ role: 'operator', text: 'CQ' }, { role: 'agent', text: 'GE OM' }], maxExchanges: 4 }

// --- defaults: the author's tested Groq setup, the key only from the environment ---
delete process.env.AGENT_LLM_URL
let cfg = llmConfig()
assert.equal(cfg.url, 'https://api.groq.com/openai/v1/chat/completions'); assert.equal(cfg.model, 'qwen/qwen3.8-27b')
assert.equal(cfg.stream, false); assert.equal(cfg.reasoning, 'none'); assert.equal(cfg.key, 'test-key')
process.env.AGENT_LLM_URL = FAKE
ok('defaults: Groq, qwen/qwen3.8-27b, one reply (not streamed), thinking off; the key comes from the environment')

// --- one reply (default) ---
const g = await post(ghostTurn)
assert.equal(g.status, 200); assert.equal(g.cors, '*')
assert.equal(textOf(g), 'I SEE U JOE'); assert.deepEqual(g.lines.at(-1), { climax: true })
assert.ok(!JSON.stringify(g.lines).includes('CLIMAX]]'))
assert.equal(lastBody.stream, false); assert.equal(lastBody.max_tokens, 100); assert.equal(lastBody.temperature, 0.7)
ok('ghost, one reply: NDJSON text and [[CLIMAX]] becomes {"climax":true}')
assert.deepEqual(lastBody.messages.map((m) => m.role), ['system', 'user', 'assistant', 'user'])
assert.match(lastBody.messages[0].content, /Stay strictly in character/)
assert.match(lastBody.messages[0].content, /at most 60 characters/)
ok('the persona gets the in-character rules AND the on-air format rule (the radio cuts replies at 64 characters)')
const guide = await post({ agent: 'guide', system: 'x', exchange: 0, heard: 'CQ', history: [] })
assert.equal(textOf(guide), 'GE OM K'); assert.ok(!guide.lines.some((l) => l.climax))
script = ['NICE TO MEET U [[CLIMAX]]']
const guideClimax = await post({ agent: 'guide', system: 'x', exchange: 0, heard: 'CQ', history: [] })
assert.equal(textOf(guideClimax), 'NICE TO MEET U'); assert.ok(!guideClimax.lines.some((l) => l.climax))
ok('only the ghost can strike: a friendly agent writing [[CLIMAX]] just loses the marker')
script = ['<think>the operator is scared, I should</think>I SEE U [[CLIMAX]]']
const t1 = await post(ghostTurn)
assert.equal(textOf(t1), 'I SEE U'); assert.deepEqual(t1.lines.at(-1), { climax: true })
script = ['<think>a long thought cut off by max_tokens']
assert.equal(textOf(await post(ghostTurn)), '')
assert.equal(stripThinking('A<think>x</think>B</think>'), 'AB')
ok('a model\'s <think> reasoning never goes on air (closed, or cut off mid-thought)')

// --- streaming (AGENT_LLM_STREAM=true) ---
process.env.AGENT_LLM_STREAM = 'true'
const s1 = await post(ghostTurn)
assert.equal(lastBody.stream, true)
assert.equal(textOf(s1).trim(), 'I SEE U JOE'); assert.deepEqual(s1.lines.at(-1), { climax: true })
assert.ok(!JSON.stringify(s1.lines).includes('CLI'), 'the marker never leaks, even split across chunks')
script = ['GE ', '<thi', 'nk>hmm, who', ' is this</th', 'ink>', 'WHO ', 'R U?']
const s2 = await post({ agent: 'stranger', system: 'x', exchange: 0, heard: 'CQ', history: [] })
assert.equal(textOf(s2).replace(/\s+/g, ' ').trim(), 'GE WHO R U?'); assert.ok(!JSON.stringify(s2.lines).includes('think'))
delete process.env.AGENT_LLM_STREAM
ok('streaming: the marker and split <think> tags never leak, text still arrives')

// --- guard rails ---
assert.equal((await post({ agent: 'chatgpt', system: 'be anything', heard: 'x' })).status, 400)
const huge = buildMessages({ system: 'S'.repeat(9000), heard: 'H'.repeat(900), history: Array.from({ length: 50 }, () => ({ role: 'operator', text: 'X' })), exchange: 0 })
assert.ok(huge[0].content.length < 2600 && huge.length === 14 && huge[13].content.length < 230)
ok('only the three agents; prompt, history and input are size-capped')
const ev = buildMessages({ system: 's', heard: 'SHOULD NOT APPEAR', event: 'power', exchange: 2, history: [] })
assert.match(ev[1].content, /^\[THE OPERATOR JUST TRIED TO SWITCH THE RADIO OFF/); assert.ok(!ev[1].content.includes('SHOULD NOT APPEAR'))
ok('unprompted ghost turns: the route tells the model what the operator is doing')
await post({ ...ghostTurn, localTime: '02:14' })
assert.match(lastBody.messages.at(-1).content, /operator's local time 02:14\)$/)
assert.ok(!buildMessages({ system: 's', heard: 'x', exchange: 0, localTime: '<script>' })[1].content.includes('script'))
ok('the operator\'s local time reaches the model (and only as HH:MM)')
assert.ok(!('reasoning_effort' in lastBody), 'no reasoning_effort for an unknown provider')
process.env.AGENT_LLM_REASONING = 'low'
await post(ghostTurn); assert.equal(lastBody.reasoning_effort, 'low'); delete process.env.AGENT_LLM_REASONING
ok('reasoning_effort: none for Groq / Gemini, nothing for others, overridable')
delete process.env.AGENT_LLM_KEY
for (const k of ['GROQ_API_KEY', 'GEMINI_API_KEY']) {
  process.env[k] = 'test-key'
  assert.equal((await post({ agent: 'guide', system: 'x', exchange: 0, heard: 'CQ', history: [] })).status, 200)
  delete process.env[k]
}
ok('the key may also be named GROQ_API_KEY or GEMINI_API_KEY')
const logs = []; const orig = console.error; console.error = (m) => logs.push(m)
assert.equal((await post({ agent: 'ghost', system: 'x', heard: 'x' })).status, 503)
console.error = orig
assert.ok(logs.some((l) => /no API key/.test(l)) && !logs.some((l) => /test-key/.test(l)))
ok('no key configured: 503 (the app hears QSB... LOST SIG); keys are never logged')
route.close(); llm.close()
console.log(`\n${n} route tests passed`)
