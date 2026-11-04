/**
 * Deploy the built SPA to Swarm — the app serves itself.
 *
 *   npm run deploy        (builds, then uploads)
 *
 * Uploads dist/ as a Swarm collection through the public gateway's null
 * stamp (the same anonymous write path the publisher uses) and prints the
 * reference. The site then lives at https://<ref>.bzz.link/ — and on every
 * other drop that serves Swarm. RAKTBEEJ_API overrides the endpoint.
 */

import { Bee, NULL_STAMP, SWARM_GATEWAY_URL } from '@ethersphere/bee-js'

const api = process.env.RAKTBEEJ_API ?? SWARM_GATEWAY_URL
const bee = new Bee(api, { timeout: 120_000 })

const result = await bee.collection.uploadFromDirectory(NULL_STAMP, 'dist', {
  indexDocument: 'index.html',
  errorDocument: 'index.html',
})

console.log(result.reference.toHex())
