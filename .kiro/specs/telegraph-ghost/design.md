# Design: The Telegraph Ghost

Companion to [requirements.md](./requirements.md). Every number below is the
value actually used in the code; if a rule here and the code disagree, fix one
of them in the same PR.

## 1. Overview

A haunted 1980s ham radio rendered entirely in the browser with **pure CSS and
inline SVG**: no images, no canvas 3D, no WebGL, no external fonts or assets.
Realism comes from three things applied consistently everywhere:

1. **One light source.** A single overhead key light, slightly upper-left.
2. **Physical depth.** Every raised part casts a layered shadow onto what is
   beneath it; every recessed part has a dark upper wall and a lit lower lip.
3. **Age.** Nothing is clean. Every surface carries wear appropriate to its
   material: grime, scratches, tarnish, patina, fog.

## 2. Architecture

```
main.tsx
└── App                      (REF card open/closed state)
    └── RadioProvider        (global radio state, src/context/RadioContext.tsx)
        └── MorseDecoderProvider  (one shared decoder, src/hooks/useMorseDecoder.ts)
            └── .stage           (shrink-wraps the chassis; positioning context)
                ├── ReferenceCard       z-index 0, BEHIND the chassis
                └── .chassis            z-index 1, 3:4, never moves
                    ├── TopPanel        MCB power | S-meter | DECODER slide
                    ├── LCDDisplay      amber LCD + stain + DustCanvas  (reads the decoder)
                    ├── TuningDial      SOP plate | VFO | badge + serial plates
                    └── TelegraphDesk   REF/CLR | squeeze keyer | TX ARM / TX SEND  (writes the decoder)
```

- **Layout:** the chassis is a 4-row grid (`16fr 26fr 30fr 28fr`). Each panel
  and sub-column is a CSS **size container**, and all internal geometry uses
  `cqw` / `cqh` / `cqi`, so every piece of hardware scales as one unit from a
  412px phone to a desktop.
- **Shared SVG geometry:** pieces with printed artwork (VFO scale, S-meter,
  power and decoder labels) use a fixed-aspect box whose size matches the SVG
  `viewBox`, so HTML hardware and SVG print share one coordinate system.

### 2.1 State (RadioContext)

| Field | Type | Default | Rules |
|---|---|---|---|
| `frequency` | number (MHz) | `88.50` (`FREQ_DEFAULT`) | Clamped to `88.00`–`108.00`, rounded to 0.01; non-finite input ignored |
| `isPowerOn` | boolean | `false` | MCB breaker |
| `isDecoderOn` | boolean | `false` | DECODER slide |

- **Exports:** `RadioProvider`, `useRadio()`, `clampFrequency()`,
  `formatFrequency()` (always 2 decimals), `isTunedTo()` (equal at 0.01 MHz),
  `FREQ_MIN` / `FREQ_MAX` / `FREQ_DEFAULT` / `getGhostFrequency()` (random per session, see 2.2c). Also `isTrapped`, `sessionId` and `hardReset()` (2.2c / 2.2d).
- **Single source of truth:** components never keep a parallel copy of
  frequency. The VFO's angle is *derived* from it, so knob and LCD cannot drift.
- **Local UI state** that nothing else needs stays local: REF card open state
  (`App`), press states (`usePress`), drag state (`useVfoDrag`).

### 2.2 Morse decoder (`useMorseDecoder`)

The paddles (TelegraphDesk) write and the LCD reads, and they are siblings, so
a single engine lives in `MorseDecoderProvider` and both use `useMorseDecoder()`.

