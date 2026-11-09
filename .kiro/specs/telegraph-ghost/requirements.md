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
    - **Ham band (100.00-102.00):** flutters actively around S4-S7.
    - **A ham operator sending to you:** a strong, close signal kicking around S8 (`keying` mode) until the transmission ends.
    - **Ghost frequency (104.40):** slams to the +40 dB stop, bounces, then stays pinned.
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
  - **Magnetic detents (per station, `DETENTS` in `src/constants.ts`):** broadcasters and the ghost capture within 0.20 MHz and release beyond 0.32 MHz; the five ham operators (0.40 MHz apart) capture within 0.08 and release beyond 0.13 MHz, so the open band between them stays tunable. Capture zones never overlap.
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
  - **TX SEND:** Sends what you've keyed immediately (no waiting for the word gap) and hands the frequency over, like ending an over with `K`. Feedback is on the LCD's TX annunciator (Section 2b). A circular push button **resized to exactly the REF/CLR footprint**: a dark knurled housing with a faded red ring and a deeply inset dark-red glass lens, with a realistic pressed state.
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
  - The card is a Morse helper only. It does **not** list the ham band operators: you find them by tuning around (and from the 100.20 bulletin), like a real ham, and a list would shrink the Morse table.
- **Closing:** Tap the card, press `REF` again, or drag the card back toward the radio.

### 2f. Quick Start Guide (before the first power-on)
- **Trigger:** using a control that needs power (DIT / DAH, DECODER, CLR, TX SEND, or releasing the VFO) before the radio has ever been switched on. REF and the dust wipe never trigger it (they work unpowered).
- **Look:** a yellowed cardstock "QUICK START" note taped over the radio in typewriter type, with a pencil "start here" arrow. The chassis dims around a spotlight on the MAIN POWER breaker, which pulses with a soft amber glow (under 1 flash per second).
- **Content:** explains the trainer (power, tuning and the HAM band, where operators can be met by tuning around, with the Elmer on 100.60 for newcomers; DIT/DAH and the 700 Hz tone; DECODER ON shows text vs OFF for ear training while the radio keeps working; REF and CLR) and why sound needs the power on. It never mentions the haunt.
- **Actions:** `[ THROW MAIN POWER ]` performs the breaker's own action (thunk, audio unlock, power ON); `[ GOT IT ]` or Escape closes it. After it is dismissed, later attempts only make the breaker glow briefly. The first power-on retires it for the session.

