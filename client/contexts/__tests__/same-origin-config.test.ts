// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules() })

it.each([
  ['https://game.example.test/open-agricola/', 'wss://game.example.test/ws'],
  ['https://game.example.test:8443/open-agricola/', 'wss://game.example.test:8443/ws'],
  ['http://localhost:3000/', 'ws://localhost:3000/ws'],
])('uses the actual public origin for same-origin WS from %s', async (url, expected) => {
  vi.stubEnv('VITE_API_BASE', '')
  vi.stubEnv('VITE_WS_BASE', '')
  vi.stubEnv('DEV', false)
  vi.stubGlobal('window', { location: new URL(url) })
  const config = await import('../../config')
  expect(config.API_BASE).toBe('')
  expect(config.WS_BASE).toBe(expected)
})

it('retains the existing direct backend default for local development', async () => {
  vi.stubEnv('VITE_API_BASE', '')
  vi.stubEnv('VITE_WS_BASE', '')
  vi.stubEnv('DEV', true)
  vi.stubGlobal('window', { location: new URL('http://localhost:3000/') })
  const config = await import('../../config')
  expect(config.WS_BASE).toBe('ws://localhost:5175/ws')
})

it('retains explicitly configured API and routed WS bases', async () => {
  vi.stubEnv('VITE_API_BASE', 'https://api.example.test')
  vi.stubEnv('VITE_WS_BASE', 'wss://api.example.test/ws')
  const config = await import('../../config')
  expect(config.API_BASE).toBe('https://api.example.test')
  expect(config.WS_BASE).toBe('wss://api.example.test/ws')
})
