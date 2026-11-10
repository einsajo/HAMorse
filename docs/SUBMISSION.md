# Kiroween 2026: submission kit

Everything needed to submit **HAMorse** to the **Costume Contest**
track. Deadline: **Friday, December 4, 2026, 2:00 PM PT**. Aim to submit by
Dec 2, so there's time to fix a broken link.

> Re-read the official rules at <https://kiroween.devpost.com/rules> before you
> submit. The checklist below follows the published requirements, but the
> rules page is the authority.

---

## 1. Checklist

| | Item | Where / status |
|---|---|---|
| ☐ | Project **started on or after Oct 30, 2026** | Repo created 2026-11-05 ✅ |
| ☐ | **Public** GitHub repo with an **OSI license** | `einsajo/HAMorse`, MIT ✅ |
| ☐ | Repo renamed to **HAMorse** (Settings → General → Repository name) | The deploy follows the name automatically; the old Pages URL stops working |
| ☐ | `.kiro/` directory at the repo root, **not** git-ignored | specs, steering, hooks and powers ✅ |
| ☐ | **Live URL** that works on a phone *and* a desktop | <https://einsajo.github.io/HAMorse/> (GitHub Pages, deployed on every push to `main`) |
| ☐ | **Demo video under 3 minutes**, public on YouTube/Vimeo | Shot list in §3 |
| ☐ | Write-up: what it does and **how Kiro was used** | Draft in §2 |
| ☐ | Category: **Costume Contest** | |
| ☐ | **No API key** anywhere in the repo, video or screenshots | `.env` is git-ignored; the live demo uses the local brains |
| ☐ | Test the live URL on a real Android phone **and** an iPhone, with sound | |
| ☐ | A judge who doesn't know Morse can reach the scare | The Quick Start note opens on load; the circled frequency is on the card. Land on it and wait: CQ at 3.6 s, jumpscare at about 44 s; talk to it and it takes about 2 min ✅ (Playwright) |
| ☐ | Tests are visible in the repo | `tests/`, `npm test`, run by CI ✅ |

### Before you record or submit
1. Open the live URL on your phone, in a **private tab**, so the Quick Start note shows.
2. Turn the volume up and plug in headphones for the recording.
3. Play the full haunt once start to finish. It takes about 4 ghost transmissions.

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
  - Tune a weighted VFO dial across 88–108 MHz.
  - Find news, sports and jazz broadcasts, and a ham band full of operators.
  - The operators teach you: an Elmer who mentors beginners, a practice station, a slow
    code bulletin, a ragchewer, a high-speed copy station.
  - Key on a twin-lever Morse key (one press, one dit or dah), read along with the decoder, or switch it off and copy by ear.
  - An operator's reference card slides out from behind the set, with a reading loupe; your progress is pencilled on it (a tick by every letter the Elmer has taught you, and your best speed).
- **Then the costume slips:**
  - One frequency isn't on any list, and it moves every time the radio resets. The last operator pencilled it in the corner of the card.
  - Answer it, and the radio won't let you go. The dial slips back to it, and the breaker
    slams itself back on.
  - The glitches get worse every time it speaks. It learns your name, writes it on the
    reference card, and knows what time it is where you are.
  - On its last transmission its keying runs away with itself, faster and faster.
  - Then the LCD cracks and bleeds black liquid crystal, a face lunges out of the dark, and
    the radio freezes in silence for ten seconds before the breaker trips.
- **Nothing is an image or a sound file:**
  - Every part of the radio is CSS and SVG.
  - Every sound is synthesised live with Web Audio: the 700 Hz sidetone, band static with
    fading, physically modelled switch and paper Foley, the ghost's drone and the stinger.

### How we built it with Kiro
- **Spec-driven:**
  - `.kiro/specs/hamorse/` holds the requirements, the design and over 110 tasks,
    updated with every change, so the spec stayed the source of truth for a project that
    grew from a chassis to a multi-agent horror engine.
  - Development ran through 40 PRs.
