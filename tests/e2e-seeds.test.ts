/**
 * Live seed-channel test against the public swarm-pubsub broker.
 *
 * Not part of the default suite — needs the network and the broker. Run:
 *
 *   RAKTBEEJ_E2E=1 npx vitest run tests/e2e-seeds.test.ts
 *
 * Exercises the exact M4 path: a subscriber listens on its own connection,
 * the publisher opens the channel with the feed's own key, and the seed
 * arrives with unforgeable publisher provenance.
 */

import { describe, expect, it } from 'vitest'
import { addressFromPrivateKey, connect, generatePrivateKey } from 'swarm-pubsub'

import type { RaktbeejLink } from '../src/lib/link'
import { DEFAULT_BROKER, parseSeedMessage, seedTopic } from '../src/lib/seeds'

const run = !!process.env.RAKTBEEJ_E2E
const d = run ? describe : describe.skip

d('seed channel through the public broker (M4 success test)', () => {
  it('delivers an owner-signed seed to a subscriber on another connection', { timeout: 90_000 }, async () => {
    const keyHex = generatePrivateKey()
    const owner = addressFromPrivateKey(keyHex)
    const link: RaktbeejLink = { owner, topic: `seed-e2e-${Date.now()}` }
    const seed = { type: 'seed' as const, ts: Date.now(), manifest: 'c'.repeat(64), index: 7 }

    // listener first — messages are live only
    const subscriberBroker = await connect(DEFAULT_BROKER)
    const received = new Promise<{ publisher: string; text: string }>((resolve) => {
      void subscriberBroker.subscribe(owner, seedTopic(link), {
        onMessage: (message) => resolve({ publisher: message.publisher, text: message.text() }),
      })
    })

    const publisherBroker = await connect(DEFAULT_BROKER)
    const channel = await publisherBroker.publish(seedTopic(link), keyHex)
    await channel.send(JSON.stringify(seed))

    const message = await received
    expect(message.publisher).toBe(owner)
    expect(parseSeedMessage(message.text, message.publisher, owner)).toEqual(seed)

    await channel.close()
    await publisherBroker.close()
    await subscriberBroker.close()
  })
})
