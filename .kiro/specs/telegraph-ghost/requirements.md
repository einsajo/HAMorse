# Project: The Telegraph Ghost
# Goal: Build a cross-platform, highly skeuomorphic haunted HAM radio with mechanical Morse code paddles and a contextual AI ghost.
# Contest: Kiroween 2026 Track 4 (Costume Contest)

## 1. Global Layout & Cross-Platform Scaling
- **The Boundaries:** The `<body>` background is absolute pitch black (`#000000`) to swallow any unused screen space. The page never scrolls, zooms or pulls to refresh.
- **The Radio Chassis:** A self-contained, centralized container strictly using `aspect-ratio: 3 / 4; max-width: 100vw; max-height: 100vh; margin: auto;`. The chassis is **stationary at all times**; nothing ever moves it.
- **The Stage:** The chassis sits inside a `.stage` wrapper that shrink-wraps it exactly. The stage gives the reference card (Section 2e) a place to hide *behind* the radio.
- **Styling:** A heavy, dark, aged 2D brushed-gunmetal military device (`#1A1B1E` to `#2D2F33`) built only from CSS `linear-gradient` / `radial-gradient` / `box-shadow`. The finish shows decades of wear: corner grime, ingrained dirt, fine scratches, faint speckle noise and a broad diagonal ambient light sweep. No external images; all textures are pure CSS (plus inline SVG for printed scales).
- **Typography:** Printed labels are worn, faded off-white silkscreen ink. The LCD uses the bundled local VT323 pixel font (`/public/fonts`, SIL OFL); there are no network font requests.

## 2. The 3:4 UI Architecture (Top to Bottom)

### 2a. Top Panel (3 columns: Power | S-Meter | Decoder)
- **Left (MCB Power Switch):** A heavy-duty MCB (Miniature Circuit Breaker) style MAIN POWER switch.
  - A chunky, aged charcoal phenolic block with moulded cooling ribs and recessed brass screw terminals at the top (line) and bottom (load).
  - A deep vertical slot with a ribbed black handle that **throws vertically**: down = OFF, up = ON. The handle carries a printed trip stripe.
  - Worn `ON` / `OFF` labels beside the throw, plus an unlit dark-red faceted glass LED jewel labelled `PWR`.
- **Center (Analog S-Meter):** An inset signal-strength meter.
  - A pressed-steel bezel around a deeply recessed glass window, with heavy inset shadows and glass glare.
  - Aged cream/paper dial with a faint amber backlight bleed from below, matching the LCD.
  - An arched printed scale: black S1 to S9 (labelled 1, 3, 5, 7, 9) and a red `+20` / `+40` band.
  - A thin, physical red needle driven by a damped-spring model with bouncing end stops (`--needle-angle`):
    - **Power OFF:** rests at zero on the left stop.
    - **Broadcast stations (89.30 / 93.50 / 98.10):** pinned at S9 with a slight carrier waver.
    - **Ham band (100.00-103.50):** flutters actively around S4-S7.
    - **A ham operator sending to you:** a strong, close signal kicking around S8 (`keying` mode) until the transmission ends.
    - **Ghost frequency (wandering, see 3c):** slams to the +40 dB stop, bounces, then stays pinned.
    - **Dead air (everywhere else):** drops to around S1, dipping toward 0.
    - Later (Phase 3): tracks the received audio level.
- **Right (Decoder Switch):** A horizontal slide switch labelled `DECODER` above it, with `OFF` on the left and `ON` on the right.
  - A ribbed, tarnished-aluminium actuator **slides horizontally** in a deep slot on a raised steel plate between the two states (`--slide`: 0 = OFF, 1 = ON).

