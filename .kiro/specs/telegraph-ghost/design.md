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
  `FREQ_MIN` / `FREQ_MAX` / `FREQ_DEFAULT` / `GHOST_FREQUENCY` (`104.40`).
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
| `handleTap('.' \| '-')` | Append a tap and restart both timers; ignored unless power ON and DECODER ON |
| `clear()` | Wipe everything (CLR) |
| `isActive` | Power ON and DECODER ON |

- **Timers:** every tap clears both timers and restarts them. After 600ms
  (`SYMBOL_TIMEOUT_MS`) the symbol is looked up in `MORSE_DICTIONARY` and its
  character, or `?`, is appended. After 1400ms (`WORD_TIMEOUT_MS`) one space is
  appended (never leading, never doubled). A symbol longer than 7 elements is
  committed as `?` before the next tap.
- **Refs + state:** the symbol is kept in a ref as well as state, so timers
  always read the latest value; timer handles live in refs and are cleared on
  unmount (an effect with `[]` deps that reads the refs directly).
- **Switching off:** DECODER OFF drops the half-keyed symbol and stops the
  timers (the message is kept, but hidden). Power OFF wipes the buffer.
- **LCD overflow:** the buffer viewport is `display: flex; justify-content:
  flex-end; overflow: hidden` with a `flex: 1 0 auto` child. Short text fills
  the row left-aligned; longer text overflows to the *left*, so the newest
  characters stay at the right edge.

### 2.3 The dial (`src/constants.ts`)

| Band | Frequencies | S-meter | Decoder | LCD status |
|---|---|---|---|---|
| `broadcast` | 89.30 news, 93.50 sports, 98.10 music (exact) | pinned S9 | blocked | `RX ONLY` |
| `ham` | 100.00 – 102.00 inclusive | flutters S4–S7 | open | cursor |
| `ghost` | 104.40 (exact) | slams to +40 dB | open | cursor |
| `dead` | everything else | ~S1, dipping to 0 | blocked | `DEAD BAND` |

`getBandInfo(mhz)` classifies a frequency (exact stations first, then the
range, at 0.01 MHz resolution). All four stations share the tuning detent
(`DETENT_FREQUENCIES`), so the ghost's detent is not a giveaway.

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
| `playEncoderThud(heavy?)` | VFO, every 0.05 MHz (heavy = station detent) | steel ball dropping into a detent: pitch drop + dull 470 Hz knock through a lowpass, centroid ~240 Hz |
| `playBreakerThunk(on)` | MCB | "KA" latch snap, then "CHUNK" 34ms later (165→52 Hz thump + impact), metallic ring tail (1.9–5.6 kHz partials) |
| `playSliderScrape(on)` | DECODER | 130ms gritty bandpassed noise sweeping up (ON) or down (OFF), ending in a detent tick |
| `playButtonSnap()` | REF, CLR, TX SEND | snap-dome flip (highpassed noise) + plunger knock + 3.2 / 4.7 kHz spring ring |
| `playPaperScrape(opening)` | reference card | bandpassed fibrous noise following the card's friction keyframes |

- **Paper scrape sync:** `src/utils/cardMotion.ts` is the single timeline for the
  card's motion. It sets the CSS animation durations, and its stick / release /
  settle points mirror the keyframe percentages. The scrape is triggered by the
  card's own `animationstart` and shifted back by the time the Web Animations API
  says the animation has already run, plus the audio output latency, so the
  silence and the snap land on the visual catch and release.

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
| VFO detent | `SNAP_RANGE 0.20`, `SNAP_STICKINESS 0.12` MHz | Magnetic capture, harder release |

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
