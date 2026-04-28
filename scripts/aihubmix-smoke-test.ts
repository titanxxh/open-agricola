/**
 * Manual smoke test for AiHubMix free-tier models.
 *
 *   pnpm run smoke:aihubmix
 *   pnpm run smoke:aihubmix:image
 *   pnpm run smoke:gemini:image
 *
 * Reads test API keys from .env (do NOT commit the key — .env is gitignored).
 * Performs real network calls:
 *   1. coding-glm-5.1-free  — chat completion
 *   2. k2.6-code-preview-free — chat completion
 *   3. gemini-3.1-flash-image-preview-free — two card-art image cases
 * Writes generated code and image artifacts to output/tmp/aihubmix-smoke/.
 *
 * Exits 0 on full success, 1 on any failure (with response body dumped).
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCardArtPrompt } from '../client/services/llm/card-utils.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKTREE_ROOT = path.resolve(__dirname, '..')

/**
 * Resolve the main repo root even when running from a git worktree.
 * In a worktree, .git is a file like: "gitdir: /path/to/.git/worktrees/<name>"
 * We walk up to .git/worktrees/<name>/../../.. to reach the main repo root.
 * Falls back to WORKTREE_ROOT if the .git file doesn't match the pattern.
 */
function resolveRepoRoot(): string {
  const gitFile = path.join(WORKTREE_ROOT, '.git')
  if (fs.existsSync(gitFile) && fs.statSync(gitFile).isFile()) {
    const content = fs.readFileSync(gitFile, 'utf8').trim()
    // "gitdir: /abs/path/.git/worktrees/<name>"
    const m = content.match(/^gitdir:\s*(.+)$/)
    if (m) {
      const gitdir = m[1].trim()
      // gitdir = <mainRepo>/.git/worktrees/<name>  → go up 3 levels
      const candidate = path.resolve(gitdir, '../../..')
      if (fs.existsSync(path.join(candidate, '.git'))) {
        return candidate
      }
    }
  }
  return WORKTREE_ROOT
}

const REPO_ROOT = resolveRepoRoot()
const ENV_TEXT = loadEnvText()

function loadEnvText(): string {
  const envPath = path.join(REPO_ROOT, '.env')
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env not found at', envPath)
    process.exit(1)
  }
  return fs.readFileSync(envPath, 'utf8')
}

function loadKey(envNames: string[]): string {
  for (const envName of envNames) {
    const processValue = process.env[envName]
    if (processValue) return processValue
    const line = ENV_TEXT.split('\n').find(l => l.startsWith(`${envName}=`))
    if (line) return line.slice(envName.length + 1).trim().replace(/^["']|["']$/g, '')
  }
  console.error(`❌ Missing API key env: ${envNames.join(' or ')}`)
  process.exit(1)
}

const BASE = 'https://aihubmix.com/v1'
const OUTPUT_DIR = path.join(REPO_ROOT, 'output', 'tmp', 'aihubmix-smoke')

type SmokeMode = 'all' | 'code' | 'image'
type ImageProvider = 'aihubmix' | 'gemini'
type SmokeCard = {
  id: string
  name: string
  type: 'minor' | 'occupation'
  artSubject: string
}

const SMOKE_IMAGE_CARDS: SmokeCard[] = [
  {
    id: 'CUSTOM_M1_QuickHaul',
    name: '速运',
    type: 'minor',
    artSubject: '一辆装满木材和食物的小型手推车，由农夫在泥土小路上快速推行',
  },
  {
    id: 'CUSTOM_M2_LumberJackBoots',
    name: '伐木靴',
    type: 'occupation',
    artSubject: '一位穿着结实木屑靴子的伐木工，肩扛斧头，站在农场边缘的木柴堆旁',
  },
]

const AIHUBMIX_KEY = loadKey(['AIHUBMIX_API_KEY', 'MY_TEST_AIHUBMIX_APIKEY'])

function ensureOutputDir(): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

function safeModelName(model: string): string {
  return model.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function extensionForMime(mime: string | undefined): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  return 'png'
}

async function failFromResponse(label: string, resp: Response): Promise<never> {
  const body = await resp.text()
  throw new Error(`${label} HTTP ${resp.status}: ${body}`)
}

async function smokeChat(model: string): Promise<void> {
  console.log(`\n▶ Chat: ${model}`)
  const resp = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AIHUBMIX_KEY}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'user', content: "Write a TypeScript function that returns the string 'hello'." },
      ],
      max_tokens: 256,
    }),
  })
  if (!resp.ok) {
    await failFromResponse(`Chat ${model}`, resp)
  }
  // Collect SSE deltas
  const reader = resp.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let collected = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith('data: ')) continue
      const payload = t.slice(6)
      if (payload === '[DONE]') continue
      try {
        const data = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> }
        const c = data.choices?.[0]?.delta?.content
        if (c) collected += c
      } catch { /* mid-stream parse */ }
    }
  }
  if (!collected.trim()) {
    throw new Error(`Chat ${model} returned empty response`)
  }
  if (!/function/i.test(collected)) {
    console.error('  ⚠️  Response does not contain "function" — model may have refused or veered off-topic. Body:')
    console.error('  ', collected.slice(0, 500))
  }
  const outPath = path.join(OUTPUT_DIR, `${safeModelName(model)}-code.txt`)
  fs.writeFileSync(outPath, collected, 'utf8')
  console.log(`  ✅ ${collected.length} chars streamed (snippet: ${collected.slice(0, 80).replace(/\s+/g, ' ')}...)`)
  console.log(`  ↳ saved code output: ${path.relative(REPO_ROOT, outPath)}`)
}