### 2b. Display Panel (The Amber LCD)
- A wide, deeply inset amber screen (`#FFB000` family, dimmed to `#D99600`; `box-shadow: inset 0 0 15px rgba(0,0,0,0.8)`) in a recessed bezel.
- **Glass:** 1px scanlines, a pixel grid, and an unlit `#3A2800` crystal ghost layer. Text is a viscous `#050505` pitch.
- **Normal Mode:** The top half shows the frequency. The bottom half shows the text buffer (English translations of user inputs and AI replies).
- **Interactive Dust:** A translucent grime canvas sits on the glass, under the bezel shadow. Swiping wipes it away with soft-edged `destination-out` strokes (`touch-action: none`).
- **Power state:** With the MCB OFF the backlight is dead (dark glass, no text); the bezel, stain and dust stay visible. Switching ON plays a brief dying-bulb warm-up flicker. The backlight is a dimmed, aging amber (`#D99600`).
- **Frequency:** Shows the live global frequency, always formatted to two decimals and right-aligned over the `888.88` segment ghost.
- **RX / TX annunciators:** printed `RX` and `TX` flags in the top-left corner of the glass, always faintly visible like unlit segments; lit, they become dark reverse blocks with the backlight showing through. A short message sits beside them. They are status, not decoded text, so they show with the DECODER OFF too, and they never move the frequency digits.
  - `TX SEND` + dots counting up `.` `..` `...` and repeating (steps, 1.2s cycle; static with reduced motion) while your over goes out, for at least 1.2s, until the far end starts answering.
  - `RX` lights while another station is sending (TX owns the display while `TX SEND...` is up).
  - Notices, blinking for 2.2s: `NO REPLY` (nobody answered within 2.8s), `INHIBIT` (TX on a broadcaster or dead air), `BUSY` (the other station is still sending), `NO MSG` (nothing keyed since the frequency last changed hands). CLR, retuning and power OFF clear them.
- **Permanent stain:** An un-wipeable fog/stain layer sits between the text and the dust canvas, so wiping reveals stained glass, never a clean screen.
- **No LCD reference mode.** The REF button does NOT change the LCD (see Section 2e).

### 2c. Tuning Panel (3 columns: SOP Plate | VFO | Plate Stack)
- **Plate material:** Every plate is aged, corroded copper (`#8B572A` / `#5C3A21`) with verdigris patina (`#2E473B` / `#1A2B22`), fastened with four tarnished brass / rusted screws. There is no inner border; the text sits directly on the metal. All plates use `pointer-events: none`, so they never block the dial.
- **Left (SOP Manual):** A single tall copper plate matching the dial's height, printed in small, dark, etched sans-serif:
  - `OPERATING INSTRUCTIONS:`
  - `1. ROTATE VFO FOR TUNING.`
  - `2. USE MORSE TX (DECODER AVAIL).`
  - `3. REF CARD INCLUDED.`
  - `WARNING: AVOID INTERRUPTING BROADCASTS.`
- **Right (Stacked Plates):** Two small stamped copper plates stacked vertically: the `HAMorse` / `HM-13` brand badge on top, with the serial plate `SER: 1984-K1R0` directly underneath.
- **Center (VFO Knob):** A massive, heavy machined-steel rotary dial.
  - High-contrast knurled grip, a dished face with a soft, stretched overhead reflection, and a deep concave finger dimple (no etched indicator line).
  - A thick side wall and a heavy multi-layer drop shadow make it protrude far above the chassis.
  - **Rotary encoder, not a button:** the knob never moves on the Z axis.
  - **Drag to tune:** pointer drag around the knob centre rotates it through 180 degrees with hard stops: 9 o'clock (-90 degrees) = 88.00 MHz, 3 o'clock (+90 degrees) = 108.00 MHz (9 degrees per MHz). The knob turns with the power off; the frequency is only visible once the MCB is ON.
  - **Exact indicator:** the finger dimple sits at 12 o'clock on the face, so it points exactly at the printed tick for the current frequency.
  - **Magnetic detents (per station, `DETENTS` in `src/constants.ts`):** broadcasters and the ghost capture within 0.20 MHz and release beyond 0.32 MHz; the five ham operators (0.70 MHz apart) capture within 0.10 and release beyond 0.16 MHz, so the open band between them stays tunable. Capture zones never overlap.
  - **Keyboard:** arrows +/-0.05 MHz, PageUp/PageDown +/-1 MHz, Home/End jump to the band edges. Exposed as an ARIA slider.
  - The dial container uses `touch-action: none`. Rotation is driven by `--vfo-angle` (derived from the global frequency), with lighting on non-rotating layers.
