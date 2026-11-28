# How Kiro built HAMorse

Everything in this file really happened during the build, in Kiro Web (Vibe
mode). The app went from an empty repo to this radio through **48 pull
requests**, each one planned, built, verified and merged the same way:
branch → change → measure → tests → PR → CI.

## The Kiro surfaces we used

| Surface | What it did here |
|---|---|
| **Spec** | [`.kiro/specs/hamorse/`](../.kiro/specs/hamorse/) is the source of truth: requirements, design and ~115 tasks, updated in the same commit as every change. Nothing ships untracked. |
| **Steering** | [`.kiro/steering/`](../.kiro/steering/) holds the north star ("earn the scare": the radio must be genuinely useful before it's scary) and the hard rules: React + TS + Vite, plain CSS, **no image or audio assets**, audio locked until the breaker, phone-first. |
| **Hook** | [`validate-morse`](../.kiro/hooks/validate-morse.json) re-checks every A–Z / 0–9 code against ITU Morse whenever the dictionary is saved. The decoder and the printed card read that one file, so they can never disagree. |
| **Powers** | [`morse-validator`](../.kiro/powers/morse-validator/) checks the codes. [`live-streams`](../.kiro/powers/live-streams/) finds internet radio streams for the broadcast slots and **verifies** them (audio type, CORS, HTTPS) before writing them into the app. |
| **MCP (Playwright)** | The UI was verified at phone size (412 px) frame by frame — see [VERIFICATION.md](VERIFICATION.md) for the measured numbers. |
| **Sub-agents** | A read-only audit agent traced real bugs across the codebase (see below). Context-gatherers mapped the haunt engine before changes. |
| **CI** | `.github/workflows/` runs `npm ci`, the real `tsc` build, 63 unit tests and the Morse validator on every PR, and deploys to GitHub Pages on every merge. |

## Where Kiro changed the product, not just the code

It started with an honest review. Asked to score the project like a judge
would, Kiro's first review found two structural problems — and both became
features:

- **"Judges will never see the scare."** The ghost hid on one of 234
  frequencies and stayed silent until someone keyed Morse to it. A judge with
  five minutes would tune around, hear static, and leave before the best part.
  That produced the project's best mechanic: the last operator's frequency
  pencilled and ringed on the reference card, and the ghost calling an
  ordinary CQ 3.5 s after you land on it. A visitor who never keys now
  reaches the jumpscare in ~44 s (measured), down from never.
- **"Learners could land in the haunt by accident."** The flip side: someone
  practising Morse could stumble onto the ghost mid-lesson, and the training —
  the app's core purpose — would be interrupted by the horror. The answers are
  in the design: the ghost keeps at least 0.70 MHz from every station (it
  never hides next to a lesson), the ham-band operators are never haunted,
  and after a user reported a dial desync while fleeing, escaping
  mid-transmission became a real, tested way out. When the haunt ends, the
  radio resets clean and is a trainer again.
- **The dead ghost.** A player killed the power mid-strike and the ghost went
  silent forever. Kiro traced it: the agent *decides* the strike before the
  radio finishes keying it, so a cut left the session "climaxed" without the
  haunt ever starting. The fix (`strikePending`) means you can't stop it by
  cutting the power — verified end to end: power back at 822 ms, build-up at
  1641 ms.
- **A review sub-agent found real bugs**, each fixed with a test: phone audio
  dying after a call or app switch, a whisper stuck on the LCD, a keyboard
  path that could restart the radio after the trip, and the ghost greeting
  you as "HELLO ARE".
- **A unit test caught a lost scare.** When the ghost got a faster "quiet
  mode", a test failed: its `ITS 0214 HR` local-time line could no longer
  appear. It came back as `0214. WHY AWAKE?`.
- **CI caught what the sandbox couldn't.** The live-streams test passed
  offline but failed on GitHub: the runners reached the *real* NPR and
  SomaFM stations. The fix was a `--no-curated` flag, not a weaker test.
- **Safety over instructions.** Asked to blink faster for the build-up, Kiro
  capped the flicker at 3 per second (WCAG 2.3.1, seizure risk) and verified
  the dip timings frame by frame instead. Asked to allow pinch-zoom for
  accessibility, it kept the project's own `mobile.md` rule and raised the
  conflict instead of quietly picking a side.
- **Measuring caught what reading couldn't.** The jumpscare stinger's offline
  render showed a 1.3 full-scale transient on the second hit (the limiter's
  3 ms attack lets the first milliseconds through). A safety soft-clip after
  the limiter brought the measured peak to 0.96. And when a haptics patch was
  silently lost by a failed edit, verification caught it: the measured
  vibration log was empty.

## Honestly not used

Kiro Crew, Autonomous mode, and the Kiro IDE were not used — the build ran in
Kiro Web with specs, steering, hooks, powers and MCP. We say so rather than
claim them.

## The loop, in one paragraph

Ask → plan against the spec and steering → change on a branch → **measure**
(screenshots at phone size, offline audio renders, timing logs) → unit tests
→ PR with the evidence in the body → CI with the real toolchain → merge →
re-measure on `main`. When a judge reads the PR history, every number in
[VERIFICATION.md](VERIFICATION.md) is in one of those bodies.
