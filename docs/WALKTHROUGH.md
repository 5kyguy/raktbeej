# Walkthrough video script (≤ 5 min)

The takedown test, arc by arc. Record at 1280×720+, two browser windows
side by side (reader left, publisher right). Times are targets, not
strictures.

Setup before recording:

```sh
npm i && npm run dev -- --port 5199 --strictPort
```

- reader window: `http://localhost:5199/#/f=0f8cf58c2616454204c846e234be97e26a957ac5&t=fieldlog`
- publisher window: `http://localhost:5199/#/publish` → load or generate a key
- terminal open, ready to run: `npx vitest run tests/verify.test.ts`
- the deployed app bookmarked: `https://bzz.limo/bzz/0320b6f3f0e86c80f9e54ddb2deba7fee47392c978b93f267d0307a5ff4abb63/`

---

## 0:00 — The name (30 s)

> "Raktabīja, the blood-seed asura: every drop of blood that hit the ground
> rose as another of him. Cutting him down only spread him. This is a
> publishing protocol with the same property."

Show the deployed app in the URL bar — `bzz.limo/bzz/<ref>/` — and the
footer: *"this page is served from Swarm itself."*

> "The app you're looking at is a Swarm chunk. It got there through the same
> anonymous free tier a publisher uses. It hosts itself."

## 0:30 — Anatomy of a link (45 s)

Point at the URL fragment: `#/f=…&t=…`

> "The whole identity lives in the fragment — it's never sent to any server.
> Owner address plus topic. No host owns this link."

Walk the status panel: **drop**, **✓ signed by <owner>**, **index**,
**open on** (three drop links).

> "The reader fetches raw chunks from three interchangeable gateways and
> verifies every signature against that owner. It renders nothing that
> doesn't verify."

## 1:15 — Publish (45 s)

Publisher window: title + a line of markdown → **publish drop**. Narrate the
log as it lands:

> "Post uploaded — content-addressed. Manifest uploaded — the post list.
> Feed updated — index N, chained to the previous payload by hash: the
> bloodline. And a seed went out on the pubsub channel owned by this key."

## 2:00 — The seed lands (40 s)

Switch to the reader window (same feed, or the demo feed): the new post
appears without reload; status shows `live · seed hh:mm`.

> "Swarm retrieval is eventually consistent — a fresh chunk can take a
> minute to reach every gateway. The seed closes that gap: instant, and
> provenance-checked — only the feed's own key can sign one. But a seed is
> just a nudge: the reader still verified everything it showed you."

## 2:40 — The takedown (50 s)

Reader URL → add `?dead=bzz.link`, reload:

> "First demo flag: bzz.link is dead. Watch the panel —"

Banner: `demo: bzz.link blocked — served by drop 2 · gateway`, drop row reads
`drop 2 · gateway — spilled`.

Escalate: `?dead=bzz.link,gateway` → reload → spills to bzz.limo.

> "Every drop is interchangeable, so blocking one — or two — just spills.
> And these 'open on' links are plain `/bytes/<ref>` on each gateway:
> immutable, content-addressed, no moderation wall. Kill them all and you
> still have the offline copy the reader keeps."

## 3:30 — Tampering (40 s)

Terminal: run `npx vitest run tests/verify.test.ts` on camera.

> "What if a gateway serves altered bytes? These are the tests the reader
> lives by: flip one bit of a signed chunk and the signature no longer
> recovers to the owner — refused, never rendered. The reader trusts
> nothing but the key in the link."

(Optionally show the refusal message in `src/lib/verify.ts`.)

## 4:10 — Degraded modes + close (50 s)

Reader with `?seeds=off`:

> "Broker down? `?seeds=off` is what that feels like: freshness falls back
> to 60-second polling. Correctness never depended on the broker."

Close on the repo: README threat model (honest: key compromise and
all-endpoint blocking are out of scope), `docs/PROTOCOL.md` for
interoperating clients, `git log` for the six-milestone build story.

> "Every drop is a seed. Cut it down and it spreads. Repo's in the
> description."