- **Frequency Scale:** A worn, faded white silkscreen scale printed on the chassis around the upper half of the knob: ticks every 1 MHz from 88 (9 o'clock) to 108 (3 o'clock), labelled every 4 MHz.

### 2d. Telegraph Desk (3 columns: Utility | Squeeze Keyer | TX)
- **Left (Utility Buttons):** Two small circular tactile push switches stacked vertically, `REF` and `CLR`, with worn silkscreen labels. They press downward.
  - `REF` latches partly down while the reference card is out.
  - `CLR` clears the buffer.
- **Center (Horizontal 'Iambic Squeeze' Keyer):** A Bencher-style keyer on a mid-tone gunmetal base plate.
  - A heavy, dark, solid metal central post: clean metal, with no contact dots.
  - Two long horizontal levers face inward toward the post: `DIT` on the left points right, `DAH` on the right points left. Each pivots from a fixed dark block at its outer (rear) end.
  - **Arms:** Flat, thick bars of brushed, tarnished aluminium (not cylinders), with oxidised edges and a visible side wall.
  - **Thumb-pieces:** Wide, vertical, heavily worn, textured black bakelite, rubbed through to brown where thumbs press.
  - **Depth:** A multi-layer shadow (tight ambient occlusion plus wide, soft, downward drop shadows) so the levers hover above the plate.
  - **Press (3D pivot):** Pressing pivots a lever like a see-saw **down into the desk on the Z axis**. `transform-origin` sits at the rear hinge (left edge for DIT, right edge for DAH), and `rotateY` under a shared `perspective` lets the thumb-piece end sink while the rear stays pinned. The hover shadows collapse to a flush contact shadow, and the lever darkens with depth.
  - Pointer-event state with a CSS `:active` fallback; each lever tracks its own pointer, so both can be squeezed at once. `touch-action: manipulation`.
- **Right (TX):**
  - **TX SEND:** Sends what you've keyed and hands the frequency over, like ending an over with `K`. **With the DECODER ON nothing is sent without it:** finished words wait on the LCD as an underlined draft (annunciator `PRESS TX`) so a beginner can check them first. With the DECODER OFF (keying by ear) each word still goes out when you pause, and TX SEND sends at once. Feedback is on the LCD's TX annunciator (Section 2b). A circular push button **resized to exactly the REF/CLR footprint**: a dark knurled housing with a faded red ring and a deeply inset dark-red glass lens, with a realistic pressed state.
  - **TX ARM:** A guarded "missile" safety toggle above TX SEND, mirroring REF over CLR for symmetry. A hinged, faded-red translucent cover sits closed over a small bat toggle, on a yellow/black hazard-striped steel plate.

### 2e. Reference Guide (Physical Cardstock Manual)
- **Trigger:** The `REF` button toggles a **physical, slide-out cardstock manual from behind the stationary chassis**. It is NOT an LCD mode.
- **Placement:** The card is layered *behind* the chassis (lower z-index), tucked underneath it. Only the card moves; the chassis never does.
- **Motion:**
  - **Portrait/mobile:** The card slides UP from behind the top edge into the empty space above the radio.
  - **Wider than 3:4 (desktop/landscape):** It slides OUT to the right into the empty space beside the radio.
  - **Friction:** Friction keyframes (~1s) make the card catch at ~40%, strain, then snap to ~60% before gliding the rest of the way. Reduced motion skips the stutter.
