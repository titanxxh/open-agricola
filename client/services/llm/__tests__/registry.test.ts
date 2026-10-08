// client/services/llm/__tests__/registry.test.ts
import { describe, expect, it } from 'vitest'
import { PROVIDERS, listProviders, listModelsFor, defaultModelFor } from '../registry'
import type { ProviderDef, ProviderId } from '../types'

const EXPECTED_IDS: ProviderId[] = [
  'gemini', 'openrouter', 'deepseek', 'aihubmix',
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

  it('defaultModel is in the models list', () => {
    for (const def of listProviders()) {
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

  it('deepseek defaults to canonical V4.1 Flash and offers the current V4 Pro', () => {
    const ds = PROVIDERS.deepseek!
    expect(ds.models.map(m => m.id)).toEqual(['deepseek-flash', 'deepseek-v4-pro'])
    expect(ds.defaultModel).toBe('deepseek-flash')
    expect(ds.baseUrl).toBe('https://api.deepseek.com/v1')
    expect(ds.capabilities).toEqual({ chat: true, image: false })
  })

  it('openrouter exposes supported image generation models', () => {
    const openrouter = PROVIDERS.openrouter!
    expect(openrouter.capabilities).toEqual({ chat: false, image: false })
    expect(listModelsFor(openrouter, 'image').map(m => m.id)).toEqual([
      'openai/gpt-5-image-mini',
      'google/gemini-2.5-flash-image',
      'bytedance-seed/seedream-4.5',
    ])
    expect(listModelsFor(openrouter, 'image').map(m => m.id)).not.toContain('qwen/qwen3.6-plus:free')
  })

  it('openrouter exposes the current DeepSeek Flash and Pro checkpoints', () => {
    const openrouter = PROVIDERS.openrouter!
    expect(listModelsFor(openrouter, 'chat').map(m => m.id)).toEqual(expect.arrayContaining([
      'deepseek/deepseek-v4.1-flash',
      'deepseek/deepseek-v4-pro-0813',
    ]))
    expect(listModelsFor(openrouter, 'chat').map(m => m.id)).not.toContain('openai/gpt-5-image-mini')
  })

  it('aihubmix exposes the 3 free models with proper capabilities', () => {
    const a = PROVIDERS.aihubmix!
    expect(a.models.map(m => m.id)).toEqual([
      'gemini-3.1-flash-image-preview-free',
      'coding-glm-5.1-free',
      'k2.6-code-preview-free',
    ])
    expect(a.defaultModel).toBe('coding-glm-5.1-free')
    expect(a.baseUrl).toBe('https://aihubmix.com/v1')
    expect(a.capabilities).toEqual({ chat: true, image: true })
  })

  it('gemini exposes supported chat and image models with proper capabilities', () => {
    const g = PROVIDERS.gemini!
    expect(g.models.map(m => m.id)).toEqual([
      'gemini-3.1-pro-preview',
      'gemini-3.1-flash-image-preview',
      'gemini-2.5-flash-image',
    ])
    expect(g.defaultModel).toBe('gemini-3.1-pro-preview')
    expect(g.models[0].capabilities).toEqual({ chat: true, image: true })
    expect(g.models[1].capabilities).toEqual({ chat: false, image: true })
    expect(g.models[2].capabilities).toEqual({ chat: false, image: true })
  })

  describe('listModelsFor', () => {
    it('returns all models for a provider whose capability matches at provider level', () => {
      const fake: ProviderDef = {
        id: 'aihubmix',
        label: 'fake',
        defaultModel: 'a',
        models: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        apiKeyHint: '',
        capabilities: { chat: true, image: false },
      }
      const models = listModelsFor(fake, 'chat')
      expect(models.map(m => m.id)).toEqual(['a', 'b'])
    })

    it('returns empty when capability is false at provider level and no model overrides', () => {
      const models = listModelsFor(PROVIDERS.deepseek!, 'image')
      expect(models).toEqual([])
    })

    it('respects per-model capability overrides', () => {
      const fake: ProviderDef = {
        id: 'aihubmix',
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
        id: 'aihubmix',
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