async function smokeImage(provider: ImageProvider, model: string, card: SmokeCard): Promise<void> {
  const prompt = buildCardArtPrompt(card.artSubject, card.type, 'zh')
  const promptPath = path.join(OUTPUT_DIR, `${card.id}-${provider}-${safeModelName(model)}-prompt.txt`)
  fs.writeFileSync(promptPath, prompt, 'utf8')

  console.log(`\n▶ Image: ${provider}/${model} (${card.id} ${card.name}, ${card.type})`)
  console.log(`  ↳ saved art prompt: ${path.relative(REPO_ROOT, promptPath)}`)
  const { data, mime } = provider === 'gemini'
    ? await generateGeminiImage(model, prompt)
    : await generateAiHubMixImage(model, prompt)
  if (data.length < 1024) {
    throw new Error(`Image ${provider}/${model} base64 too short: ${data.length} chars`)
  }
  const outPath = path.join(OUTPUT_DIR, `${card.id}-${provider}-${safeModelName(model)}-image.${extensionForMime(mime)}`)
  fs.writeFileSync(outPath, Buffer.from(data, 'base64'))
  console.log(`  ✅ ${data.length}-char base64 image (mime: ${mime})`)
  console.log(`  ↳ saved image output: ${path.relative(REPO_ROOT, outPath)}`)
}

async function generateAiHubMixImage(model: string, prompt: string): Promise<{ data: string; mime: string }> {
  const resp = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AIHUBMIX_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: prompt }],
      }],
      modalities: ['text', 'image'],
      temperature: 0.7,
    }),
  })
  if (!resp.ok) {
    await failFromResponse(`Image ${model}`, resp)
  }
  const data = await resp.json() as {
    // AiHubMix uses snake_case: inline_data / data / mime_type (verified 2026-04-26)
    choices?: Array<{ message?: { multi_mod_content?: Array<{ inline_data?: { data?: string; mime_type?: string } }> } }>
  }
  const parts = data.choices?.[0]?.message?.multi_mod_content ?? []
  const imgPart = parts.find(p => p.inline_data?.data)
  if (!imgPart?.inline_data?.data) {
    throw new Error(`Image ${model} returned no inline image part: ${JSON.stringify(data, null, 2).slice(0, 2000)}`)
  }
  return { data: imgPart.inline_data.data, mime: imgPart.inline_data.mime_type ?? 'image/png' }
}

async function generateGeminiImage(model: string, prompt: string): Promise<{ data: string; mime: string }> {
  const key = loadKey(['GEMINI_API_KEY', 'MY_TEST_GEMINI_APIKEY'])
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    },
  )
  if (!resp.ok) {
    await failFromResponse(`Image gemini/${model}`, resp)
  }
  const data = await resp.json() as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[]
  }
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const imgPart = parts.find(p => p.inlineData?.data)
  if (!imgPart?.inlineData?.data) {
    throw new Error(`Image gemini/${model} returned no inline image part: ${JSON.stringify(data, null, 2).slice(0, 2000)}`)
  }
  return { data: imgPart.inlineData.data, mime: imgPart.inlineData.mimeType ?? 'image/png' }
}

function parseMode(): SmokeMode {
  if (process.argv.includes('--image-only')) return 'image'
  if (process.argv.includes('--code-only')) return 'code'
  return 'all'
}

function parseArg(name: string): string | null {
  const prefix = `--${name}=`
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length) ?? null
}

function parseImageProvider(): ImageProvider {
  const raw = parseArg('image-provider') ?? process.env.LLM_TEST_IMAGE_PROVIDER ?? 'aihubmix'
  if (raw === 'aihubmix' || raw === 'gemini') return raw
  throw new Error(`Unsupported image provider: ${raw}`)
}

function parseImageModel(provider: ImageProvider): string {
  return parseArg('image-model')
    ?? process.env.LLM_TEST_IMAGE_MODEL
    ?? (provider === 'gemini' ? 'gemini-2.5-flash-image' : 'gemini-3.1-flash-image-preview-free')
}

async function main(): Promise<void> {
  const mode = parseMode()
  const imageProvider = parseImageProvider()
  const imageModel = parseImageModel(imageProvider)
  ensureOutputDir()
  console.log('LLM smoke test — calling configured provider models')
  console.log(`Mode: ${mode}`)
  console.log(`Image provider/model: ${imageProvider}/${imageModel}`)
  console.log('Artifacts:', path.relative(REPO_ROOT, OUTPUT_DIR))
  const failures: string[] = []
  const runStep = async (label: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failures.push(`${label}: ${message}`)
      console.error(`  ❌ ${message}`)
    }
  }

  if (mode === 'all' || mode === 'code') {
    await runStep('coding-glm-5.1-free', () => smokeChat('coding-glm-5.1-free'))
    await runStep('k2.6-code-preview-free', () => smokeChat('k2.6-code-preview-free'))
  }
  if (mode === 'all' || mode === 'image') {
    for (const card of SMOKE_IMAGE_CARDS) {
      await runStep(`${card.id}-image`, () => smokeImage(imageProvider, imageModel, card))
    }
  }

  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} AiHubMix smoke step(s) failed.`)
    process.exit(1)
  }
  console.log('\n✅ Requested AiHubMix smoke steps completed')
}

void main().catch(err => {
  console.error('Smoke test crashed:', err)
  process.exit(1)
})