- **Material:** Heavy, aged, yellowed cardstock (`#D4CBB3`) with faint paper noise, darkened dog-eared corners and dark grease smudges.
- **Content:**
  - A faded dark-grey typewriter (monospace) grid of A-Z and 0-9 Morse code.
  - A Q-code section: `CQ: Calling any station`, `QRT: Stop transmission`.
  - A faded blue handwritten margin note: `Dial drifts below 90MHz in the cold. - Nevlin`.
  - The card is a Morse helper only. It does **not** list the ham band operators: you find them by tuning around (and from the code-practice bulletin), like a real ham, and a list would shrink the Morse table.
- **Closing:** Tap the card, press `REF` again, or drag the card back toward the radio.
- **Reading loupe (the card is small on a phone, and not large on a desktop):** a round magnifier, no handle, that shows the real card magnified so the type reads at ~22px.
  - **Touch:** press and hold the card for 170ms and the loupe appears just above the fingertip (below it near the top of the screen), never under the finger and always fully on screen; slide to read; lift to put it down (the card stays out). A quick tap still puts the card away, and a quick swipe toward the radio still closes it. A light haptic tick on Android.
  - **Mouse:** the loupe follows the pointer over the open card (the pointer is hidden: the loupe is the pointer); leaving the card hides it; a click still puts the card away.
  - **Zoom:** 22px ÷ the card's type size, between 1.8× and 3.4× (2.2× on a 412px phone, 2.6× at 360px, 1.8× on desktop). Diameter 46% of the short screen side, 150–230px.
  - **Look:** blackened, lathe-turned gunmetal rim with bevel highlights; glass with glare, edge vignette and a faint colour fringe; floats over the radio with a soft shadow; pops in (scale 0.82 → 1, no animation with reduced motion). **Our marks:** `HAMorse · HM-13 READING LOUPE · 2.2×` engraved in the rim in the radio's silkscreen paint (live zoom factor), index ticks, and the S-meter needle's red at 12 o'clock.
  - **Hint:** a red rubber stamp in the card header, `HOLD TO MAGNIFY` (touch) / `HOVER TO MAGNIFY` (mouse), with a drawn lens icon.

### 2f. Quick Start Guide (before the first power-on)
- **Trigger:** using a control that needs power (DIT / DAH, DECODER, CLR, TX SEND, or releasing the VFO) before the radio has ever been switched on. REF and the dust wipe never trigger it (they work unpowered).
- **Look:** a yellowed cardstock "QUICK START" note taped over the radio in typewriter type, with a pencil "start here" arrow. The chassis dims around a spotlight on the MAIN POWER breaker, which pulses with a soft amber glow (under 1 flash per second).
- **Content:** explains the trainer (power, tuning and the HAM band, where operators can be met by tuning around, with the Elmer on 100.30 for newcomers; DIT/DAH and the 700 Hz tone; DECODER ON shows text vs OFF for ear training while the radio keeps working; REF and CLR) and why sound needs the power on. It never mentions the haunt.
- **Actions:** `[ THROW MAIN POWER ]` performs the breaker's own action (thunk, audio unlock, power ON); `[ GOT IT ]` or Escape closes it. After it is dismissed, later attempts only make the breaker glow briefly. The first power-on retires it for the session.

