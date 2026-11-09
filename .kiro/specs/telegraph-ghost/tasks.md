# Implementation Plan: The Telegraph Ghost

Spec: [requirements.md](./requirements.md) · [design.md](./design.md)

Requirement references point at sections of `requirements.md`
(e.g. `2c` = Tuning Panel, `3` = Core Mechanics & Audio, `4` = Haunt Sequence).
Tasks marked `*` are optional polish.

Submission deadline: Friday, December 4, 2026, 2:00 PM PT.

## Phase 1: Hardware skeleton, VFO and UI polish (done)

- [x] 1. Build the 3:4 chassis and global layout
  - Pitch-black void, no scrolling, 3:4 chassis sized by `min(100vw, 75dvh)`
  - Aged gunmetal: weathering stack, ambient sweep, edge bevels
  - _Requirements: 1_

- [x] 2. Build the Top Panel hardware
  - [x] 2.1 MCB power breaker with a vertical 50ms snap and a lit PWR jewel
  - [x] 2.2 Analog S-meter: recessed glass, cream dial, printed S1–S9 / +20 / +40 scale
  - [x] 2.3 DECODER horizontal slide switch with a 65ms detent snap
  - _Requirements: 2a_

- [x] 3. Build the amber LCD
  - [x] 3.1 Inset bezel, scanlines, pixel grid, `888.88` segment ghost, local VT323 font
  - [x] 3.2 Wipeable dust canvas (`destination-out`)
  - [x] 3.3 Permanent glass stain under the dust; backlight dimmed to `#D99600`
  - [x] 3.4 Power OFF = dead glass; power ON = warm-up flicker and live frequency
  - _Requirements: 2b_

- [x] 4. Build the Tuning Panel
  - [x] 4.1 Corroded copper plates: tall SOP plate (left), HAMorse badge over serial plate (right)
  - [x] 4.2 Machined-steel VFO knob with a printed 88–108 silkscreen scale
  - [x] 4.3 Drag-to-rotate tuning with hard stops at 88.00 / 108.00 and keyboard tuning
  - [x] 4.4 Magnetic detent at 104.40 (0.20 MHz capture, 0.32 MHz escape)
  - [x] 4.5 Dimple aligned to the printed scale (0.0° error); scale centred on the lifted knob face
  - _Requirements: 2c, 3_

- [x] 5. Build the Telegraph Desk hardware
  - [x] 5.1 Horizontal iambic squeeze keyer with a see-saw Z-axis pivot
  - [x] 5.2 REF / CLR tactile switches; TX SEND (same size) under the TX ARM guarded toggle
  - _Requirements: 2d_

- [x] 6. Build the reference card
  - Slides out from behind the stationary chassis (up on portrait, right on wide screens)
  - Friction keyframes; tap or drag back to close
  - _Requirements: 2e_

- [x] 7. Global state
  - `RadioContext` with frequency / power / decoder; default 88.50 MHz
  - _Requirements: 2a, 2b, 3_

- [x] 8. S-meter needle physics
  - Off = rest stop; on = flutter around S3–S4; exactly 104.40 = pinned with a bounce
  - _Requirements: 2a, 4_

- [ ] 9. Verify on the real React runtime
  - [ ] 9.1 `npm install && npm run build` with no TypeScript or Vite errors
  - [ ] 9.2 Run `npm run dev` on a real Android phone: drag tuning, detent, dust wipe, card, paddles
  - [ ] 9.3 Deploy to a public URL (required for submission)
  - _Requirements: 1_

## Phase 2: Morse code engine

- [x] 10. Morse dictionary
  - [x] 10.1 Create `src/utils/morseDictionary.ts`: `MORSE_DICTIONARY` (code to character, A–Z and 0–9, `.` and `-`), `CHAR_TO_MORSE`, `Q_CODES` (CQ, QRT)
  - [x] 10.2 `morse-validator` passes: `node .kiro/powers/morse-validator/skills/validate-morse/scripts/validate-morse.mjs --strict` (36/36); the validator now also reads the code-to-character form
  - [x] 10.3 The reference card prints its Morse and Q-code tables from the dictionary (one source of truth)
  - _Requirements: 2e, 3_