| Field | Meaning |
|---|---|
| `currentSymbol` | Dits/dahs of the letter being keyed, e.g. `.-` |
| `decodedMessage` | Decoded text (last 160 characters kept) |
| `handleTap('.' \| '-')` | Append a tap and restart both timers; ignored unless power ON on a transmit frequency (the DECODER does not matter) |
| `clear()` | Wipe everything, and reset the TX annunciator (retune, power off) |
| `clearButton()` | CLR: wipe only the unsent draft if there is one (`discardDraft()`), else `clear()` |
| `draftFrom` | Index in `decodedMessage` where your unsent draft begins (the engine's draft anchor; moves with history trimming, set by `markSent()` on delivery and at both ends of a reply) |
| `sendOver()` | TX SEND: `flush()` the half-keyed letter and the word now (the station hears it at once), then `station.onOver?.()` (Bob ends his over), and drive `txStatus` |
| `txStatus` | `idle` / `sending` / `no-reply` / `inhibit` / `busy` / `empty`, for the LCD annunciator |
| `isActive` | Power ON on the ham band or the ghost's frequency (taps keyed and decoded) |
| `isReceiving` | Another station is sending; paddles locked |
| `station` | `HamStationId` exactly on this frequency, or `null` |
| `status` | `off` (power or DECODER OFF: LCD blank) / `rx-only` / `dead-band` / `ready` |

- **Timers:** every tap clears both timers and restarts them. After the
  letter gap the symbol is looked up in `MORSE_DICTIONARY` and its
  character, or `?`, is appended. After the word gap one space is appended
  (never leading, never doubled) and `onWordEnd(message, { word, wpm })`
  fires. A symbol longer than 7 elements is committed as `?` before the next tap.
- **Adaptive gaps (`adaptiveTimeouts`):** an exponential average (weight 0.3)
  of the tap interval *inside* a letter sets the letter gap to 4x that
  average, clamped to 320–600ms (`MIN_SYMBOL_TIMEOUT_MS` / `SYMBOL_TIMEOUT_MS`);
  the word gap is 2.4x the letter gap, at most 1400ms. Until measured, 600 / 1400.
- **WPM:** `measureWpm(letters, firstTap→lastTap ms)` = CPM / 5, with the last
  letter counted as 0.6 (it has no trailing gap); `null` for 1-letter words.
- **Refs + state:** the symbol is kept in a ref as well as state, so timers
  always read the latest value; timer handles live in refs and are cleared on
  unmount (an effect with `[]` deps that reads the refs directly).
- **DECODER OFF is display-only:** the engine ignores it entirely; the LCD
  hides the buffer row when `status === 'off'`. Losing `canKey` (power OFF,
  tuning off the band) drops the half-keyed letter; power OFF and retuning
  wipe the buffer.
- **LCD overflow:** the buffer viewport is `display: flex; justify-content:
  flex-end; overflow: hidden` with a `flex: 1 0 auto` child. Short text fills
  the row left-aligned; longer text overflows to the *left*, so the newest
  characters stay at the right edge.

- **Word delivery:** `onWordEnd` pushes each finished word onto `draftWords`
  when the DECODER is ON (it waits for TX SEND), or delivers it at once with
  anything still queued when it's OFF. `deliver(words)` calls `markSent()`,
  then the ghost (`CQ` anywhere) or the station's `onWord` word by word,
  stopping at the first answer. The idle poll skips while `hasDraftNow()`.
- **TX SEND flow:** power OFF does nothing (the Quick Start nudges); not
  `canTransmit` → `inhibit`; another station sending (live engine flag, not
  the render-lagged state) → `busy`; nothing keyed since the frequency last
  changed hands → `empty`; else `flush()`, `deliver(draftWords)`, `onOver()` if nobody answered, then `sending`, polled every 100ms: once a reply
  is under way and ≥1.2s has passed → `idle` (RX lights); no reply after
  2.8s → `no-reply`. Notices last 2.2s.

### 2.2a Reply engine (`useMorseDecoder`)

- **`simulateReply(message, isGhost, timing?)`** sets `isReceiving` (paddles locked),
  then walks the message with recursive `setTimeout`s: for each character it
  looks up `CHAR_TO_MORSE`, keys every element (`playTone` / `playGhostTone`),
  grows `currentSymbol` live, then appends the character to `decodedMessage`.
  Spaces are word gaps.
  A reply always starts on a fresh word.
- **Timing (`ReplyTiming`, `src/utils/stations.ts`):** `leadInMs`, `ditMs`,
  `dahMs`, `elementGapMs`, then `charGapMs` / `wordGapMs` as *extra* silence
  on top (so the real character space is element + char gap), and an
  optional `toneHz` passed to `playTone(ms, hz)`. `REPLY_TIMING` (101.00) and
  `GHOST_TIMING` are fixed; `timingForWpm(charWpm, effectiveWpm, leadIn, hz)`
  builds PARIS timing (dit = 1200/WPM) with ARRL Farnsworth spacing when
  effective < character speed. Re-exported from the hook for compatibility.
- **Streaming (`streamReply(chunks, isGhost, timing)`):** the same auto-typer
  fed by an `AsyncIterable<string>`: characters are keyed as they arrive, and
  when the keying catches up it waits (`waiting`) until the next chunk wakes
  it. A generation counter (`replyGen`) makes a cut-off stream inert; the
  promise resolves `true` when everything was keyed, `false` if cut off
  (CLR, retune, power off, another reply). `simulateReply` is a one-chunk
  stream. Every reply ends with a word space. `ReplyTiming.jitter` (0..1)
  stretches or squeezes each element and gap: an irregular fist.
- **Ghost** (see 2.2c) is special-cased in the provider: words on its frequency
  collect into an over (`ghostOver`), sent to the agent on K / KN / AR / SK /
  BK, TX SEND, or 2.5s of silence (`GHOST_OVER_SILENCE_MS`, re-armed while
  you're still keying).
- **Interruptions:** `clear()` (CLR, retune, power off) also stops a reply.

### 2.2b Ham operators (`src/utils/stations.ts`)

Pure logic (no React, no audio), so it is unit-testable. `createStations({ rng, storage })`
returns one stateful object per `HamStationId`:

```ts
interface Station {
  onTuneIn(): Transmission | null            // tuned in / powered up here
  onWord(sent: { word, wpm }): Transmission | null
  onIdle(idleMs: number): Transmission | null // polled
}
interface Transmission { text: string; timing: ReplyTiming }
```

- **Provider wiring:** the stations are created once per app (a ref). An
  effect on `[frequency, isPowerOn]`, placed after the clear-on-retune effect,
  calls `onTuneIn()`. `onWordEnd` routes the word to the station on the
  current frequency. A 400ms interval (`IDLE_POLL_MS`), only while powered on
  a station and not receiving, calls `onIdle(now - lastActivity)`;
  `lastActivity` is touched by taps, word ends, reply ends, tune-ins and any
  idle transmission. Every idle threshold (3.5s and up) is longer than the
  word gap, so a station never interrupts a word in progress.
- **Conversation, not levels:** each operator is a small dialogue state
  machine with varied phrasing (seeded `rng`), so practice happens *inside* a
  QSO. Bulletin = text index. Elmer = stage `greet → ask → lesson ⇄ paused`
  plus `learned` (persisted under `telegraph-ghost.elmer.learned`), `target`,
  `isNew`, `reviewsLeft`, `misses`, `knowsCw`, `nudges`, and a `followUp`
  transmission: the second half of what he's saying, sent by `onIdle` after
  a 1.5s pause (cleared if you start sending). Chat lines use
  `ELMER_CHAT_TIMING` (20/18), lesson lines `ELMER_TIMING` (20/15). Bob = stage
  `call → name → qth → closing` plus the words of the current over (ended by
  K/KN/BK/AR/SK or 3.5s silence). Sam = stage `call → offer → drill`, `wpm`, `group`,
  `met`, `nudges`, `followUp` (1.2s).
- **Discovery:** nothing in the UI lists the operators (the REF card stays a
  Morse helper). The code-practice bulletin, the Elmer and the Quick Start mention them.
- **Text** uses only characters in `CHAR_TO_MORSE` (unit-tested).
- **S-meter:** `TopPanel` reads `isReceiving`; on the ham band the needle
  switches to `keying` (S8 with fast kicks) for the transmission.

### 2.2c The agentic ghost (`src/utils/agentEngine.ts`, provider, `RadioContext`)

```
your over ──► askGhost(heard) ──► GhostSession.turn() ──► GhostBrain.respond() ──► { text } … { climax }
                                     (keyable, ≤64 chars,        live agent (VITE_AGENT_URL, NDJSON/SSE)
                                      climax by reply 4)         | registered / window.__ghostBrain
                                                                 | the persona's local brain (offline)
      tokens ──► streamReply(…, ghostVoice(exchange)) ──► keyed live ──► resolved:
                                                                         reply 1 → setIsTrapped(true)
                                                                         climax  → setIsHaunted(true)
```

- **Wandering frequency:** `GHOST_SPOTS` = every 0.05 MHz step in 88-108
  passing `isGhostSpot` (≥0.50 MHz from `OCCUPIED_FREQUENCIES`, ≥1.00 MHz from
  `DIAL_START_MHZ`); `pickGhostFrequency()` at module load and on every `reseedGhostFrequency()`; `getDetents()` rebuilds the detents around the current ghost.
  `ghostProximity(mhz)` = 1 − d/0.80 inside 0.80 MHz, 0 outside and exactly on it.
- **Proximity audio (`RadioAudio`):** static × (1 − closeness), `setGhostProximity(closeness)`
  → drone gain = closeness² × 0.34 (τ 120ms). The drone and the trap rumble are
  continuous voices built with the engine, silent until raised.
- **Trap:** `isTrapped` + a ref read synchronously by `setFrequency` (refuses).
  `useVfoDrag(…, locked, onSlip)`: while locked, pointer travel goes to `slip`
  (±540°), written as `--vfo-slip` on `.vfo` (direct DOM write) with
  `data-slipping`; `pushTrapRumble(|Δ°| / 240)` accumulates a level that decays
  with τ 0.9s. Released: slip 0, a 750ms overshooting spring back (CSS, only
  while trapped). `TopPanel.onPower`: trapped + ON → off, then after
  `POWER_LOCK_OFF_MS` (1000) back on with `data-forced` (`mcb-jolt`) for
  `POWER_LOCK_JOLT_MS` (450); presses ignored meanwhile.
- **Climax (`useHauntSequence`):** `none → blackout (800ms, setHauntSilence(true))
  → flash (700ms, playHauntBang(), card ejected) → corrupt`. `.stage[data-haunt]`
  drives the LCD (red glass, `HauntGlass`: deterministic seeded cracks + goo-filtered
  drips) and `.haunt-veil[data-phase]` the blackout / flash. The card gets
  `data-eject` → `refcard-eject`.
- **Verified:** unit tests (spots, buffers, grid, randomness, proximity, the
  persona over 4 exchanges, early strike, keyable/short output, remote NDJSON/SSE
  with fallback, registered brain, abort, voice); in the browser with the real
  scripted ghost (proximity levels, live keying, trap, VFO lock + rumble,
  `setFrequency` refused, power lock, the whole-over rule) and with an injected
  brain for the climax (phase timings 800 / 700ms, silence, eject, cracks, drips).

### 2.2d The multi-agent system, latency and the reset

- **Cast:** `createCast()` → `{ guide, stranger, ghost }`, each an `AgentPersona`
  (`systemPrompt`, `identity`, `voice(exchange)`, `cq()`, `localBrain()`,
  `maxExchanges`). The provider keeps `{ session, cast, talks, called }` and
  rebuilds it whenever `RadioContext.sessionId` changes (the reset).
- **Provider:** `agent` = 'ghost' on the ghost's band, else `agentStationAt(f)`.
  Words on an agent's frequency collect in `agentOver` → `askAgent(id, heard)`
  → `createAgentSession(persona)` (lazily, so the brain is chosen then) →
  tokens piped to `streamReply`. `isAwaitingAgent` is true from the request to
  the first text token. The trap and the climax are ghost-only and skipped on a `lost` turn.
  First tune-in on an agent's frequency per session: its local `cq()`.
- **Remote brain:** a 6s timer re-armed on every chunk; a timeout aborts the
  fetch; any failure (no first word, a stall, HTTP error, empty reply,
  network/CORS error) → `{text: 'QSB... QSB... LOST SIG '}` + `{lost}`
  (`DEAD BAND` and no request when `navigator.onLine` is false). A radio-side
  abort (retune) is silent.
- **S-meter:** mode `fading` (S2 ± 5°, slow 180-520ms wanders) while `isAwaitingAgent`.
- **Live broadcasts:** `createBroadcastChain(ctx, dest)` (HP 280 → BP 1 kHz
  Q 0.54 → LP 3.4 kHz → ×2.2 → tanh drive curve → QSB gain ±0.12 at 0.13 Hz →
  level). One `Receiver` (`<audio crossOrigin=anonymous>` +
  `createMediaElementSource`), built on first use after unlock; `tuneBroadcast(url | null)`
  from `RadioAudio` (power ON on 89.30 / 93.50 / 98.10), fading 0.25s; it releases
  the stream 4s after tuning away; status `idle | connecting | live | failed`.
- **Finale:** `useHauntSequence(isHaunted, onEject, onTrip)`: + `trip` at
  blackout + 4000ms after the flash → `playBreakerThunk(false)`, vibrate, `onTrip`
  → `App` puts the card away and `hardReset()` (power off, haunted / trapped off,
  frequency 88.50, `reseedGhostFrequency()`, `sessionId + 1`). Serial: two spans
  in the serial plate, toggled by `.stage[data-haunt='flash' | 'corrupt']`.

### 2.2e The living haunt

- **Unprompted turns:** `AgentTurnInput.event: 'silence' | 'power' | 'dial' | null`
  (`heard` empty; history records `[HAUNT_EVENT_TEXT]`, ignored by `nameFrom`).
  Local ghost: `GHOST_REACTIONS[event]` (+ its archetype's lines for silence);
  strikes if it is the 4th transmission. Route: the bracketed description replaces the words.
- **Scheduler (provider):** while powered on the ghost's frequency, trapped and not
  haunted, a 400 ms poll; if nothing is busy (an agent turn in flight, receiving, a draft,
  an over being collected): a pending reaction (`RadioContext.reportResistance`, from the
  breaker's forced return and the VFO's `onFought` ≥ 60°) after 800 ms, else silence
  after `GHOST_SILENCE_MS[dread]` (∞ / 9 / 7 / 5.5 s). `dread` = the ghost session's
  exchange count, reset each session.
- **Glitches (`useGhostGlitches(active, dread, whisper)`):** one timer; level
  by dread (`GLITCH_LEVELS`: intervals 12-18 / 7-12 / 4.5-8 / 2.5-5 s, kinds), durations
  `GLITCH_MS`; exposed as `glitch` → `.stage[data-glitch]`, a keyed `.glitch-veil`,
  `.lcd__whisper`, S-meter `off` on flicker / brown-out, `playGlitchZap(kind, intensity)`.
  `.stage[data-ghost-tx]` sags the lamp; `[data-dread]` ≥ 2 adds a slow labour.
- **Climax phases:** `build (2600, heartbeat vibration) → blackout (800) → flash (1000) → corrupt → frozen`
  (flash + 4000: `setHauntSilence(true)`, `.stage[data-haunt='frozen'] *` animations paused, the
  chassis and card `pointer-events: none` throughout) → trip at flash + 14000 (unsilence, thunk,
  `hardReset`). Phase selectors for the bleed include `frozen`. Sting: `scheduleHauntSting` +
  the bang; `JUMPSCARE_LIMIT_DB` −3 for `STING_SECONDS`. Aftermath: the provider remembers the
  operator's name across the reset and shows a one-off whisper glitch 1.5 s after the next power-on. `HAUNT_BUILD_DIPS_MS` mirrors `@keyframes haunt-build` and the LCD face
  glimpse keyframes. `playHauntBuild()` (riser, cut at its end), then `setHauntSilence`.
- **Corruption visuals:** `HauntGlass` adds `lcd-crystal` (turbulence displacement)
  pools with `lcd-pool-fill` and an iridescent `lcd-pool-rim`, dead columns, the face;
  `HauntLeak` (outside the glass, under the bezel, `.lcd` lifted to z 3 from the flash).
  Everything animates only from `flash` (gated selectors), since it mounts at `build`.

### 2.3 The dial (`src/constants.ts`)

| Band | Frequencies | S-meter | Decoder | LCD status |
|---|---|---|---|---|
| `broadcast` | 89.30 news, 93.50 sports, 98.10 music (exact) | pinned S9 | blocked | `RX ONLY` |
| `reserved` | 100.65 / 101.35 / 102.05 (exact) | steady S5 carrier | blocked | `RX ONLY` |
| agents (`ham`) | 90.20 Guide, 102.75 Stranger (exact, `AGENT_STATIONS`) | as the ham band | open | cursor |
| `ham` | 100.00 – 103.50 inclusive (operators 0.70 apart: Elmer 100.30, practice 101.00, bulletin 101.70, Bob 102.40, Sam 103.10) | flutters S4–S7; S8 while an operator sends | open | cursor |
| `ghost` | `getGhostFrequency()`, random per session (exact) | slams to +40 dB | open | cursor |
| `dead` | everything else | ~S1, dipping to 0 | blocked | `DEAD BAND` |

`getBandInfo(mhz)` classifies a frequency (exact stations first, then the
range, at 0.01 MHz resolution). Every station has a tuning detent (`DETENTS`:
frequency, `captureMhz`, `escapeMhz`). Broadcasters and the ghost share the
wide 0.20 / 0.32 MHz detent, so the ghost's is not a giveaway; the ham
operators (0.70 MHz apart) get 0.10 / 0.16 MHz, so most of the band between them stays open to tune through. `hamStationAt(mhz)`
names the operator on an exact frequency.

### 2.4 Audio engine (`src/utils/audioEngine.ts`)

```
noise loop (4 s, crackle) ─► bandpass 1 kHz Q 0.9 ─► static gain ─┐
700 Hz sine (always running) ─► key gain (5 ms envelope) ─────────┼─► master 0.8 ─► limiter ─► speakers
clicks: triangle thump (pitch ×0.3 in 30 ms) + highpassed noise ──┘
```

- **Unlocking:** no `AudioContext` exists until the MCB is operated
  (`unlockAudio()` on pointerdown, pointerup, click and key). On touch screens
  pointerdown is not a user activation, so the context resumes on release and
  sounds requested in that gap play if they are under 400ms old.
- **Sidetone:** one persistent oscillator. Keying only reshapes its gain with
  `setTargetAtTime` (τ = 1.67ms, so ~5ms to 95%), retriggering from the
  current level (`cancelAndHoldAtTime`), so fast keying never pops or beats.
- **Static levels** (`STATIC_LEVELS`, relative to dead air): dead 1.0,
  ham 0.5, broadcast 0.2, ghost 0.1, power off 0. Changes are smoothed
  (τ = 40ms), so tuning never zippers. Driven by `<RadioAudio/>`.
- **Foley profiles** (mechanical, so they play whether the radio is on or off, once audio is unlocked):

| Function | Used by | Sound |
|---|---|---|
| `playEncoderThud(heavy?)` | VFO, every 0.05 MHz (heavy = station detent) | crest tick (3.3 / 5.1 kHz) then a soft-contact knock ringing 250 / 700 / 1400 Hz (heavy: 185 / 540 / 1120 Hz + a settle knock ~9ms later) |
| `playBreakerThunk(on)` | MCB | handle rub (grains), latch crack ringing the case (1.2 / 2.3 / 3.6 / 5.2 / 7.6 kHz), stop knock through the rail (210 / 520 / 900 Hz), contacts 6–9ms later (ON), spring ring (2.9 / 4.3 / 6.2 kHz); OFF fires sooner and ~8% lower |
| `playSliderScrape(on)` | DECODER | 55–75ms of stick-slip ticks (speed = sin^0.6) over a faint rub, a rail ring at ~2 kHz, then a detent click + knock |
| `playButtonSnap()` / `playButtonRelease()` | REF, CLR, TX SEND (via `usePress` `onRelease`) | press: dome collapse (2.65 / 4.15 / 6.4 kHz) + two contact bounces + plunger knock; release: the dome popping back ~18% higher, ~0.6x level |
| `playPaperScrape(opening)` | reference card | driven every 4ms by `cardSpeedAt()` (speed from the keyframes): pink-noise friction through a band-pass that opens 600 → 2500 Hz with speed, with random roughness flutter; slot / cabinet body (340 / 780 / 1450 Hz); fibre sheen at speed; stick-slip judder (grains, ~75/s) when crawling; buckle thup + flick at release; landing slap; shaded by a 4.3 kHz low-pass (behind the chassis) |

- **Foley toolkit (`audioEngine.ts`):** `excite()` = a half-sine contact pulse
  (width 0.5 / lowpass Hz: a soft contact is longer and duller; the same
  energy every time) plus 35% noise grain; `resonate()` = band-pass modes,
  each scaled by its Q so the written balance holds; `grains()` = a Poisson
  stick-slip tick train whose rate and level follow a speed profile;
  `contour()` = a gain curve drawn with linear ramps; `ring()` = decaying sines
  for long metallic rings; `room()` = a shared convolver per output (a
  synthesised 0.36s response: early reflections at 2.7–29.5ms, then a tail
  that darkens as it decays), mixed in at 16%. `vary()` / `rand()` jitter every
  play. Measured over 8 renders each, peaks stay within ~1.3–1.6x (natural
  variation), and the spectral balance stays within a few percent.

- **Paper scrape sync:** `src/utils/cardMotion.ts` is the single timeline for the
  card's motion. It sets the CSS animation durations and mirrors the keyframes
  themselves (offsets, `--p` values, timing functions), so `cardPositionAt()` /
  `cardSpeedAt()` give the card's exact position and speed at any millisecond
  (a CSS cubic-bezier evaluator; verified equal to the CSS values at every
  keyframe). Measured: loudness follows speed (r = 0.88 open / 0.92 close). The scrape is triggered by the
  card's own `animationstart` and shifted back by the time the Web Animations API
  says the animation has already run, plus the audio output latency, so the
  silence and the snap land on the visual catch and release.

- **Reading loupe (`ReferenceCard.tsx`):** the card's contents are one `CardSheet` rendered twice: on the card, and inside `.loupe__paper`, a box sized to the card's own `offsetWidth/Height` with `container: refcard / size` (and the card's `--tuck`), so the copy wraps exactly like the card. The loupe is a stage child at z 5 (over the chassis), `pointer-events: none`. Everything during a gesture is a direct DOM write (CSS vars `--lx/--ly/--d/--rim`, the copy's `translate(r - px·z, r - py·z) scale(z)`): no React state, so pointer capture and 60fps tracking are never disturbed by a re-render. Gesture modes: `pending` (touch down) → `loupe` after 170ms without moving beyond 6px, or `drag` if it moves first; mouse presses go straight to `drag`, and mouse hover (buttons 0) drives the loupe. Verified with CDP touch input: the entry under the finger is the entry in the middle of the glass at every point.
- **Testability:** the building blocks take any `BaseAudioContext`, so they are
  verified by rendering into an `OfflineAudioContext` and measuring the samples.

### 2.5 Interaction rules

- **Switches act on pointer-down**, like real hardware, not on click/release.
  Primary button / touch / pen only.
- **Pointer capture or window listeners** keep a press or drag alive when the
  finger slides off the part. Listeners are always removed on release and on
  unmount.
- **Touch:** `touch-action: none` on things you drag (VFO, dust glass,
  reference card); `touch-action: manipulation` on things you tap (switches,
  paddles, buttons). Page scroll, zoom and pull-to-refresh are disabled globally.
- **Decorative parts never take input:** plates, labels and lighting overlays
  use `pointer-events: none`.
- **Accessibility:** every control has a real role (`switch`, `slider`,
  `button`) with `aria-checked` / `aria-valuenow` / `aria-pressed`, a keyboard
  path, and a `:focus-visible` outline (an *outline*, so shadows stay intact).

## 3. Visual rules

### 3.1 Palette

| Material | Colours |
|---|---|
| Void (body) | `#000000` |
| Gunmetal chassis | `#2D2F33` → `#232529` → `#1A1B1E` (160°) |
| LCD backlight | `#D99600` (dimmed from `#FFB000`), hotspot `#E3A52C`, corners `#9C6A00` |
| LCD unlit crystal / lit ink | `#3A2800` / `#050505` |
| Corroded copper | `#8B572A` → `#5C3A21`, verdigris `#2E473B` / `#1A2B22` |
| Tarnished aluminium (paddles) | `#7A7C80` → `#4A4C50` |
| Aged cardstock | `#D4CBB3` |
| Silkscreen ink | `rgba(222, 216, 198, ~0.5–0.62)` |
| Meter paper / red band | `#E9DFC3` → `#D8C9A3` / `rgba(160, 32, 24, 0.85)` |

### 3.2 Gunmetal weathering (`.chassis`, App.css)

The chassis background is one stack of gradients, top layer first:

1. **Corner grime:** four dark radial blooms anchored in the corners, plus an
   edge vignette.
2. **Mottled dirt:** large, faint, irregular radial patches.
3. **Fine scratches:** hairline linear gradients at random angles and sizes
   (light and dark), each confined to its own tile with `no-repeat`.
4. **Noise speckle:** tiny radial dots on **co-prime tile sizes** (7×11,
   13×17, 19×23, 31×29, 47×43 px), so the dots never line up into a visible grid.
5. **Ambient light sweep:** a broad 135° gradient, lit upper-left and falling
   to shadow lower-right, plus a soft side falloff. This gives the whole body
   volume.
6. **Brushed gunmetal:** a top specular sheen, a 115° diagonal sweep and a
   1px horizontal brushing grain over the base gradient.

The edge `box-shadow` gives a lit top/left bevel, a dark bottom/right bevel,
an inner falloff and heavy drop shadows into the void.

**Rule:** any new speckle or texture tile must use a size that is co-prime
with the existing ones, or it will moiré.

### 3.3 CSS-only 3D skeuomorphism

| Technique | How | Used on |
|---|---|---|
| **Visible side wall** | Stacked solid `box-shadow` offsets (`0 1px 0`, `0 2px 0`, … darkening) | VFO knob (7 steps), paddles, MCB block, buttons |
| **Hover / protrusion shadow** | A shared stack: tight ambient occlusion, then wider, softer, *downward-stretched* drops (negative spread) | Paddle arms and thumb-pieces (`--hover-shadow`), VFO |
| **Recess** | Inset shadows: dark upper/left wall, a 1px light catch on the lower/right lip | LCD bezel, VFO collar, button collars, MCB slot |
| **Press** | Interpolate to a flush state *with the same number of shadow layers*, so `box-shadow` animates instead of snapping | Paddles, REF/CLR, TX |
| **Pivot** | `transform-origin` at the hinge plus `rotateY` under a shared `perspective: 300px` | Paddles (see-saw, `--tilt: 16deg`) |
| **Lifted face** | `translateY(-4%)` on the knob top so its side wall shows below it | VFO (`KNOB_LIFT`, §3.6) |

### 3.4 Lighting model

- **Fixed light, moving parts:** highlights and shadows live on
  **non-rotating** layers. The VFO's specular reflection (`.vfo__sheen`) and
  shadows (`.vfo__mount`) never rotate; only the knurl, face and dimple turn
  (`.vfo__knob`). The dimple counter-rotates so its own shading stays true.
- **Environmental reflections, not hotspots:** the VFO shows a soft,
  horizontally stretched band (an overhead strip light), with a faint halo and
  a dim bounce from below. No pin-point white highlights anywhere.
- **Matte where old:** aged parts (paddles, plates, cardstock) get dull
  gradients and **no** specular highlight.

### 3.5 Amber LCD

Stacking inside `.lcd__glass`, bottom to top:

| Layer | z-index | Notes |
|---|---|---|
| Glass background | — | Backlight, scanlines, pixel grid, silt pools, glare |
| Text rows | auto | VT323 (bundled locally), right-aligned over the `888.88` ghost |
| `.lcd__stain` | 1 | **Permanent fog**: milky-brown film, muddy blotches, faint tide marks, pitting, bottom-edge grime. `pointer-events: none` |
| `DustCanvas` | 2 | Wipeable grime (`destination-out`, 45px soft strokes). `touch-action: none` |
| Bezel shadow (`::after`) | 3 | Inset shadow drawn *over* the dust, `pointer-events: none` |

- **Rule:** wiping must reveal stained glass, never a clean, bright screen.
- **Power OFF:** no amber at all; the glass becomes dark grey/black and the
  text hides, but the bezel, stain and dust stay.
- **Power ON:** a 420ms `steps(1)` dying-bulb flicker.

### 3.6 Instrument geometry

- **VFO scale:** 88.00 MHz at 9 o'clock (−90°) to 108.00 at 3 o'clock (+90°),
  9° per MHz, ticks every MHz, labels every 4 MHz.
  - **The pivot is the knob's visible centre:** the scale is drawn around
    `CY = 66 − KNOB_LIFT`, where `KNOB_LIFT = 0.04 × (100 − 2 × 0.03 × 132)` =
    3.68 units, matching `.vfo__well { padding: 3% }` and
    `.vfo__mount { translateY(-4%) }`. Change any of these and the indicator
    misaligns.
  - **The dimple is the indicator:** it sits at 12 o'clock on the face, so its
    bearing equals `--vfo-angle`. Verified: 0.0° error at 88, 92, 98, 104.4 and 108.
- **S-meter:** S1–S9 from −38° to +12° (6.25° per S-unit), `+20` at 26°,
  `+40` at 40°. The rest stop is −44°, the max stop 43°.

### 3.7 Typography

| Use | Face | Treatment |
|---|---|---|
| LCD | VT323, bundled in `/public/fonts` (SIL OFL) | `#050505` ink, `#3A2800` shadow |
| Silkscreen labels | Roboto Condensed / Arial Narrow stack, bold, tracked | Faded off-white; SVG prints eroded by an `feTurbulence` filter |
| Stamped plates | System monospace, bold | Debossed: dark upper wall, light lower lip |
| SOP plate | Condensed sans | Very dark etched print |
| Reference card | Courier Prime / Cutive Mono stack | Faded ribbon ink; margin note in blue cursive |

- **Minimum legible sizes at 412px wide:** SOP 8.1px, serial and model plates
  9.3px, S-meter numbers 8.5px (`+20` / `+40` 7.9px).

### 3.8 Motion

| Part | Timing | Character |
|---|---|---|
| MCB handle | `0.05s ease-in-out` | Spring-loaded snap |
| DECODER slide | `65ms cubic-bezier(0.7, 0, 0.3, 1)` | Detent snap |
| Paddles | 35ms press / 110ms release | Fast thumb, slower spring back |
| Reference card | `1.05s` out / `0.95s` in | Friction keyframes: catches at ~40%, snaps to ~60% |
| LCD warm-up | `420ms steps(1)` | Dying-bulb flicker |
| S-meter needle | Damped spring: `SPRING 380`, `DAMPING 22`, `BOUNCE 0.6` | Twitchy, pegs and bounces |
| VFO detent | per `Detent`: capture 0.20 / escape 0.32 MHz (stations, ghost), 0.10 / 0.16 (ham operators); nearest in range wins | Magnetic capture, harder release |

**Reduced motion:** the long animations (reference card, LCD warm-up, S-meter
needle) honour `prefers-reduced-motion` (skipped or set instantly). The
35–110ms switch and press transitions are kept: they are tactile feedback,
not motion.

## 4. Error handling

- **Out-of-band frequency:** clamped; non-finite values ignored; a dev-only
  warning if `FREQ_DEFAULT` is ever edited out of band.
- **`useRadio()` outside `<RadioProvider>`:** throws with a clear message.
- **Morse tables:** validated against ITU-R M.1677-1 by the `morse-validator`
  power (§5).

## 5. Kiro tooling

| Artifact | Purpose |
|---|---|
| `.kiro/steering/{tech,visual,mobile}.md` | Stack, visual and mobile constraints applied to every session |
| `.kiro/specs/telegraph-ghost/` | This spec: requirements, design, tasks |
| `.kiro/powers/morse-validator/` | Power (`plugin.json`, skill, script) that validates any Morse table against ITU Morse |
| `.kiro/hooks/validate-morse.json` | `PostFileSave` hook that runs the validator (`--strict`) when the agent saves `src/utils/morseDictionary.ts`, the single source for the decoder and the reference card |

## 6. Testing strategy

- **Type safety:** strict `tsc --noEmit` over all of `src/`.
- **Visual verification:** every visual change is rendered in headless
  Chromium via the Playwright power at **412×915** (phone) and **1280×800**
  (desktop), screenshotted, and *measured*: element boxes, fit and overflow,
  computed styles, frame-by-frame animation sampling, and geometry checks such
  as dimple-to-tick bearing error.
- **Behaviour:** pointer, keyboard and timing tests drive the real components
  (drag profiles, detent capture and escape, needle traces, press transforms).
- **Data:** `validate-morse` with fixtures for each failure class
  (wrong code, shared code, empty, invalid symbols, duplicates, missing).
- **Known gap:** the app has not yet been built or run with the real React
  runtime (npm was unavailable in the build sandbox). This is task 9 in tasks.md.
