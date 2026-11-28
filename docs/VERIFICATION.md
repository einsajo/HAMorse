# Verified, in numbers

Everything below was measured, not asserted. Method: Playwright at a 412 × 915
phone viewport against the real app, offline `OfflineAudioContext` renders for
sound, and 63 unit tests (`npm test`) run by CI on every PR.

## Photosensitivity (WCAG 2.3.1)

- Build-up dips: 5, at 0 / 800 / 1400 / 1850 / 2210 ms — never more than
  **3 in any second**, low contrast (black at 70–80%, never white).
- Glitch flickers: 2 dips, seconds apart. The jumpscare has **one** bright
  exposure (the second hit is motion and tearing, not a flash).
- Verified frame by frame on the keyframes. Reduced-motion: no dips, no lunge,
  no shake, no tearing.

## The haunt's pace (measured end to end)

| Path | CQ | Trapped | Build-up | Jumpscare |
|---|---|---|---|---|
| Quiet visitor (no keying) | 3.6 s | 10 s | 40.8 s | **44 s** |
| Talking visitor (scripted QSO) | 3.6 s | 10 s | 125.2 s | **~2:05** |

- The pace is decided per turn from how many words you've sent (2 words or
  fewer = quiet). Starting to talk slows it back down.
- The ghost's final transmission runs away: letter gaps measured ~890 ms →
  ~230–470 ms by the 24th character, with the pitch lurching.

## Sound (offline render through the app's own limiter)

- Jumpscare stinger, 50 ms windows: hit 1 −12 dB → relief −36 dB →
  hit 2 −11 dB. Measured peak **0.96 FS** after adding a safety soft-clip
  (the raw second hit measured 1.3 before it).
- The shriek is 3D on headphones (HRTF): left/right balance swings +11 dB →
  −14 dB.
- Keyer haptics measured: `navigator.vibrate(18)` on a dit, `(45)` on a dah.

## Hard cases replayed in the browser

- **Power cut mid-strike** ("I SE…"): power back at 822 ms → haunted at
  1641 ms → blackout at 4302 ms. You can't stop it by cutting the power.
- **Escape mid-transmission:** retune during the arrival CQ → not trapped,
  dial free, LCD and knob consistent (this was a user-reported desync bug,
  fixed and replayed).
- **The ghost's QSL card** appears 4.06 s before the trip (6 s into the 10 s
  freeze) and survives the reset until closed.
- **The card's grease** finishes pouring at ~3.75 s, just before the 4 s
  freeze.
- **The air (TX GBL):** two real clients on one frequency: delivery to the
  other device, no echo to the sender, isolation between frequencies, one
  transmission per 2.5 s, messages sanitized server-side.

## Tests

63 unit tests, no framework (TypeScript's transpiler + `node:assert`):
18 stations · 20 agents · 3 progress · 5 air relay · 12 agent route ·
5 live-streams power. CI: `npm ci`, `tsc -b`, `vite build`, the tests, and the
Morse dictionary validator in strict mode.