## 3. Core Mechanics & Audio
- **Audio Engine:** `AudioContext` remains suspended until the MAIN POWER MCB is thrown ON.
- **Static:** Continuous white noise (with sparse crackle) through a ~1 kHz bandpass, like muffled AM static. Loudness follows the band: dead air 100%, ham band 50%, broadcasters 20%, and only 10% on the ghost's frequency, so the ghost station is eerily quiet and clear. Silent when the power is OFF.
- **Sidetone:** A 700 Hz sine with a 5ms attack and 5ms release (no pops): DIT 60ms, DAH 180ms. It sounds whenever you key on the ham band or the ghost's frequency with the power ON, including with the DECODER OFF, so practised users can train by ear. Other operators come through the same sidetone at their own beat note (620-820 Hz), as on a real receiver; your own keying is always 700 Hz.
- **Mechanical Foley (synthesised, no files), physically modelled so it never sounds like a synth:** a strike (a contact pulse with a little noise grain) rings a bank of resonators tuned to the parts (dome, case, panel); friction is a stream of stick-slip ticks whose density and loudness follow the part's speed; every play is jittered (pitch, level, timing) so no two presses match; all of it plays into a small synthesised room. The MCB: handle rub, latch crack ringing the phenolic case, the stop knocking through the DIN rail, the contacts closing (ON only), a faint spring ring. The DECODER slide: stick-slip ticks along the rails into a detent click. REF / CLR / TX SEND: a click going down (dome collapse, contact bounce, plunger knock) and a lighter, higher one coming back up; the VFO a ball tipping over a crest and knocking into its pocket every 0.05 MHz (muffled, about half its energy below 1 kHz so phones still play it; firmer, with a settle, at a station). The reference card is driven millisecond by millisecond by its actual speed, computed from the same keyframes as the CSS animation: rough pink-noise paper friction whose loudness and brightness follow the speed (dull when slow, airy when fast), the slot and cabinet resonating behind it (~340 / 780 / 1450 Hz), stick-slip judder whenever it crawls (easing into the catch and during the strain wobble while stuck), a low buckle "thup" and edge flick as it breaks free, then a soft slap as it lands (or a dull tap as it tucks home); shaded a little, since it is behind the chassis. Until the MCB has been operated no audio exists at all (autoplay policy).
- **Morse Paddles:** Pressing DIT or DAH keys a dit (`.`) or dah (`-`) the instant the lever goes down (and, in Phase 3, a 700Hz `OscillatorNode` sidetone). The levers always move; taps are keyed and decoded whenever the radio is powered and on a transmit frequency. The DECODER only controls the display.
- **Reserved receive-only slots (`RESERVED_RX_FREQUENCIES`):** 100.65, 101.35, 102.05, 102.75, one midway in each gap between operators, kept for content to be mapped later. For now each is a silent carrier: band `reserved`, the S-meter steady at S5, static at 35%, the LCD `RX ONLY`, keying does nothing, TX SEND → `INHIBIT`. Each has a narrow detent; the rest of each gap stays open band.
- **The dial (`src/constants.ts`):** broadcasters at 89.30 (news), 93.50 (sports), 98.10 (music) are receive-only; the ham band 100.00-103.50 (inclusive) and the (wandering) ghost frequency allow transmitting; everything else is dead air. Every station (broadcasters and the ghost) has a magnetic tuning detent, so the ghost's detent gives nothing away.
- **Decoder gating:** taps are keyed and decoded only on the ham band or exactly on the ghost's frequency, with the power ON (DECODER ON or OFF). On a broadcaster the LCD shows a faint blinking `RX ONLY`; on dead air `DEAD BAND`. The paddles still move.
- **Retuning:** any frequency change instantly clears the decoded message, the half-keyed letter and any unsent draft.
- **Draft (DECODER ON):** your unsent words are underlined (dotted) on the LCD and the annunciator pulses `PRESS TX`. Stations never transmit unprompted (CQ, nudges, the next bulletin) while a draft is waiting. `CLR` wipes only the draft the first time (fix a mistake, keep the conversation); with no draft it clears the screen.
- **Timing:** Gaps are measured from the last tap. They start generous for beginners (600ms of silence ends a letter, 1400ms a word: one space, never leading or doubled) and **adapt to the operator** like a real CW decoder: the letter gap is ~4x the running average of the tap interval inside a letter (never below 320ms), and the word gap is 2.4x the letter gap (at most 1400ms). A fast operator is therefore not capped at ~12 WPM.
- **Dictionary:** `src/utils/morseDictionary.ts` is the single source of truth (ITU A-Z, 0-9, plus the CQ / QRT Q-codes). The decoder and the reference card both read it, and the `morse-validator` power checks it on every save.
- **Decoder:** When the DECODER slide switch is ON, the buffer translates to English on the LCD, followed by the live dits/dahs of the letter being keyed and a blinking cursor. Unknown codes show as `?`. Once the text is wider than the glass, the oldest characters are hidden on the left so the newest are always visible. When it is OFF, the LCD text area is blank, **and that is all it does**: keying, decoding and every station's replies carry on unseen (for copying and sending by ear), and switching it back ON shows the whole conversation so far. `CLR` clears the buffer; power OFF wipes it.
- **VFO Dial:** Dragging the dial circularly updates the LCD frequency (88.00 - 108.00). The radio powers on at a dead 88.50 MHz, so the player has to search for the station.
- **S-Meter:** The needle tracks the received audio level.