## 3. Core Mechanics & Audio
- **Audio Engine:** `AudioContext` remains suspended until the MAIN POWER MCB is thrown ON.
- **Static:** Continuous white noise (with sparse crackle) through a ~1 kHz bandpass, like muffled AM static. Loudness follows the band: dead air 100%, ham band 50%, broadcasters 20%, and only 10% on 104.40, so the ghost station is eerily quiet and clear. Silent when the power is OFF.
- **Sidetone:** A 700 Hz sine with a 5ms attack and 5ms release (no pops): DIT 60ms, DAH 180ms. It sounds whenever you key on the ham band or 104.40 with the power ON, including with the DECODER OFF, so practised users can train by ear. Other operators come through the same sidetone at their own beat note (620-820 Hz), as on a real receiver; your own keying is always 700 Hz.
- **Mechanical Foley (synthesised, no files), physically modelled so it never sounds like a synth:** a strike (a contact pulse with a little noise grain) rings a bank of resonators tuned to the parts (dome, case, panel); friction is a stream of stick-slip ticks whose density and loudness follow the part's speed; every play is jittered (pitch, level, timing) so no two presses match; all of it plays into a small synthesised room. The MCB: handle rub, latch crack ringing the phenolic case, the stop knocking through the DIN rail, the contacts closing (ON only), a faint spring ring. The DECODER slide: stick-slip ticks along the rails into a detent click. REF / CLR / TX SEND: a click going down (dome collapse, contact bounce, plunger knock) and a lighter, higher one coming back up; the VFO a ball tipping over a crest and knocking into its pocket every 0.05 MHz (muffled, about half its energy below 1 kHz so phones still play it; firmer, with a settle, at a station). The reference card scrapes through its slot driven by its speed through the friction animation: fibres ticking and a soft rub that ease into the catch, two small creaks while stuck, a paper pop and flick as it breaks free, the fastest burst of friction dying away in the glide, then a soft slap as it lands. Until the MCB has been operated no audio exists at all (autoplay policy).
- **Morse Paddles:** Pressing DIT or DAH keys a dit (`.`) or dah (`-`) the instant the lever goes down (and, in Phase 3, a 700Hz `OscillatorNode` sidetone). The levers always move; taps are keyed and decoded whenever the radio is powered and on a transmit frequency. The DECODER only controls the display.
- **The dial (`src/constants.ts`):** broadcasters at 89.30 (news), 93.50 (sports), 98.10 (music) are receive-only; the ham band 100.00-102.00 (inclusive) and the ghost frequency 104.40 allow transmitting; everything else is dead air. Every station (broadcasters and the ghost) has a magnetic tuning detent, so the ghost's detent gives nothing away.
- **Decoder gating:** taps are keyed and decoded only on the ham band or exactly on 104.40, with the power ON (DECODER ON or OFF). On a broadcaster the LCD shows a faint blinking `RX ONLY`; on dead air `DEAD BAND`. The paddles still move.
- **Retuning:** any frequency change instantly clears the decoded message and the half-keyed letter.
- **Timing:** Gaps are measured from the last tap. They start generous for beginners (600ms of silence ends a letter, 1400ms a word: one space, never leading or doubled) and **adapt to the operator** like a real CW decoder: the letter gap is ~4x the running average of the tap interval inside a letter (never below 320ms), and the word gap is 2.4x the letter gap (at most 1400ms). A fast operator is therefore not capped at ~12 WPM.
- **Dictionary:** `src/utils/morseDictionary.ts` is the single source of truth (ITU A-Z, 0-9, plus the CQ / QRT Q-codes). The decoder and the reference card both read it, and the `morse-validator` power checks it on every save.
- **Decoder:** When the DECODER slide switch is ON, the buffer translates to English on the LCD, followed by the live dits/dahs of the letter being keyed and a blinking cursor. Unknown codes show as `?`. Once the text is wider than the glass, the oldest characters are hidden on the left so the newest are always visible. When it is OFF, the LCD text area is blank, **and that is all it does**: keying, decoding and every station's replies carry on unseen (for copying and sending by ear), and switching it back ON shows the whole conversation so far. `CLR` clears the buffer; power OFF wipes it.
- **VFO Dial:** Dragging the dial circularly updates the LCD frequency (88.00 - 108.00). The radio powers on at a dead 88.50 MHz, so the player has to search for the station.
- **S-Meter:** The needle tracks the received audio level.

## 3a. Interactive Transmissions (the reply engine)
- **Incoming replies** are keyed out loud element by element (you hear every dit and dah), shown live on the LCD as they build, then committed letter by letter. While another station is sending, the paddles are locked out and the LCD cursor is hidden. CLR, retuning or power OFF cut a reply off.
- **Tutor, 101.00 MHz** (a practice station inside the ham band, with its own tuning detent): when your last word is `HI` it answers `GUD COPY. SEND SOS`; when it is `SOS` it answers `FB. 73.` (fine business, best regards). Brisk, clean 700 Hz: 60/180 ms dit/dah, 150 ms between characters.
- **Ghost, 104.40 MHz:** when your last word is `CQ` it answers ` I C U `, agonisingly slowly (500 ms between characters, 120/360 ms elements) in a lower, sagging, beating, distorted tone. When it finishes the `U`, the global `isHaunted` state becomes true (the trigger for Section 4).
- Replies trigger on your *word* ending (a whole word, so `CHI` is not `HI`), whether the DECODER is ON or OFF.

## 3b. The Ham Band Operators (beginner to pro)
Five operators live on the ham band (`src/utils/stations.ts`; frequencies in `HAM_STATIONS`). They must feel like **people on the air, not a level-up game**: they greet you, ask questions and react to your answers, vary their wording, talk you through mistakes, remember you when you come back, sign off when you send 73, and point you at each other. Nothing in the UI lists them; you discover them by tuning (the 100.20 bulletin mentions them, as real bulletins do). Each hears you tune in, every word you finish (with your measured sending speed) and how long the band has been quiet. Each answers with real Morse timing (Farnsworth where noted: ARRL t_a = (60c - 37.2s)/(sc)), in its own beat note. Names and places are fictional and nobody uses a callsign (real callsigns identify real people).

