// client/services/llm/__tests__/registry.test.ts
import { describe, expect, it } from 'vitest'
import { PROVIDERS, listProviders, listModelsFor, defaultModelFor } from '../registry'
import type { ProviderDef, ProviderId } from '../types'

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

  it('openrouter exposes supported image generation models', () => {
    const openrouter = PROVIDERS.openrouter!
    expect(openrouter.capabilities.image).toBe(true)
    expect(openrouter.models.map(m => m.id)).toEqual(expect.arrayContaining([
      'openai/gpt-5-image-mini',
      'google/gemini-2.5-flash-image',
      'bytedance-seed/seedream-4.5',
    ]))
  })

  it('openrouter exposes DeepSeek V4 chat models', () => {
    const openrouter = PROVIDERS.openrouter!
    expect(openrouter.models.map(m => m.id)).toEqual(expect.arrayContaining([
      'deepseek/deepseek-v4-flash',
      'deepseek/deepseek-v4-pro',
    ]))
  })

  describe('listModelsFor', () => {
    it('returns all models for a provider whose capability matches at provider level', () => {
      // openrouter is chat:true, image:true; no per-model overrides — chat filter passes all
      const models = listModelsFor(PROVIDERS.openrouter!, 'chat')
      expect(models.length).toBe(PROVIDERS.openrouter!.models.length)
    })

    it('returns empty when capability is false at provider level and no model overrides', () => {
      const models = listModelsFor(PROVIDERS.deepseek!, 'image')
      expect(models).toEqual([])
    })

    it('respects per-model capability overrides', () => {
      const fake: ProviderDef = {
        id: 'custom',
        label: 'fake',
        defaultModel: 'a',
        models: [
          { id: 'a', label: 'A', capabilities: { chat: true, image: false } },
          { id: 'b', label: 'B', capabilities: { chat: false, image: true } },
        ],
        apiKeyHint: '',
        capabilities: { chat: true, image: true },
      }
      expect(listModelsFor(fake, 'chat').map(m => m.id)).toEqual(['a'])
      expect(listModelsFor(fake, 'image').map(m => m.id)).toEqual(['b'])
    })
  })

  describe('defaultModelFor', () => {
    it('returns provider.defaultModel when it supports the requested capability', () => {
      // openrouter.defaultModel = 'qwen/qwen3.6-plus:free' (chat-capable)
      expect(defaultModelFor(PROVIDERS.openrouter!, 'chat')).toBe('qwen/qwen3.6-plus:free')
    })

    it('returns first capability-matching model when defaultModel does not match', () => {
      const fake: ProviderDef = {
        id: 'custom',
        label: 'fake',
        defaultModel: 'a',
        models: [
          { id: 'a', label: 'A', capabilities: { chat: true, image: false } },
          { id: 'b', label: 'B', capabilities: { chat: false, image: true } },
          { id: 'c', label: 'C', capabilities: { chat: false, image: true } },
        ],
        apiKeyHint: '',
        capabilities: { chat: true, image: true },
      }
      expect(defaultModelFor(fake, 'image')).toBe('b')
    })

    it('returns null when no model supports the capability', () => {
      expect(defaultModelFor(PROVIDERS.deepseek!, 'image')).toBeNull()
    })
  })
})
