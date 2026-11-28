# Kiroween 2026: submission kit

Everything needed to submit **HAMorse** to the **Costume Contest** track.
Deadline: **Friday, December 4, 2026, 2:00 PM PT**. Aim to submit by Dec 2.

> Re-read the official rules at <https://kiroween.devpost.com/rules> before you
> submit. The checklist below follows the published requirements, but the
> rules page is the authority.

---

## 1. Checklist

| | Item | Where / status |
|---|---|---|
| ☐ | Project **started on or after Oct 30, 2026** | Repo created 2026-11-05 ✅ |
| ☐ | **Public** GitHub repo with an **OSI license** | `einsajo/HAMorse`, MIT ✅ |
| ☐ | `.kiro/` directory at the repo root, **not** git-ignored | specs, steering, hook, powers ✅ |
| ☐ | **Live URL** that works on a phone *and* a desktop | <https://einsajo.github.io/HAMorse/> (GitHub Pages, deployed on every push to `main`) ✅ |
| ☐ | **Demo video under 3 minutes**, public on YouTube/Vimeo | Shot list in §3 — **the only missing piece** |
| ☐ | Write-up: what it does and **how Kiro was used** | Draft in §2 + [HOW-KIRO-BUILT-THIS.md](HOW-KIRO-BUILT-THIS.md) |
| ☐ | Category: **Costume Contest** | |
| ☐ | **No API key** anywhere in the repo, video or screenshots | `.env` is git-ignored; the live demo uses the local brains ✅ |
| ☐ | A judge who doesn't know Morse can reach the scare | The circled frequency is on the card; land on it and wait: CQ at 3.6 s, jumpscare at ~44 s ✅ (measured) |
| ☐ | Tests are visible in the repo | `tests/`, `npm test` (63), run by CI ✅ |
| ☐ | Test the live URL on a real Android phone **and** an iPhone, with sound | |
| ☐ | TX GBL on the public link | Local relay works today; a public relay is the declared next step (README). Don't demo it on Pages as if it were hosted |

### Before you record or submit
1. Open the live URL on your phone, in a **private tab**, so the Quick Start note shows.
2. Turn the volume up and plug in headphones for the recording (the shriek is 3D).
3. Play the full haunt once start to finish: about 45 seconds if you just wait.

---

## 2. Devpost write-up (draft: edit it in your own voice)

**Name:** HAMorse

**Tagline:** Learn Morse code on a painfully realistic old ham radio. Just don't answer the frequency that answers back.

### Inspiration
Morse still works when everything else fails, which makes it a real
emergency skill. But learning it is dull: flashcards and beeps. We wanted it to
feel like sitting at a real 1970s transceiver at 2 AM. Then we asked what
would happen if something else on the band was listening.

### What it does
- **A real Morse trainer first:**
  - The Quick Start note is on the radio when the page loads: why Morse matters in four lines, then four steps.
  - Tune a weighted VFO dial across 88–108 MHz: news, sports and jazz broadcasts, then a ham band full of operators.
  - The operators teach you: an Elmer who mentors beginners, a practice station, a slow code bulletin, a ragchewer, a high-speed copy station.
  - Key on a twin-lever Morse key: every press sounds the real 700 Hz dit or dah, with a tick of vibration. Replies come back at an easy 15 WPM.
  - Your progress is pencilled on the reference card: a tick by every letter the Elmer has taught you, and your best speed.
  - **TX GBL is real:** press it and you're on the air with anyone else tuned to the same frequency, person to person. No accounts, nothing stored — like the air itself.
- **Then the costume slips:**
  - One frequency isn't on any list; it moves with every reset. The last operator pencilled it in the corner of the card.
  - Land on it and it calls you like an ordinary operator. Answer, and the radio won't let you go: the dial slips back, the breaker slams itself on. Escape mid-transmission is the only way out.
  - It learns your name and writes it on the card. It knows what time it is where you are. The glitches get worse every time it speaks. Black grease soaks into the card; black liquid crystal soaks into the LCD.
  - Say nothing and it loses patience (~44 s to the end); keep it talking and it takes its time (~2 min).
  - Its last transmission runs away, faster and faster. Then the double scare: the face is suddenly there, pulls back… and snaps closer, the jaw tearing open, a raspy shriek that whips round your head on headphones.
  - Ten seconds of frozen silence, and the ghost sends you its QSL card: **GHOSTED AT 1:44**, with a gentle apology.
