---
name: fetch-streams
description: Find and verify three CORS-friendly live internet radio streams (news, sports, jazz) and write them to src/data/liveStreams.ts for the radio's RX-only broadcasters. Use before a demo, when a broadcaster plays only static, or when the user asks to change what the broadcast stations play.
---

# Provision the live broadcast streams

The radio's three broadcasters (89.30 news, 93.50 sports, 98.10 jazz) play real
internet radio through a vintage AM filter chain (`src/utils/audioEngine.ts`,
`createBroadcastChain`). The browser feeds the stream to Web Audio with
`createMediaElementSource()`, which only works when the stream server sends
CORS headers: without `Access-Control-Allow-Origin` the audio element fails to
load (with `crossOrigin="anonymous"`) or Web Audio hears silence. Most stream
directories don't say which streams send CORS, so every candidate has to be
checked.

## When to use

- Before recording the demo, or deploying: stations change and streams go away.
- When a broadcaster plays only its carrier and static (its stream failed).
- When the user wants different stations: pass `--prefer` or edit the curated
  list at the top of the script.

## How to run

From the project root. Needs Node 18+ and internet access:

```bash
# find, verify, and write src/data/liveStreams.ts
node .kiro/powers/live-streams/skills/fetch-streams/scripts/fetch-streams.mjs

# check what's there now without writing
node .kiro/powers/live-streams/skills/fetch-streams/scripts/fetch-streams.mjs --check

# verify against the origin you'll serve from (default https://example.com)
node .kiro/powers/live-streams/skills/fetch-streams/scripts/fetch-streams.mjs --origin https://my-app.example
```

For each slot it tries the curated candidates first, then the most-listened
working HTTPS MP3/AAC stations for that genre in the Radio Browser directory
(`--api` overrides the directory's base URL). A candidate is accepted only if:

1. the URL is HTTPS (the app is served over HTTPS; mixed content is blocked),
2. a GET with an `Origin` header answers 200/206 with an `audio/*` (or `application/ogg`) content type,
3. the response carries `Access-Control-Allow-Origin` of `*` or that origin.

It then writes `src/data/liveStreams.ts` with `verified: true` and the time of
the check, and exits non-zero if any slot is still empty.

## Reading the output

```
89.30 news    ✓ NPR News                    https://...   (cors: *)
93.50 sports  ✗ no candidate passed (12 tried: 7 no CORS, 3 http only, 2 errors)
98.10 jazz    ✓ SomaFM Sonic Universe       https://...   (cors: *)
```

An empty slot leaves that broadcaster as its carrier and static: the app
never breaks. Try `--prefer "<name or url>"` or add a candidate and re-run.
