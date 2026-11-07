# Project: The Telegraph Ghost
# Goal: Build a cross-platform, highly skeuomorphic haunted HAM radio with mechanical Morse code paddles and a contextual AI ghost.
# Contest: Kiroween 2026 Track 4 (Costume Contest)

## 1. Global Layout & Cross-Platform Scaling
- **The Boundaries:** The `<body>` background is absolute pitch black (`#000000`) to swallow any unused screen space.
- **The Radio Chassis:** A self-contained, centralized container strictly using `aspect-ratio: 3 / 4; max-width: 100vw; max-height: 100vh; margin: auto;`. 
- **Styling:** It must look like a heavy, dark, 2D brushed-metal military device using CSS `linear-gradient` and `box-shadow`. No external images; use pure CSS for all textures.

## 2. The 3:4 UI Architecture (Top to Bottom)
- **Top Panel:** 
  - Left: A heavy, vertical physical "MAIN POWER" toggle switch with worn "PWR" and "OFF / ON" labels printed in faded, industrial off-white ink.
  - Center: An analog "S-Meter" gauge. A flat, round inset backlit yellow parchment dial with a mechanical needle that twitches programmatically based on audio volume.
  - Right: A "DECODER: OFF / ON" toggle switch with "DEC" and "OFF / ON" labels.
- **Display Panel (The Amber LCD):** 
  - A wide, deeply inset amber screen (`box-shadow: inset 0 0 15px rgba(0,0,0,0.8)`). 
  - **Normal Mode:** Top half shows the frequency. Bottom half shows the text buffer (English translations of user inputs and AI replies).
  - **No LCD reference mode.** The REF button does NOT change the LCD; it pulls out the physical reference card (see Section 2a).
- **Tuning Panel:** A 3-column layout: SOP plate | VFO dial | badge stack. All plates are decorative and use `pointer-events: none`, so they can never block the dial.
  - **Center (VFO):** A massive, heavy machined-steel rotary dial with high-contrast knurled grip, a dished face with a soft, stretched overhead reflection, and a deep concave finger dimple (no etched indicator line). A thick side wall and heavy multi-layer drop shadow make it protrude far above the chassis. The dial container uses `touch-action: none`.
  - **Frequency Scale:** A worn, faded white silkscreen scale printed on the chassis around the upper half of the dial: ticks every 1 MHz from 88 (9 o'clock) to 108 (3 o'clock), labelled every 4 MHz (88, 92, 96, 100, 104, 108).
  - **Plate material:** Every plate is aged, corroded copper (#8B572A / #5C3A21) with verdigris patina (#2E473B / #1A2B22), fastened with four tarnished brass/rusted screws. No inner border; text sits directly on the metal.
  - **Left (SOP):** A single tall copper plate matching the dial's height, printed in small dark etched sans-serif: `OPERATING INSTRUCTIONS:` / `1. ROTATE VFO TO SEEK SIGNAL.` / `2. USE DIT/DAH PADDLES TO TX.` / `3. MONITOR LCD BUFFER.` / `WARNING: NO EMISSIONS ON DEAD BANDS.`
  - **Right (stack):** Two small stamped copper plates stacked vertically: the `HAMorse` / `HM-13` badge on top, with the serial plate `SER: 1984-K1R0` directly underneath.
- **Telegraph Desk (Bottom):** A 3-column layout: utility buttons | squeeze keyer | TX.
  - **Left (Utility Buttons):** Two small, circular, tactile push switches stacked vertically, `REF` and `CLR`, with worn silkscreen labels. They press downward when pushed. `REF` latches partly down while the reference card is out; `CLR` clears the buffer.
  - **Center (Horizontal 'Iambic Squeeze' Keyer):** A Bencher-style keyer on a dark machined base plate.
    - A heavy, dark metallic central contact post with dull, tarnished silver contacts (#999 to #555). No bright white dots anywhere.
    - Two long horizontal levers facing inward toward the post: `DIT` on the left points right, `DAH` on the right points left. They pivot from fixed dark pivot blocks at their outer ends.
    - **Arms:** Flat, thick bars of brushed, tarnished aluminium (not cylinders), with oxidised edges and a visible side wall.
    - **Thumb-pieces:** Wide, vertical, heavily worn, textured black bakelite pieces at the inward-facing tips, rubbed through to brown where thumbs press.
    - **Depth:** A complex, multi-layer shadow: tight ambient occlusion plus wider, softer, downward-stretching drop shadows, so the levers hover about half an inch above the plate.
    - **Press:** Pointer-event state (with a CSS `:active` fallback) applies `translateX()` so each lever snaps inward and strikes the post contact. Each lever tracks its own pointer, so both can be squeezed at once. `touch-action: manipulation`.
  - **Right (TX):** A large circular `TX` / `SEND` push button: a dark knurled mechanical housing with a faded red ring and a deeply inset dark-red glass lens, with a realistic pressed state.

## 2a. Reference Guide (Physical Cardstock Manual)
- **Trigger:** The `REF` button toggles a physical, slide-out cardstock manual. It is **NOT an LCD mode**; the LCD is unaffected.
- **Placement:** The card is layered **behind** the chassis (lower z-index), tucked underneath it. The chassis itself never moves.
- **Motion:** On portrait/mobile, the card slides UP from behind the top edge into the empty space above the radio. On screens wider than 3:4 (desktop/landscape), it slides OUT to the right into the empty space beside it. The motion uses friction keyframes (~1s): the card catches at ~40%, strains, then snaps to ~60% before gliding the rest of the way.
- **Material:** Heavy, aged, yellowed cardstock (#D4CBB3) with faint paper noise, darkened dog-eared corners and dark grease smudges.
- **Content:** A faded dark-grey typewriter (monospace) grid of A-Z and 0-9 Morse code, a small Q-code section (`CQ: Calling any station`, `QRT: Stop transmission`), and a faded blue handwritten margin note: `Dial drifts below 90MHz in the cold. - Nevlin`.
- **Closing:** Tap the card, press `REF` again, or drag the card back toward the radio.

## 3. Core Mechanics & Audio
- **Audio Engine:** `AudioContext` remains suspended until MAIN POWER is toggled ON. 
- **Static:** Generate continuous background white noise routed through a bandpass filter. 
- **Morse Paddles:** Tapping DIT or DAH instantly triggers a 700Hz `OscillatorNode`. The app records the inputs to a buffer.
- **Decoder:** If ON, the buffer translates to English on the LCD. If OFF, the LCD text area remains blank.
- **VFO Dial:** Dragging the dial circularly updates the LCD frequency (88.00 - 108.00).

## 4. The Haunt Sequence (The Track 4 UI Scare)
- **Trigger:** When tuned to 104.4 MHz, transmitting text triggers an AI (or scripted fallback) response. During the final response line, execute the "Liquid Crystal Bleed" visual override.
- **The Blackout:** Chassis brightness drops by 90%. The amber backlight dies. 
- **The Bleed:** A pitch-black, viscous SVG/CSS fluid animates, leaking down from the cracked LCD screen over the metal chassis.
- **The Glitch:** The serial plate text scrambles to `SER: D34D-S0UL`. The S-Meter needle violently pins to the red maximum.
- **The Audio:** The incoming Morse audio rapidly increases in speed and pitch-shifts erratically before the Power Switch forces itself OFF, returning the app to dead silence.
- 