- **Nothing is an image or a sound file:**
  - Every part of the radio is CSS and SVG.
  - Every sound is synthesised live with Web Audio: the 700 Hz sidetone, band static with fading, physically modelled switch and paper Foley, the ghost's drone, and a double-hit horror stinger that can never clip (measured peak 0.96).

### How we built it with Kiro
- **Spec-driven:** `.kiro/specs/hamorse/` (requirements, design, ~115 tasks) stayed the source of truth across 48 PRs.
- **Steering:** `vision.md` ("earn the scare") plus hard rules in `tech.md`, `mobile.md`, `visual.md` — no image assets, Web Audio only, audio locked until the breaker, phone-first. Kiro raised conflicts with the rules instead of quietly breaking them (it refused seizure-risk flicker; it kept the project's own no-zoom rule).
- **Hook:** `validate-morse` re-checks every A–Z / 0–9 code against ITU Morse on every save; the decoder and the printed card share that one dictionary.
- **Powers:** `morse-validator`; `live-streams` finds and verifies the broadcast streams (audio, CORS, HTTPS).
- **MCP (Playwright):** the UI was verified at phone size frame by frame — flicker ≤ 3/s, the stinger's peak, the haunt's timing, the card's rot, the escape fix.
- **Agents:** the Guide, the Stranger and the Ghost are real agents with memory; the ghost decides when to strike and paces itself by how much you talk. A small server route can run them on an LLM (Groq `qwen/qwen3.8-27b`); without it, local brains keep the demo working offline.
- **Where Kiro surprised us:** it warned that most judges would never find the ghost among 234 frequencies — which is why the frequency is pencilled on the card and the ghost calls you first. Full story: `docs/HOW-KIRO-BUILT-THIS.md`.

### Challenges
- Mobile autoplay rules: audio may only start from the breaker, and must recover by itself after calls and app switches.
- Making a skeuomorphic radio feel *heavy*: detents, stick-slip card friction, a damped-spring S-meter.
- Making it scary without seizure-risk flashing — measured, not assumed.
- Teaching an LLM to talk in 60-character upper-case CW shorthand.

### What we learned / what's next
- A public relay for the air (TX GBL) on the live demo — the protocol and server already exist.
- Speed drills that build on your best WPM.
- More ghost archetypes.

---

## 3. Demo video: 2:50 shot list

Record the **phone screen** (portrait) with internal audio. Headphones on — the shriek is 3D.

| Time | Shot | Say / caption |
|---|---|---|
| 0:00–0:08 | The page loads straight into the Quick Start note (Morse, 1830s, SOS). Thumb throws MAIN POWER: *KA-CHUNK*, static swells | "This is a 1970s ham radio. Every pixel is CSS; every sound is synthesised live." |
| 0:08–0:25 | Turn the VFO: the detents, the S-meter flick, a news broadcast through the AM chain, then the ham band. The Elmer says hello | "…and it's a real Morse trainer." |
| 0:25–0:40 | Key `CQ` on the paddles (the tone and the tick). DECODER on. REF: the card slides out, the loupe, your progress ticks | "A decoder for beginners, a card you can actually read." |
| 0:40–0:55 | Hold the card: a frequency pencilled and ringed in the corner. Tune to it. Silence… then it calls CQ like any operator | "Someone pencilled a frequency on this card. It isn't on any list." |
| 0:55–1:25 | Answer it. It answers like a normal operator. The glitches start. Try the power: it slams back on — "IM IN THE WIRES NOW". The card rots: HELP circled, your name, grease soaking in | "Answer it, and the radio won't let you go." |
| 1:25–1:50 | It says your name and the time. The last transmission speeds up, faster and faster | *(no voice-over: let it build)* |
| 1:50–2:05 | Build-up, blackout, **the double scare** (hit, relief, it snaps closer, the jaw tears), the soak in the LCD, ten seconds of frozen silence | *(let it play, sound up)* |
| 2:05–2:15 | The ghost's QSL card: GHOSTED AT 1:44, the apology. POWER ON AGAIN: your name glimpsed in the LCD | "It's not really gone." |
| 2:15–2:40 | Screen recording of the repo: `.kiro/specs` tasks, `vision.md`, the hook firing on save, `docs/VERIFICATION.md` numbers, the CI badge | "Built spec-first with Kiro: steering kept the vision, hooks validate the Morse, powers find the streams, and MCP measured every frame." |
| 2:40–2:50 | Title card and the URL | "HAMorse." |

**Tips:**
- Keep it under **3:00**; judges may stop at 3 minutes. The scare lands by ~2:00.
- Captions help: many judges watch muted at first.
- Record the quiet path (don't key at the ghost): 44 seconds, no Morse needed on camera.