- **Steering:**
  - `vision.md` is the north star: "earn the scare". The twist only lands if the radio is
    genuinely useful first.
  - `tech.md`, `mobile.md` and `visual.md` hold the hard rules: no image assets, Web Audio
    only, audio locked until the breaker is thrown, phone-first.
  - Kiro raised conflicts with these rules instead of quietly breaking them.
- **Hooks:**
  - `validate-morse` re-checks every A–Z / 0–9 code against ITU Morse whenever the
    dictionary is saved.
  - The decoder and the printed card both read that one file.
- **Powers:**
  - `morse-validator` checks the codes.
  - `live-streams` finds and verifies radio streams for the broadcast slots (audio type,
    CORS, HTTPS) and writes them into the app.
- **MCP (Playwright):** Kiro verified the UI at phone size, frame by frame:
  - the flicker rate of every haunt phase, measured to stay at or below 3 flashes per second
    (photosensitivity);
  - the stinger's peak level;
  - the reference card's rot at each stage;
  - the ghost's runaway keying.
- **Agents:**
  - The Guide, the Stranger and the Ghost are real agents with memory (`agentEngine.ts`).
    The ghost decides when to strike.
  - A small server route runs them on an LLM (Groq, `qwen/qwen3.8-27b`) and keeps the key
    on the server.
  - Without the route, each agent has a local brain, so the live demo works offline.

### Challenges
- Mobile autoplay rules: audio may only start from the breaker. Phones also suspend audio
  on calls and app switches, so it has to recover by itself.
- Making a skeuomorphic radio feel *heavy*: detents, stick-slip card friction, a
  damped-spring S-meter.
- Making it scary without seizure-risk flashing.
- Teaching an LLM to talk in 60-character upper-case CW shorthand.

### What we learned / what's next
- Speed drills that build on your best WPM.
- More ghost archetypes.

---

## 3. Demo video: 2:50 shot list

Record the **phone screen** (portrait) with internal audio. Headphones on.

| Time | Shot | Say / caption |
|---|---|---|
| 0:00–0:08 | The page loads with the Quick Start note (Morse, 1830s, SOS). Thumb throws MAIN POWER: *KA-CHUNK*, static swells | "This is a 1970s ham radio. Every pixel is CSS, and every sound is synthesised live." |
| 0:08–0:30 | Turn the VFO: the detents, the S-meter flick, a news broadcast through the AM chain, then the ham band. The Elmer says hello | "It's a real Morse trainer…" |
| 0:30–0:45 | Key `CQ` on the paddles with the decoder ON. REF: the card slides out, and you hold it to use the loupe | "…with a decoder for beginners, and a reference card you can actually read." |
| 0:45–1:25 | Hold the card to the loupe: a frequency pencilled and ringed in the corner. Tune to it. Silence, then it calls CQ like any operator. Answer it. The glitches start. Cut the power: it slams back on, "IM IN THE WIRES NOW". Pull out the card: HELP is circled | "Someone pencilled a frequency on this card. It isn't on any list." |
| 1:25–1:55 | It says your name and the time. The last transmission speeds up. Build-up, blackout, **the jumpscare**, the bleed, ten seconds of frozen silence, the breaker trips | *(no voice-over: let it play)* |
| 1:55–2:05 | The ghost's QSL card: GHOSTED AT 1:44. Tap POWER ON AGAIN: your name glimpsed in the LCD | "It's not really gone." |
| 2:05–2:45 | Screen recording of the repo: `.kiro/specs` tasks, `vision.md`, the hook firing on save, a Playwright screenshot strip, the CI badge | "Built spec-first with Kiro: steering kept the vision, hooks validate the Morse, powers find the live streams, and MCP verified every frame." |
| 2:45–2:50 | Title card and the URL | "HAMorse." |

**Tips:**
- Keep the video under **3:00**; judges may stop watching at 3 minutes.
- Put the scare before **1:30**.
- Captions help: many judges watch muted at first.
