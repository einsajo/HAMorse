import assert from 'node:assert/strict'
import * as P from './.out/utils/progress.mjs'
import { ELMER_ORDER } from './.out/utils/stations.mjs'

let n = 0
const t = (name, fn) => { fn(); n++; console.log('ok', name) }
const mem = (entries = []) => { const m = new Map(entries); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) } }
const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('quota') } }

t('learnedChars: the first N of the Elmer order, clamped', () => {
  assert.deepEqual(P.learnedChars(4), ['E', 'T', 'I', 'A'])
  assert.deepEqual(P.learnedChars(0), [])
  assert.deepEqual(P.learnedChars(-3), [])
  assert.equal(P.learnedChars(999).length, ELMER_ORDER.length)
  assert.deepEqual(P.learnedChars(Number.NaN), [])
})

t('loadProgress: new key, legacy key, broken and empty storage', () => {
  assert.deepEqual(P.loadProgress(), { learned: 0, bestWpm: null })
  assert.deepEqual(P.loadProgress(mem([['hamorse.elmer.learned', '6'], [P.BEST_WPM_KEY, '13']])), { learned: 6, bestWpm: 13 })
  assert.equal(P.loadProgress(mem([['telegraph-ghost.elmer.learned', '5']])).learned, 5, 'the pre-rename key still counts')
  assert.equal(P.loadProgress(mem([['hamorse.elmer.learned', '9'], ['telegraph-ghost.elmer.learned', '2']])).learned, 9, 'the new key wins')
  assert.deepEqual(P.loadProgress(mem([['hamorse.elmer.learned', 'x'], [P.BEST_WPM_KEY, '999']])), { learned: 0, bestWpm: null })
  assert.equal(P.loadProgress(mem([['hamorse.elmer.learned', '999']])).learned, ELMER_ORDER.length)
  assert.deepEqual(P.loadProgress(broken), { learned: 0, bestWpm: null })
})

t('recordWpm: keeps the best plausible speed, never lowers it, survives a throwing storage', () => {
  const s = mem()
  assert.equal(P.recordWpm(s, 9.4), 9)
  assert.equal(s.m.get(P.BEST_WPM_KEY), '9')
  assert.equal(P.recordWpm(s, 7), 9, 'a slower word does not lower it')
  assert.equal(P.recordWpm(s, 14.6), 15)
  assert.equal(P.recordWpm(s, null), 15)
  assert.equal(P.recordWpm(s, Number.NaN), 15)
  assert.equal(P.recordWpm(s, 2), 15, 'a hesitation is not a speed')
  assert.equal(P.recordWpm(s, 75), 15, 'a timing glitch is not a speed')
  assert.equal(P.loadProgress(s).bestWpm, 15)
  assert.equal(P.recordWpm(broken, 12), 12)
  assert.equal(P.recordWpm(undefined, 12), 12)
})

console.log(`\n${n} progress tests passed`)