## 3a. Interactive Transmissions (the reply engine)
- **Incoming replies** are keyed out loud element by element (you hear every dit and dah), shown live on the LCD as they build, then committed letter by letter. While another station is sending, the paddles are locked out and the LCD cursor is hidden. CLR, retuning or power OFF cut a reply off.
- **Tutor, 101.00 MHz** (a practice station inside the ham band, with its own tuning detent): when your last word is `HI` it answers `GUD COPY. SEND SOS`; when it is `SOS` it answers `FB. 73.` (fine business, best regards). Brisk, clean 700 Hz: 60/180 ms dit/dah, 150 ms between characters.
- **Ghost (wandering frequency):** its replies come from an agent, streamed and keyed live: see Section 3c.
- Replies trigger on a whole *word* you send (so `CHI` is not `HI`): with the DECODER ON when you press TX SEND, with it OFF when you pause after the word. A station answers the first word of your over it has something to say to.

## 3b. The Ham Band Operators (beginner to pro)
Five operators live on the ham band (`src/utils/stations.ts`; frequencies in `HAM_STATIONS`), **0.70 MHz apart with empty band between them** (static, nobody there) so tuning from one to the next feels like searching a real band; the Elmer is the first you reach tuning up from the broadcasters. They must feel like **people on the air, not a level-up game**: they greet you, ask questions and react to your answers, vary their wording, talk you through mistakes, remember you when you come back, sign off when you send 73, and point you at each other. Nothing in the UI lists them; you discover them by tuning (the 101.70 code-practice bulletin mentions them, as real bulletins do). Each hears you tune in, every word you finish (with your measured sending speed) and how long the band has been quiet. Each answers with real Morse timing (Farnsworth where noted: ARRL t_a = (60c - 37.2s)/(sc)), in its own beat note. Names and places are fictional and nobody uses a callsign (real callsigns identify real people).

