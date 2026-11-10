---
inclusion: always
---

# Product Vision: HAMorse

The north star for every decision. Read this before building anything. If a
task conflicts with it, raise the conflict instead of quietly picking a side.

## Goal

Win the **Costume Contest** track of **Kiroween 2026** (deadline: Friday,
December 4, 2026, 2:00 PM PT). The bar is "best possible", not "good enough".

## What it is

A simple web app, playable on **phone and desktop**, with an incredibly
realistic UI of an **old ham radio**. On the surface it is a genuinely useful,
fun way to **learn Morse code**. Underneath it is a horror experience.

## Why it matters (the real value)

Morse is a near-universal language that everyone should know in this new era.
It still works when everything else fails, which makes it especially valuable
in **emergencies**. The app makes learning it approachable and fun.

## Who it is for

- **True beginners:** the built-in **decoder** shows what they are tapping,
  and the **reference card** is always one press away.
- **Medium-level users:** switch the **decoder OFF** and practise copying and
  sending by ear and memory, **increasing their Morse speed**.

## The experience

### 1. The normal radio (the bait)
It must feel like a real, calm, believable learning tool first:
- **Tune the dial** across the band and find stations, with the atmosphere of
  an old ham set: **news, sports and songs** on some frequencies.
- **Morse communication** on a specific frequency: send with the paddles,
  read the replies.
- The decoder, the reference card and the tactile hardware support learning.

### 2. The creepy twist (the switch)
The Morse chat seems completely normal to an ordinary person. Then it
**transitions / is interrupted** into something ghostly: the conversation
turns wrong.

### 3. The jumpscare (the payoff)
It escalates into a **wild ghost interface UI and a jumpscare**: the radio
itself is possessed.

## Principles

1. **Earn the scare.** The twist only lands if the normal phase is convincing,
   useful and calm. Never hint at horror too early.
2. **Spooky design enhances function** (the Costume Contest brief): the haunt
   should grow out of the radio's own parts (LCD, needle, plates, breaker,
   static), not be pasted on top.
3. **Real learning value.** Beginner and medium-level paths must genuinely
   work; this is the app's "Potential Value" to judges.
4. **Phone first, desktop equal.** Every feature must work by touch on a
   ~412px-wide Android phone and with a mouse and keyboard.
5. **Physical realism everywhere** (see the `visual`, `mobile` and `tech`
   steering files).
6. **Visible Kiro craft:** specs, steering, hooks, powers and verified changes
   are part of what is judged.

## Open questions (decide before building these)

- **Station audio (news / sports / songs):** recorded clips would break the
  "no external assets / Web Audio only" rules and risk copyright. Proposed:
  procedurally generated, muffled "broadcast" audio (filtered voice-like noise,
  simple synthesized tunes) buried in static. *Not yet decided.*
- **Measuring progress for medium users:** e.g. a WPM readout, a practice
  station that sends Morse to copy, drills. *Not yet decided.*
- **Ghost replies:** scripted by default; AI optional. *Not yet decided.*
- **Jumpscare safety:** keep flashes under 3 per second (photosensitive
  seizure threshold) and cap loudness. *Proposed.*

## Submission must include

Public repo with `.kiro/`, a live URL, a 3-minute video (show the haunt
within the first minute), and a write-up of how Kiro was used.
