---
name: validate-morse
description: Check that a Morse code table maps every letter A-Z and digit 0-9 to the correct ITU dit/dah sequence, with no duplicates or ambiguous codes. Use after creating or editing src/utils/morseDictionary.ts, the reference card table in src/components/ReferenceCard.tsx, or any other Morse lookup table.
---

# Validate a Morse code table

The Telegraph Ghost decodes paddle input with a Morse dictionary. One wrong
entry (for example `E` mapped to `..`, which is really `I`) silently breaks
decoding, so every table must be checked against the international standard
(ITU-R M.1677-1) before it is trusted.

## When to use

- After creating or editing `src/utils/morseDictionary.ts` (the decoder's table).
- After editing the printed table in `src/components/ReferenceCard.tsx`.
- Whenever the user asks whether a Morse mapping is correct or complete.

The `validate-morse` agent hook (`.kiro/hooks/validate-morse.json`) also runs
this automatically when the agent saves either file.

## How to run

Run from the project root (the script finds the nearest `package.json` itself):

```bash
# the decoder dictionary (default target)
node .kiro/powers/morse-validator/skills/validate-morse/scripts/validate-morse.mjs

# any other file, e.g. the reference card
node .kiro/powers/morse-validator/skills/validate-morse/scripts/validate-morse.mjs --file src/components/ReferenceCard.tsx

# require the dictionary to exist (use in CI once Phase 2 lands)
node .kiro/powers/morse-validator/skills/validate-morse/scripts/validate-morse.mjs --strict

# machine-readable output
node .kiro/powers/morse-validator/skills/validate-morse/scripts/validate-morse.mjs --json
```

## What it checks

| Check | Result |
|---|---|
| Every `A`–`Z` and `0`–`9` is present | error listing the missing characters |
| Each code uses only dit `.` and dah `-` | error showing the bad symbols |
| Each code matches ITU-R M.1677-1 | error showing the expected code |
| No two characters share one code | error (the decoder could not tell them apart) |
| No character is defined twice (case-insensitive) | error with both line numbers |
| Typographic `·` / `–` used instead of `.` / `-` | warning (accepted; canonical form preferred) |
| Extra keys such as punctuation | allowed |

Both table shapes in this repo are understood: object entries (`A: '.-'`,
`'1': '.----'`) and tuple entries (`['A', '.-']`).

## Exit codes

- `0`: valid, or the dictionary does not exist yet (without `--strict`)
- `1`: one or more errors (each printed with its line number)
- `2`: bad arguments, or no Morse entries could be found in the file

## Fixing failures

Correct the reported entries to the ITU code shown in the error message, then
run the script again until it exits `0`. Never "fix" a failure by deleting the
character; all 36 are required by the decoder and by the reference card.