| MHz | Who | Level | Behaviour |
| --- | --- | --- | --- |
| 100.30 | The Elmer (mentor) | Beginner, sending | **Introduces himself before anything else**, each step its own short over with a 1.5s pause: `GE. DE ELMER. I AM AN OLD CW OP.` → `I HELP NEW OPS. R U NEW TO CW? Y OR N K`. You answer with **one letter** (Y / YES / R / OK, or N). Yes → he chats (`FB. GLAD U CAME BY. I SEND A LTR, U SEND IT BACK.`) → only then the first letter (`1ST LTR IS E. E IS 1 DIT. SEND E K`). No → `FB OM. TRY BOB ON 102.40 FOR A QSO, OR SAM ON 103.10 FOR SPEED. OR WORDS WID ME.` → words. Anything else → `SRI, I NEED Y OR N`; silence for 15s → `NO RUSH. IF U R NEW, TAP 1 DIT K` (a dit, E, counts as yes); answering early skips the question. Then characters shortest-first with reviews, varied praise, talk-through of mistakes (`NOT QUITE. A IS DIDAH. TRY AGN K`), milestone remarks, `HI HI`, `73` → `73 ES GL. CU AGN SK`, welcome back (`GE. WB. NICE TO HEAR U AGN. LAST TIME U GOT TO N.`, localStorage), `STILL THERE?` after 25s (twice at most). Chat at 20/18 WPM, lessons at 20/15. |
| 101.00 | Practice station | First contact | `HI` -> `GUD COPY. SEND SOS`; `SOS` -> `FB. 73.` (unchanged). |
| 101.70 | Code-practice bulletin | Beginner, listening | Starts on tune-in with `VVV ...`; rotates eight practice texts (pangram, Q-codes, numbers, and who else is on the band) at 18/8 WPM with 4s pauses. Never answers. |
| 102.40 | Bob, ragchewer | Intermediate | Calls `CQ CQ DE BOB BOB K` on tune-in, then every 30s while idle. Your over ends with `K`/`KN`/`BK`/`AR`/`SK` or 3.5s of silence. Then: `GE. UR RST 579. NAME BOB. UR NAME? K` -> `FB {NAME}. QTH OHIO. UR QTH? K` -> `FB. {QTH}. TNX QSO {NAME}. 73 SK` -> (your 73) `E E`. Procedure words never count as a name or place (`SRI. UR NAME? K`). Tuning in restarts the QSO. 18/13 WPM. |
| 103.10 | Sam, high-speed op | Pro | Calls `CQ QRQ CQ QRQ DE SAM K` (every 40s). Answer him and he **says hello and asks first**: `GE OM. DE SAM. TNX FER CALL.` → (pause) `WANT SOME SPEED PRACTICE? Y OR N K`. Y → `FB. I SEND 5 LTR GRPS, U SEND THEM BACK. 20 WPM.` → `GRP ...`; N → `OK OM. TNX FER QSO. 73 SK`. Right: `SOLID CPY. UR {your WPM}WPM. QRQ {+2}. GRP ...`; one character off: `CLOSE. QRS {-2}. AGN GRP {same}`; otherwise `NIL. ...`. 15-40 WPM (`TOP SPEED HI`). `QRS` slows him; `?`/`AGN` repeats; `73` → `TU FER PRACTICE. 73 SK`; next time `WB OM. WANT SOME SPEED PRACTICE?`. Best with the DECODER OFF. |

- Your sending speed: WPM = characters per minute / 5, timed from the first tap of the word to the last.
- Retuning or power OFF cancels any transmission; the next tune-in restarts the station's greeting / call.


## 3c. The Agentic Ghost (the wandering frequency and its brain)
- **The wandering ghost:** `GHOST_FREQUENCY` is chosen at random every time the app loads (`pickGhostFrequency`), on the dial's 0.05 MHz grid, within 88.00-108.00. It stays at least **0.50 MHz** from every broadcaster, operator and reserved slot (which rules out the whole ham band) and **1.00 MHz** from the 88.50 power-on spot. It keeps a broadcaster's wide detent (0.20 / 0.32 MHz).
- **Finding it by ear (proximity audio):** within **0.80 MHz**, the static fades out in proportion to closeness and a low, detuned drone fades in (by the square of the closeness, so it creeps in).
  - The drone: saws at 55 / 55.7 Hz beating, a flat fifth (82.1 Hz), a sub (36.7 Hz), a drifting tritone (77.8 Hz), and a thin detuned hum at 220 / 221.3 Hz so phone speakers can play it, all through a slowly breathing resonant low-pass.
  - **Exactly on the frequency the drone stops dead**, the static drops to its eerie 10%, and the S-meter pins at +40 dB.
- **The brain (`src/utils/ghostAgent.ts`) is pluggable:**
  - **A live agent** at `VITE_GHOST_AGENT_URL`: an LLM behind a serverless proxy or an MCP / agent bridge, so the browser never holds a key. The endpoint receives `{ system: GHOST_PERSONA_PROMPT, exchange, heard, history, maxExchanges }` and streams NDJSON or SSE lines: `{"text":"..."}` tokens, and `{"climax":true}` when the ghost strikes.
  - **One plugged in at runtime:** `registerGhostBrain(brain)` / `window.__ghostBrain`.
  - **Otherwise, the scripted ghost:** the same persona as a state machine, streaming its reply token by token after a "thinking" pause, like an LLM. It is also the fallback whenever a live agent fails before its first word, so the ghost never goes silent.
