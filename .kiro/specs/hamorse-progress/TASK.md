# HAMorse: your progress, pencilled on the reference card

A Kiro Crew Task Runner spec. Run it from the repository root:

```bash
kirocrew run .kiro/specs/hamorse-progress/TASK.md
```

## Goal

Make a learner's progress visible, without breaking the radio's fiction. The
Elmer (the mentor station on 100.30 MHz) already teaches letters one by one,
and the decoder already measures your sending speed on every word. Neither is
shown anywhere. Pencil both onto the operator's reference card, in the same
graphite hand as the card's other pencil marks:

- a small pencil tick beside every letter or digit the Elmer has taught you;
- `BEST: 12 WPM`: your best sending speed, which updates when you beat it.

This raises the project's real learning value (a Kiroween judging criterion)
and gives returning users a reason to come back.

## Context: read these first

- `.kiro/steering/*.md`: hard rules. React + TypeScript + Vite, plain CSS,
  **no image or audio assets**, phone-first (412 px wide), skeuomorphic
  hardware, and the vision ("earn the scare": nothing on the card may hint at
  the haunt before it starts).
- `.kiro/specs/hamorse/requirements.md`, sections 2e (reference card) and 3b
  (the ham band operators, including the Elmer).
- `src/utils/stations.ts`: `ELMER_ORDER`, `ELMER_STORAGE_KEY`
  (`hamorse.elmer.learned`, the number of characters met so far; the legacy
  key `telegraph-ghost.elmer.learned` is still read), `measureWpm`,
  `StationStorage`.
- `src/hooks/useMorseDecoder.ts`: `onWordEnd(message, { word, wpm })` is
  called for every word you send; `browserStorage()` wraps localStorage
  safely.
- `src/components/ReferenceCard.tsx` and `.css`: `CardSheet` is rendered
  twice (the card, and the copy the loupe magnifies), so ids must stay unique
  via `idPrefix`. `data-rot` 0-3 is the haunt's rot. `.refcard__circled` is the
  existing pencil style (the HELP rings). `.refcard__hint` (bottom-right) is
  the ghost's frequency.
- `tests/build.mjs` and `package.json` (`npm test`): how the pure modules are
  transpiled and tested with `node:assert`.

## Requirements

1. **A pure progress module, `src/utils/progress.ts`** (no React, no DOM):
   - `learnedChars(count: number): string[]`: the first `count` characters
     of `ELMER_ORDER`, clamped to 0..length.
   - `loadProgress(storage?: StationStorage): { learned: number; bestWpm: number | null }`:
     it reads `hamorse.elmer.learned` (falling back to the legacy key) and
     `hamorse.best.wpm`. Missing, broken or out-of-range values become
     `learned: 0` / `bestWpm: null`, never a throw.
   - `recordWpm(storage, wpm): number | null`: it keeps the best plausible
     speed (accept 3-60 WPM; ignore null, NaN or out-of-range values), saves
     it to `hamorse.best.wpm`, and returns the current best. Storage failures
     (private mode, quota) are swallowed.
2. **Wire it into the decoder** (`useMorseDecoder.ts`):
   - Every word you send calls `recordWpm`.
   - Expose `progress: { learned: number; bestWpm: number | null }` on the
     decoder state (the `MorseDecoderState` interface, the `value` memo and its
     deps, and the engine's `Omit<…>` list).
   - It updates live when the Elmer teaches a new character. Re-reading
     storage after each Elmer transmission is acceptable.
3. **Render it on the card** (`ReferenceCard.tsx` / `.css`):
   - **Ticks:** a small graphite tick beside each learned character in the
     Morse table, drawn with CSS or SVG strokes (no font glyphs such as ✓,
     which some Android fonts lack). It must not cover the letter or its code,
     must not collide with the HELP rings, and must stay legible through the
     loupe.
   - **`BEST: NN WPM`:** pencilled in graphite somewhere free on the card. It
     must not overlap the Morse table, the Q codes, Nevlin's note, the
     ghost's frequency hint (bottom-right), or the `DECEASED` stamp (rot 3).
     Hidden while `bestWpm` is null.
   - The ticks and the speed are part of the card at every rot level, but sit
     under the black grease when it floods (the grease is on top).
   - Both copies of the card (the card and the loupe) show the same progress.
4. **Tests:** `tests/progress.test.mjs` covers `learnedChars`, `loadProgress`
   (legacy key, broken values, empty storage) and `recordWpm` (keeps the
   best, rejects implausible values, survives a throwing storage). Add the
   module to `MODULES` in `tests/build.mjs` and the test to the `npm test`
   script.
5. **Spec housekeeping:**
   - Add a short "Progress on the card" bullet to section 2e of
     `.kiro/specs/hamorse/requirements.md`.
   - Add a ticked task under Phase 5 of `.kiro/specs/hamorse/tasks.md` that
     names this Crew run.

## Constraints

- Don't change the haunt's timing, the agents, the audio engine, the
  chassis or `MetalPlate` CSS, or the steering files.
- No new dependencies. No image or audio files.
- Keep every existing test passing. Keep `npx tsc -b` clean
  (`noUnusedLocals` / `noUnusedParameters` are on).
- Nothing added may hint at the ghost.

## Acceptance criteria

- `npm ci && npm test` passes, including the new `tests/progress.test.mjs`.
- `npx tsc -b && npx vite build` succeeds.
- `node .kiro/powers/morse-validator/skills/validate-morse/scripts/validate-morse.mjs --strict` passes.
- After the Elmer has taught `E T I A`, those four entries show a pencil tick
  on the card and in the loupe, and the others don't.
- After sending a word at a measurable speed, `BEST: NN WPM` appears and
  persists across a reload. A slower word doesn't lower it.
- At a 412 × 915 viewport the card shows no overlap between the new marks and
  the table, the Q codes, Nevlin's note, the frequency hint, or the `DECEASED`
  stamp.