| MHz | Who | Level | Behaviour |
| --- | --- | --- | --- |
| 100.20 | Code-practice bulletin | Beginner, listening | Starts on tune-in with `VVV ...`; rotates eight practice texts (pangram, Q-codes, numbers, and who else is on the band) at 18/8 WPM with 4s pauses. Never answers. |
| 100.60 | The Elmer (mentor) | Beginner, sending | First asks `GE. DE ELMER. R U NEW TO CW? K`. Yes (Y / YES / R / C / OK) → `FB. WE START EASY. E IS 1 DIT. SEND E K`; silence for 15s → `NO PROBLEM. JUST SEND 1 DIT. THAT IS E K`; No → words, plus `TRY BOB ON 101.40 OR SAM ON 101.80`. Then he brings in characters shortest-first (`NEXT T. T IS DAH. T T T. UR TURN K`) and mixes in earlier ones (`SEND` / `NOW` / `TRY E K`). Varied praise (`FB`, `VY GUD`, `NICE`...). Mistakes: `NOT QUITE. A IS DIDAH. TRY AGN K`, then `NO WORRIES. LISTEN. A A A`. Occasional remarks (`U KNOW 6 LTRS NOW`, `U CAN TRY BOB ON 101.40 SOMETIME`). `HI` → `HI HI`; `?`/`AGN` repeats; `73` → `73 ES GL. CU AGN SK`; coming back → `GE. WB. LAST TIME U GOT TO N.` (localStorage). `STILL THERE?` after 25s idle (twice at most). 18/12 WPM. |
| 101.00 | Practice station | First contact | `HI` -> `GUD COPY. SEND SOS`; `SOS` -> `FB. 73.` (unchanged). |
| 101.40 | Bob, ragchewer | Intermediate | Calls `CQ CQ DE BOB BOB K` on tune-in, then every 30s while idle. Your over ends with `K`/`KN`/`BK`/`AR`/`SK` or 3.5s of silence. Then: `GE. UR RST 579. NAME BOB. UR NAME? K` -> `FB {NAME}. QTH OHIO. UR QTH? K` -> `FB. {QTH}. TNX QSO {NAME}. 73 SK` -> (your 73) `E E`. Procedure words never count as a name or place (`SRI. UR NAME? K`). Tuning in restarts the QSO. 18/13 WPM. |
| 101.80 | Sam, high-speed op | Pro | Calls `CQ QRQ CQ QRQ DE SAM K` (every 40s). Answer him and he explains (`I SEND 5 LTR GRPS. U SEND THEM BACK. 20 WPM. GRP ...`). Right: `SOLID CPY. UR {your WPM}WPM. QRQ {+2}. GRP ...`; one character off: `CLOSE. QRS {-2}. AGN GRP {same}`; otherwise `NIL. ...`. 15-40 WPM (`TOP SPEED HI`). `QRS` slows him down; `?`/`AGN` repeats; `73` → `TU FER PRACTICE. 73 SK`; he remembers you (`WB`). Best with the DECODER OFF. |

- Your sending speed: WPM = characters per minute / 5, timed from the first tap of the word to the last.
- Retuning or power OFF cancels any transmission; the next tune-in restarts the station's greeting / call.


## 4. The Haunt Sequence (The Track 4 UI Scare)
- **Trigger:** When tuned to 104.4 MHz, transmitting text triggers an AI (or scripted fallback) response. During the final response line, execute the "Liquid Crystal Bleed" visual override.
- **The Blackout:** Chassis brightness drops by 90%. The amber backlight dies.
- **The Bleed:** A pitch-black, viscous SVG/CSS fluid animates, leaking down from the cracked LCD screen over the metal chassis.
- **The Glitch:** The serial plate text scrambles to `SER: D34D-S0UL`. The S-Meter needle violently pins to the red maximum.
- **The Audio:** The incoming Morse audio rapidly increases in speed and pitch-shifts erratically before the MCB power switch trips itself OFF (handle snaps down), returning the app to dead silence.