- [ ] 11. Paddle input to symbols
  - [x] 11.1 DIT / DAH presses call `handleTap('.')` / `handleTap('-')` on the shared decoder (`useMorseDecoder`)
  - [ ] 11.2 Iambic squeeze: holding both alternates `.-.-`, with a configurable WPM element timing
  - [x] 11.3 Gap timing from the last tap: 600ms ends a letter, 1400ms ends a word (touch-friendly; configurable on `MorseDecoderProvider`)
  - _Requirements: 2d, 3_

- [ ] 12. Decoder and LCD buffer
  - [x] 12.1 Decode symbols with the dictionary; unknown or over-long sequences become `?`
  - [x] 12.2 DECODER ON shows the decoded text plus the live dits/dahs and a cursor in the LCD buffer row (newest text pinned right, overflow hidden left); OFF leaves it blank and ignores taps
  - [x] 12.3 CLR clears the buffer; power OFF wipes it
  - [x] 12.4 TX SEND sends what's keyed at once and hands the frequency over; LCD RX / TX annunciators with `TX SEND...` (counting dots), NO REPLY / INHIBIT / BUSY / NO MSG
  - [x] 12.5 DECODER ON: words wait as an underlined draft until TX SEND (`PRESS TX`), stations hold off while a draft waits, CLR wipes the draft first; DECODER OFF keeps send-on-pause
  - _Requirements: 2b, 2d, 3_

- [x] 12.5 Frequency bands (`src/constants.ts`): broadcasters, ham band, ghost, dead air
  - S-meter targets per band; decoder only on the ham band / ghost; `RX ONLY` / `DEAD BAND` LCD status; retuning clears the buffer
  - _Requirements: 2a, 2b, 3_

- [ ] 13.* Unit tests for timing and decoding (letter / word gaps, squeeze alternation)

## Phase 3: Web Audio integration

- [x] 14. Audio engine (`src/utils/audioEngine.ts`)
  - [x] 14.1 One `AudioContext`, not even created until the MCB is operated (mobile autoplay policy); touch release re-unlocks
  - [x] 14.2 Power OFF ramps the static to silence; a limiter caps output loudness
  - _Requirements: 3_

- [ ] 15. Band static
  - [x] 15.1 Looping white noise (with crackle) through a ~1 kHz bandpass
  - [x] 15.2 Static level per band: dead air 100%, ham 50%, broadcast 20%, ghost 10%
  - [ ] 15.3* Static colour / fade that varies continuously with distance from a station
  - _Requirements: 3_

- [x] 16. Sidetone and mechanical sounds
  - [x] 16.1 700 Hz sine sidetone with 5ms attack/release: DIT 60ms, DAH 180ms. Plays on the ham band / ghost when powered, even with the DECODER OFF (ear training)
  - [x] 16.2 Distinct Foley: breaker KA-CHUNK, slider scrape, button snap, ball-bearing VFO thud, paper scrape synced to the card animation
  - [x] 11.5 Reading loupe on the REF card: hold (touch) / hover (mouse), real card copy magnified to ~22px type, engraved rim marks, rubber-stamp hint; tap / swipe / click still close the card
  - [x] 18a.11 Reserved receive-only slots midway in each operator gap (silent S5 carrier, RX ONLY, INHIBIT), to be mapped later
  - [x] 16.5 REF card sound driven by the card's real speed from the keyframes: pink-noise friction tracking speed, cabinet body, stick-slip judder, buckle, landing
  - [x] 16.4 Physically modelled Foley: contact-pulse strikes into resonator banks, stick-slip friction following the motion, per-play variation, a synthesised room; button release clicks
  - _Requirements: 3_

- [ ] 17. S-meter follows real audio
  - [ ] 17.1 An `AnalyserNode` level drives the needle target; the 104.40 peg behaviour is kept
  - _Requirements: 2a, 3_

- [x] 16.3 Quick Start note before the first power-on: spotlight on the breaker, THROW MAIN POWER / GOT IT
  - _Requirements: 2f, 3_

## Phase 4: The haunt sequence

- [x] 18. Interactive reply engine
  - [x] 18.1 `simulateReply(message, isGhost)`: recursive-timeout auto-typer that keys each character's dits/dahs out loud and types it onto the LCD; paddles locked while receiving
  - [x] 18.2 Tutor on 101.00: `HI` -> `GUD COPY. SEND SOS`, `SOS` -> `FB. 73.`
  - [x] 18.3 Ghost on 104.40: `CQ` -> ` I C U ` (slow, distorted tone); sets global `isHaunted` (superseded by 19a)
  - [ ] 18.4* AI replies (optional), with the scripted replies as the fallback
  - [x] 18.5 DECODER OFF is display-only: taps are keyed and decoded and stations still answer; only the LCD text is hidden
  - _Requirements: 3a, 4_

