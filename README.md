# Raktbeej

**rakt·beej** (ruckt-beej) · *noun*

1. (Hindu mythology) Raktabīja, the "blood-seed" asura whose every drop of
   blood that touched the earth rose as another Raktabīja — cutting him down
   only spread him.
2. (computing) A publishing protocol with the same property. *See also: unstoppable.*

A censorship-resistant publishing protocol on [Swarm](https://www.ethswarm.org),
built for the Devcon 8 Build Battle. Every feed update is a signed
single-owner chunk; every reader verifies every byte against the key in the
link; every gateway ("drop") is interchangeable. Block one and the reader
spills to the next — like blood hitting the ground.

**Try it — the app serves itself from Swarm:**

- the app: `https://bzz.limo/bzz/0320b6f3f0e86c80f9e54ddb2deba7fee47392c978b93f267d0307a5ff4abb63/`
- with a live feed: append `#/f=0f8cf58c2616454204c846e234be97e26a957ac5&t=fieldlog`
- or run it locally: `npm i && npm run dev`

## How it works

```
publisher ──signs──▶ feed chunks (SOC) ──raced by──▶ reader
     │                     ▲                              │
     │             /chunks, /bytes                verify vs link's owner
     ▼                     │                              │
  manifest ──points──▶ posts                       render ✓ signed
```

- **The link** (`#/f=<owner>&t=<topic>`) carries the whole identity in the
  URL fragment — never sent to any server, so no host owns it.
- **The feed** is a sequence of single-owner chunks at sequential indices;
  each payload points at an immutable manifest of immutable posts and chains
  `prev` to the previous payload's hash — the bloodline.
- **The reader** is trustless: it fetches raw chunks from every drop in a
  hedged race, verifies each signature client-side, and refuses anything
  that doesn't verify. It keeps a last-good verified offline copy.
- **Seeds** close Swarm's freshness gap: after publishing, the publisher
  announces the new manifest on a pubsub channel owned by its own key, so
  readers refresh instantly — but a seed only nudges a verified refresh.
  Polling (60 s) is the fallback.

Full wire formats and algorithms: [docs/PROTOCOL.md](docs/PROTOCOL.md).
Build story milestone by milestone: `git log`.

## Threat model

Honest accounting — what the protocol resists, and what it doesn't:

| Attack | Result | Why |
| ------ | ------ | --- |
| A drop (gateway) is taken down or blocked | **Resisted** | hedged racing across drops; `/bytes`/`/chunks` links work on any bee node; a miss pulls the next drop in immediately |
| Gateway moderation wall (observed live on bzz.link website mode) | **Resisted** | only affects browser *website* serving; raw `/chunks` + `/bytes` are unmoderated and CORS-open on all drops |
| A drop serves forged/tampered chunks | **Refused** | every chunk must verify against the link's `owner`; refused bytes never render |
| Forged seed messages | **Refused** | channel ownership: only `message.publisher === owner` is accepted, and seeds only trigger a verified refresh |
| Swarm's eventual consistency (fresh chunk 404s for seconds-minutes) | **Resisted** | publisher chains from its write node; readers race drops; seeds give instant refresh; polling covers the rest |
| Broker takedown / flakiness | **Degraded** | seeds die, freshness falls back to 60 s polling — correctness unaffected |
| Publisher key compromised | **Not resisted** | the key is the root of trust. Use a throwaway key per publication (the app does by default) |
| Publisher key lost | **Not resisted** | the feed can never update again (posts already published remain readable) |
| Reader's network blocks *every* Swarm endpoint | **Out of scope** | transport-level blocking; mitigations are a VPN, own bee node, or eventually chunk-relay over pubsub (stretch idea) |
| Content deleted from every node that has it | **Not resisted (today)** | storage is only free-tier-funded until Nov 9 2026; re-stamping by readers ("gardeners") is the designed future fix |

## Demo flags

- `?dead=bzz.link` (or `?dead=bzz.link,gateway`) — block drops for the
  session; watch the reader spill to the next one ("drop 2 · gateway — spilled").
- `?seeds=off` — force the polling-only mode (what a broker takedown feels like).
- `?broker=<multiaddr>` — point the seed layer at a different relay.

## Repo layout

```
src/lib/link.ts      the link codec (fragment ⇄ owner+topic)
src/lib/protocol.ts  wire formats: payload, manifest, seed + canonical JSON
src/lib/verify.ts    SOC addressing + client-side signature verification
src/lib/feed.ts      publish (write-node chained) + trustless verified read
src/lib/gateways.ts  drops, hedged racing (spill), ?dead= demo flag
src/lib/seeds.ts     swarm-pubsub seed channel (listener + publisher side)
src/lib/cache.ts     last-good verified offline copy
src/routes/          publish + read UI (no framework, one h())
scripts/deploy.mjs   uploads the built SPA to Swarm — the app serves itself
tests/               40 unit tests + live e2e (gateway, seeds) behind RAKTBEEJ_E2E=1
```

## Development

```sh
npm i
npm test                        # unit suite
npm run typecheck
RAKTBEEJ_E2E=1 npx vitest run tests/e2e-gateway.test.ts   # live publish + verified read
RAKTBEEJ_E2E=1 npx vitest run tests/e2e-seeds.test.ts     # live broker seed round-trip
npm run deploy                  # build + upload the app itself to Swarm
```

## Status

M0–M5 complete: skeleton → publish path → trustless reader → gateway
racing → live seeds → the app deployed on Swarm itself. Built in ~14 h over
two days for the Devcon 8 Build Battle; storage funded by the event's free
tier until **Nov 9 2026** — after that, the chunks need re-stamping to stay
alive (see threat model).

License: MIT.
