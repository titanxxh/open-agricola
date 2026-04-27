import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROVIDER_BASE_URL, readApiKey, resolveLlmTestConfig, type Provider } from './llm-client'

const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_CWD = process.cwd()
let tmpCwd: string | null = null

describe('llm-card-gen llm-client provider configuration', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    delete process.env.GEMINI_API_KEY
    delete process.env.MY_TEST_GEMINI_APIKEY
    delete process.env.OPENAI_API_KEY
    delete process.env.MY_TEST_OPENAI_APIKEY
    delete process.env.OPENROUTER_API_KEY
    delete process.env.MY_TEST_OPENROUTER_APIKEY
    delete process.env.DEEPSEEK_API_KEY
    delete process.env.MY_TEST_DEEPSEEK_APIKEY
    delete process.env.AIHUBMIX_API_KEY
    delete process.env.MY_TEST_AIHUBMIX_APIKEY
    delete process.env.LLM_TEST_CODE_PROVIDER
    delete process.env.LLM_TEST_CODE_MODEL
    delete process.env.LLM_TEST_IMAGE_PROVIDER
    delete process.env.LLM_TEST_IMAGE_MODEL
  })

  afterEach(() => {
    process.chdir(ORIGINAL_CWD)
    if (tmpCwd) {
      rmSync(tmpCwd, { recursive: true, force: true })
      tmpCwd = null
    }
    process.env = { ...ORIGINAL_ENV }
  })

  it('defines chat completion endpoints for every selectable provider', () => {
    expect(PROVIDER_BASE_URL).toMatchObject({
      gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      openai: 'https://api.openai.com/v1/chat/completions',
      openrouter: 'https://openrouter.ai/api/v1/chat/completions',
      deepseek: 'https://api.deepseek.com/v1/chat/completions',
      aihubmix: 'https://aihubmix.com/v1/chat/completions',
    })
  })

  it('reads provider-specific API keys from environment variables', () => {
    process.env.GEMINI_API_KEY = 'gem-key'
    process.env.OPENAI_API_KEY = 'openai-key'
    process.env.OPENROUTER_API_KEY = 'or-key'
    process.env.DEEPSEEK_API_KEY = 'ds-key'
    process.env.AIHUBMIX_API_KEY = 'aihub-key'

    expect(readApiKey('gemini')).toBe('gem-key')
    expect(readApiKey('openai')).toBe('openai-key')
    expect(readApiKey('openrouter' as Provider)).toBe('or-key')
    expect(readApiKey('deepseek' as Provider)).toBe('ds-key')
    expect(readApiKey('aihubmix' as Provider)).toBe('aihub-key')
  })

  it('accepts MY_TEST_* aliases used by local .env files', () => {
    process.env.MY_TEST_GEMINI_APIKEY = 'gem-test-key'
    process.env.MY_TEST_OPENAI_APIKEY = 'openai-test-key'
    process.env.MY_TEST_OPENROUTER_APIKEY = 'or-test-key'
    process.env.MY_TEST_DEEPSEEK_APIKEY = 'ds-test-key'
    process.env.MY_TEST_AIHUBMIX_APIKEY = 'aihub-test-key'

    expect(readApiKey('gemini')).toBe('gem-test-key')
    expect(readApiKey('openai')).toBe('openai-test-key')
    expect(readApiKey('openrouter' as Provider)).toBe('or-test-key')
    expect(readApiKey('deepseek' as Provider)).toBe('ds-test-key')
    expect(readApiKey('aihubmix' as Provider)).toBe('aihub-test-key')
  })

  it('falls back to reading MY_TEST_DEEPSEEK_APIKEY from .env', () => {
    tmpCwd = mkdtempSync(join(tmpdir(), 'llm-card-gen-'))
    writeFileSync(join(tmpCwd, '.env'), 'MY_TEST_DEEPSEEK_APIKEY=deepseek-dotenv-key\n', 'utf8')
    process.chdir(tmpCwd)

    expect(readApiKey('deepseek')).toBe('deepseek-dotenv-key')
  })

  it('reads code-generation provider and model from code-specific env vars', () => {
    process.env.LLM_TEST_CODE_PROVIDER = 'aihubmix'
    process.env.LLM_TEST_CODE_MODEL = 'coding-glm-5.1-free'

    expect(resolveLlmTestConfig('code')).toEqual({
      provider: 'aihubmix',
      model: 'coding-glm-5.1-free',
    })
  })

  it('reads image provider and model from image-specific env vars', () => {
    process.env.LLM_TEST_IMAGE_PROVIDER = 'aihubmix'
    process.env.LLM_TEST_IMAGE_MODEL = 'gemini-3.1-flash-image-preview-free'

    expect(resolveLlmTestConfig('image')).toEqual({
      provider: 'aihubmix',
      model: 'gemini-3.1-flash-image-preview-free',
    })
  })

  it('uses purpose-specific defaults when env vars are absent', () => {
    expect(resolveLlmTestConfig('code')).toEqual({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
    })
    expect(resolveLlmTestConfig('image')).toEqual({
      provider: 'aihubmix',
      model: 'gemini-3.1-flash-image-preview-free',
    })
  })
})