- [x] 18a. Ham band operators, beginner to pro (`src/utils/stations.ts`)
  - [x] 18a.1 Station interface (`onTuneIn` / `onWord` / `onIdle`), `timingForWpm` with ARRL Farnsworth spacing, per-station beat note (`playTone(ms, hz)`)
  - [x] 18a.2 101.70 code-practice bulletin (18/8 WPM, rotating texts)
  - [x] 18a.3 100.30 Elmer: asks if you're new, coaches by conversation (varied praise, talk-through of mistakes, remarks, HI / 73 / welcome back), shortest-first characters with reviews, words after all 36 or for non-beginners, progress in localStorage
  - [x] 18a.4 102.40 Bob: CQ, RST / name / QTH exchange with echoes, 73 SK, E E
  - [x] 18a.5 103.10 Sam: calls CQ QRQ, explains on contact, 5-character groups, measured user WPM, QRQ / QRS / CLOSE, 15-40 WPM, 73 sign-off
  - [x] 18a.6 Provider wiring: tune-in, word routing, idle polling; per-station narrow detents (`DETENTS`)
  - [x] 18a.7 Adaptive letter / word gaps so fast operators aren't capped at ~12 WPM
  - [x] 18a.8 S-meter `keying` mode while an operator sends; Quick Start points at the Elmer; the REF card stays a pure Morse helper (operators are found by tuning)
  - [x] 18a.10 Operators 0.70 MHz apart (ham band to 103.50) with open band between; Elmer introduces himself → asks Y/N → one-letter answer → chat → first letter; Sam says hello and offers before the drill; Elmer chats at 20/18 WPM, teaches at 20/15
  - [x] 18a.9 Verified: 16 Node unit tests of the station logic; browser runs of the Elmer conversation (with DECODER OFF), a full QSO with Bob, Sam (fast keying, QRQ / QRS) and the bulletin
  - _Requirements: 2a, 2c, 2e, 2f, 3, 3a, 3b_

- [x] 19a. Agentic haunt engine
  - [x] 19a.1 Wandering `GHOST_FREQUENCY` (random per session, 0.50 MHz from every station, 1.00 from power-on, 0.05 grid)
  - [x] 19a.2 Proximity audio: static fades, detuned drone rises within 0.80 MHz; stops exactly on it
  - [x] 19a.3 `ghostAgent.ts`: pluggable brain (live agent endpoint NDJSON/SSE, runtime-registered, scripted persona fallback), session rules, souring voice
  - [x] 19a.4 `streamReply`: agent tokens keyed live as they stream; timing jitter; the ghost hears your whole over
  - [x] 19a.5 `isTrapped` after the first exchange: VFO lock (slipping knob + growing rumble), power lock (snaps off, back on after 1s)
  - [x] 19a.6 Climax: 800ms blackout + silence, single white flash with metallic BANG + 2 kHz screech, red corrupted LCD, shattered glass SVG, dripping #050505 liquid, card ejected
  - _Requirements: 3c, 4_

- [ ] 19. Liquid Crystal Bleed: remaining parts
  - [ ] 19.1 Blackout: chassis brightness drops by 90%; the amber backlight dies
  - [ ] 19.2 Viscous black SVG/CSS fluid leaks down from a cracked LCD over the chassis
  - [ ] 19.3 The serial plate text scrambles to `SER: D34D-S0UL`
  - [ ] 19.4 The S-meter needle violently pins to the red maximum
  - _Requirements: 4_

- [ ] 20. The breaker trips
  - [ ] 20.1 Incoming Morse speeds up and pitch-shifts erratically
  - [ ] 20.2 The MCB snaps itself OFF; audio cuts to dead silence; everything resets
  - _Requirements: 4_

## Phase 5: Submission

- [ ] 21. Submission package
  - [ ] 21.1 3-minute demo video: the haunt within the first 40 seconds, then the tactile details, then the Kiro workflow
  - [ ] 21.2 README: how Kiro was used (specs, steering, hooks, powers, MCP / Playwright visual verification)
  - [ ] 21.3 Final check: public repo includes `.kiro/`, live URL works on phone and desktop
