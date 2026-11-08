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
    - **Power ON:** flutters randomly around S3-S4 (band noise).
    - **Tuned exactly to 104.40 MHz:** slams to the +40 dB stop, bounces, then stays pinned. Tuning away drops it back to static.
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
  - **Magnetic detent:** dragging within 0.20 MHz of a station (104.40) snaps the frequency onto it; escaping takes 0.32 MHz of travel (stickiness).
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
  - **TX SEND:** A circular push button **resized to exactly the REF/CLR footprint**: a dark knurled housing with a faded red ring and a deeply inset dark-red glass lens, with a realistic pressed state.
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
- **Closing:** Tap the card, press `REF` again, or drag the card back toward the radio.

## 3. Core Mechanics & Audio
- **Audio Engine:** `AudioContext` remains suspended until the MAIN POWER MCB is thrown ON.
- **Static:** Generate continuous background white noise routed through a bandpass filter.
- **Morse Paddles:** Pressing DIT or DAH instantly triggers a 700Hz `OscillatorNode`. The app records the inputs to a buffer.
- **Decoder:** When the DECODER slide switch is ON, the buffer translates to English on the LCD. When it is OFF, the LCD text area remains blank.
- **VFO Dial:** Dragging the dial circularly updates the LCD frequency (88.00 - 108.00). The radio powers on at a dead 88.50 MHz, so the player has to search for the station.
- **S-Meter:** The needle tracks the received audio level.

## 4. The Haunt Sequence (The Track 4 UI Scare)
- **Trigger:** When tuned to 104.4 MHz, transmitting text triggers an AI (or scripted fallback) response. During the final response line, execute the "Liquid Crystal Bleed" visual override.
- **The Blackout:** Chassis brightness drops by 90%. The amber backlight dies.
- **The Bleed:** A pitch-black, viscous SVG/CSS fluid animates, leaking down from the cracked LCD screen over the metal chassis.
- **The Glitch:** The serial plate text scrambles to `SER: D34D-S0UL`. The S-Meter needle violently pins to the red maximum.
- **The Audio:** The incoming Morse audio rapidly increases in speed and pitch-shifts erratically before the MCB power switch trips itself OFF (handle snaps down), returning the app to dead silence.
