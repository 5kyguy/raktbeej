/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  // relative so the bundle works wherever Swarm serves it: subdomain
  // (https://<ref>.bzz.link/) or path (https://…/bzz/<ref>/)
  base: './',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
