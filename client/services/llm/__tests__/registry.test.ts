// client/services/llm/__tests__/registry.test.ts
import { describe, expect, it } from 'vitest'
import { PROVIDERS, listProviders } from '../registry'
import type { ProviderId } from '../types'

const EXPECTED_IDS: ProviderId[] = [
  'openai', 'anthropic', 'gemini', 'groq', 'openrouter', 'deepseek', 'custom',
]

describe('PROVIDERS registry', () => {
  it('contains every expected provider id', () => {
    for (const id of EXPECTED_IDS) {
      expect(PROVIDERS[id], `missing provider: ${id}`).toBeDefined()
    }
  })

  it('every entry has id matching its key', () => {
    for (const [key, def] of Object.entries(PROVIDERS)) {
      expect(def!.id).toBe(key)
    }
  })

  it('every entry has a non-empty label and defaultModel', () => {
    for (const def of listProviders()) {
      expect(def.label.length).toBeGreaterThan(0)
      expect(def.defaultModel.length).toBeGreaterThan(0)
    }
  })

  it('defaultModel is in the models list (or models is empty for custom)', () => {
    for (const def of listProviders()) {
      if (def.id === 'custom') {
        expect(def.models).toEqual([])
        continue
      }
      const ids = def.models.map(m => m.id)
      expect(ids, `${def.id}: defaultModel ${def.defaultModel} not in models`).toContain(def.defaultModel)
    }
  })

  it('every entry declares both capability flags', () => {
    for (const def of listProviders()) {
      expect(typeof def.capabilities.chat).toBe('boolean')
      expect(typeof def.capabilities.image).toBe('boolean')
    }
  })

  it('deepseek exposes only V4 models', () => {
    const ds = PROVIDERS.deepseek!
    expect(ds.models.map(m => m.id)).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro'])
    expect(ds.defaultModel).toBe('deepseek-v4-flash')
    expect(ds.baseUrl).toBe('https://api.deepseek.com/v1')
    expect(ds.capabilities).toEqual({ chat: true, image: false })
  })
})
