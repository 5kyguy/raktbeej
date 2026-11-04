# Raktbeej Protocol

Normative spec, v1 — written as it was implemented (commit history is the
changelog). Everything a second client needs to interoperate.

## 1. Actors

| Actor | Holds | Role |
| ----- | ----- | ---- |
| publisher | an Ethereum key | signs feed updates, announces seeds |
| reader | a raktbeej link | verifies everything it renders |
| drops | bee gateways | interchangeable HTTP doors into Swarm |
| broker | a libp2p relay | relays live seed messages (optional) |

Design rule: **the reader trusts nothing but the link.** Every byte rendered
is verified client-side against the `owner` embedded in the link; drops can
serve, refuse, or lie — lying is detected, refusing is spilled past.

## 2. The link

```
https://any-host/#/f=<owner>&t=<topic>
```

- `owner` — 20-byte Ethereum address of the publisher key, 40 hex chars, no
  `0x` prefix (lowercase).
- `topic` — feed topic name, 1–64 UTF-8 characters, URL-encoded.

The identity lives in the **fragment**, which browsers never send to any
server. Any host can serve the reader app — or none: the link alone
determines what to fetch and how to verify it.

## 3. Storage layout

Three layers, each immutable and content-addressed except the feed head:

1. **Post** — the markdown body, uploaded raw (`POST /bytes`).
2. **Manifest** — canonical JSON, uploaded raw:

   ```json
   { "v": 1, "posts": [ { "title": "…", "ts": 1730000000000, "ref": "<64hex>" } ] }
   ```

   `posts` is append-only across updates; `ref` points at the post body.
3. **Feed head** — a sequence of single-owner chunks (SOC), one per update.

### Feed chunks

For update index `i` (plain sequential bigint: 0, 1, 2, …):

```
identifier = keccak256( topicBytes || feedIndexBytes(i) )   // 32 B
address    = keccak256( identifier || ownerBytes )          // where it lives
chunk      = identifier || signature || span || payloadBytes
```

`feedIndexBytes` is the bee feed-index encoding (8-byte big-endian, as
`FeedIndex.fromBigInt`). The signature covers the identifier and the
payload's content address; the signer must recover to `owner`. The chunk is
fetched raw (`GET /chunks/<address>`) and verified client-side — the
recovered address must equal the chunk address, which embeds `owner`.

### Payload

Canonical JSON (fixed key order — the byte encoding is deterministic, which
is what makes `prev` a hash chain):

```json
{ "v": 1, "ts": <unix ms>, "prev": <64hex | null>, "manifest": <64hex> }
```

Must stay well under the 4 KB SOC limit. `prev` is `keccak256` of the
previous payload's canonical bytes — **the bloodline**: a history that
cannot be silently rewritten without breaking the chain.

## 4. Publishing

1. Read the current head. Because Swarm retrieval is eventually consistent
   (a fresh chunk may 404 for seconds-to-minutes on some drops), the
   publisher reads the head **from its write node** (`GET /feeds/<owner>/<topic>`)
   and chains `prev` from the payload it finds there.
2. Upload the post body → ref.
3. Upload the new manifest (previous posts + the new entry) → ref.
4. Build the payload (`prev` = hash of the previous payload) and upload it
   as the SOC at index `lastIndex + 1` (`POST /feeds` with the publisher
   key; anonymous free tier: gateway + null stamp).
5. Announce a **seed** (§6).

## 5. Reading

1. Parse the link from the fragment.
2. Starting at index 0, fetch `GET /chunks/<feedChunkAddress(topic, i, owner)>`
   **racing the drops** (§7) and verify the SOC. Walk upward until the first
   index no drop can serve — that is the head. (In practice: probe near the
   last seen index + a short walk; cold readers walk from 0.)
3. Fetch and verify the payload's `manifest` (`GET /bytes/<manifest>`),
   then each post body (`GET /bytes/<ref>`).
4. Render. Anything that does not verify is refused, never rendered —
   `refused: bytes served for <address> do not verify against the link's owner`.
5. Cache the verified publication locally (last-good copy; offline-tolerant).

A miss (404 on every drop) ends the walk. A tampered chunk aborts it. A
fault outranks a miss: "no drop has this chunk" stays distinguishable from
"the drops are down".

## 6. Seeds (live layer)

Swarm's eventual consistency means a fresh update can take a minute to
appear on every drop. Seeds close that gap with a pubsub announce
(`swarm-pubsub`, libp2p broker — no local bee node, keys need no funds):

- channel topic: `raktbeej:seed:<topic>`
- channel owner: **the publisher's own key** — so `message.publisher` is
  unforgeable provenance; readers accept a seed only when it equals `owner`.
- message: canonical JSON `{ "type": "seed", "ts": <ms>, "manifest": <64hex>, "index": <n> }`

A seed is **only a nudge**: the reader re-runs the verified walk and renders
nothing that does not verify. Polling (60 s + tab focus) is the designed
fallback; a dead broker degrades freshness, never correctness.
`?seeds=off` disables the layer; `?broker=<multiaddr>` picks another relay.

## 7. Drops and the spill

| # | id | origin | notes |
| - | -- | ------ | ----- |
| 1 | bzz.link | `https://bzz.link` | browser website mode sits behind a hash-approval wall (observed live); raw `/chunks` + `/bytes` are open (CORS `*`) |
| 2 | gateway | `https://api.gateway.ethswarm.org` | anonymous writes via null stamp (CORS `*`) |
| 3 | bzz.limo | `https://bzz.limo` | serves websites directly (echoes any CORS origin) |

Retrieval is a **hedged race**: drop 1 goes first; if it stalls, later drops
join after 750 ms; a 404 pulls the next drop in immediately; the first drop
to produce content wins and the stragglers are aborted. The drop that served
is shown in the reader ("drop 2 · gateway — spilled"), and each post can be
opened on any drop via `GET /bytes/<manifest-ref>`.

`?dead=<id>,<id>` blocks drops for the session — the rehearsal flag that
makes a takedown demoable without touching the network.

## 8. The app serves itself

The reader is a static SPA, uploaded to Swarm as a collection through the
same anonymous write path (`npm run deploy`). It then serves itself from any
drop that serves websites — e.g. `https://bzz.limo/bzz/<ref>/` — with all
fetches cross-origin to the drops (CORS above) and the seed channel over
wss. When served from a `/bzz/<ref>/` path the app displays its own
immutable reference, read out of the URL.

## 9. Conformance summary

A conforming reader:

- verifies every SOC against the link's `owner` before using it,
- verifies manifests/payload shape before rendering (never renders refused bytes),
- accepts seeds only from `message.publisher === owner`, as nudges,
- works against any drop, in any order, missing any subset,
- keeps a last-good verified copy for offline reading.

A conforming publisher:

- chains `prev` from the write node's current head,
- writes only SOCs signed by the key whose address is in the link,
- appends to the manifest (never rewrites history),
- announces seeds after each update, tolerating broker failure.