- **Persona:**
  - Reply 1: a perfectly normal ham (`GE OM. UR 599 HR. FB SIG. NAME? K`).
  - Reply 2: polite but wrong (it's late, are you alone, your name repeated).
  - Reply 3: erratic and obsessive (it hears you breathing, won't let you tune away), with stuttered and garbled words.
  - Reply 4: it strikes.
  - Trying to leave (73 / SK / QRT / SOS) after the first exchange makes it strike at once. It uses your name against you.
- **Its voice sours:** reply 1 is a clean, ordinary tone at 18/15 WPM with a steady fist. From reply 2 it uses the distorted ghost tone, slower, with an increasingly irregular fist (timing jitter 0.18 → 0.38 → 0.6).
- **Streaming:** the agent's tokens are piped straight into the reply engine (`streamReply`). Each character is keyed and typed on the LCD as soon as it arrives, while the agent is still writing.
- **It hears your whole over:** your words collect until you end the over (`K` / `KN` / `AR` / `SK` / `BK`), press TX SEND, or go quiet for 2.5s.
- **Session rules (whatever the brain):** only Morse-keyable text (A-Z 0-9 space . , ? /), at most 64 characters per reply, and the climax by the 4th reply at the latest.
- **The trap (`RadioContext.isTrapped`):** set after the ghost's first reply.
  - **VFO lock:** `setFrequency` refuses every change, so the LCD stays on the ghost. The knob still turns under the finger (a slipping clutch, `--vfo-slip`) and springs back, overshooting, when released.
  - **Trap rumble:** every degree of forced travel builds a low grinding rumble from the cabinet (brown noise, a 230 Hz groan band, a 41 Hz growl chopped at 7 Hz). It grows the longer you fight and dies away when you stop. The arrow keys don't help either.
  - **Power lock:** switching the breaker OFF works for a moment: the handle snaps down and the screen dies. 1s later the breaker slams itself back ON (a hard snap, a jolt of the whole block, a haptic buzz) and the screen powers back up. Presses during that time are ignored.

## 4. The Haunt Sequence (The Track 4 UI Scare)
- **Trigger:** the ghost's agent strikes (`{"climax":true}`, or its 4th reply). Once that reply has been keyed, `isHaunted` becomes true.
- **Blackout (800ms):** a black veil over everything, and **total silence**: the master output is cut, so no static, no drone, nothing.
- **The flash:** ONE blinding white flash, fading over 0.7s. A single flash stays inside the 3-flashes-per-second photosensitive limit; with reduced motion it is dimmer and softer.
  - **BANG:** deafening and metallic: a body blow through the cabinet, a crack, falling debris, and a long inharmonic ring of steel.
  - **Screech:** mixed in, a high-pitched **2000 Hz feedback howl** (two beating sines, slightly overdriven, howling in and drifting sharp over ~3s).
  - The master limiter keeps it startling, not harmful.
- **Corrupted:**
  - The LCD backlight burns a dark, sick red, with a slow smoulder, never a strobe.
  - An inline SVG **shattered glass** effect: cracks radiating from an off-centre impact, concentric fractures and glinting shards.
  - **#050505 black viscous liquid** seeps in under the top bezel and drips slowly down the glass: eight drips, 6-10s each, with heavy drops at the tips, merged by an SVG goo filter.
- **The reference card is forcibly ejected:** blown out of its slot by the blast, with overshoot and shake.
- **Still to come (Phase 4b):** the serial plate scrambling to `SER: D34D-S0UL`, and the breaker finally tripping itself OFF into dead silence.
