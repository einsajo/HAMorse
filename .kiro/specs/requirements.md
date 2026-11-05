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
  - **Reference Mode:** Triggered by the REF button. Clears the screen and displays a tightly formatted A-Z and 0-9 Morse code legend using a retro monospace font.
- **Tuning Panel:** 
  - Center: A massive, flat circular dark metallic VFO rotary dial, with a knurled outer grip and an indicator notch.
  - Right corner: A small, flat riveted metal plate engraved with `SER: 1984-K1R0`.
- **Telegraph Desk (Bottom):** 
  - Minimalist, evenly spaced layout on a dark base plate.
  - Far Left: "REF" (LCD Reference Override) and "CLR" (Clear buffer) push-buttons with aged, dark 2D appearance and labels.
  - Center: Two large brass see-saw tapper paddles "DIT" (left) and "DAH" (right), shown straight-on from top-down. The rear is mounted in flat, blocky black-steel hinge plates with horizontal pivot pins, and a very small, tightly coiled metallic spring is slightly visible directly beneath the brass arm without protruding. The front ends are flat circular touch-plates with flat circular bevels. Active states shift using `transform: translateY(2px) scaleY(0.98)`. The words "DIT" and "DAH" are etched flat below. Must use `touch-action: manipulation` to prevent mobile tap delay.
  - Far Right: A heavy, red-ringed "TX" (Transmit) push-button with "TX / SEND" labels.

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
