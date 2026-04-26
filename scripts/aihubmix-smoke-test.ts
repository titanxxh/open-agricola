/**
 * Manual smoke test for AiHubMix free-tier models.
 *
 *   pnpm run smoke:aihubmix
 *
 * Reads MY_TEST_AIHUBMIX_APIKEY from .env (do NOT commit the key — .env is gitignored).
 * Performs 3 real network calls:
 *   1. coding-glm-5.1-free  — chat completion
 *   2. k2.6-code-preview-free — chat completion
 *   3. gemini-3.1-flash-image-preview-free — image via chat-completions + modalities
 *
 * Exits 0 on full success, 1 on any failure (with response body dumped).
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

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

function loadKey(): string {
  const envPath = path.join(REPO_ROOT, '.env')
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env not found at', envPath)
    process.exit(1)
  }
  const text = fs.readFileSync(envPath, 'utf8')
  const line = text.split('\n').find(l => l.startsWith('MY_TEST_AIHUBMIX_APIKEY='))
  if (!line) {
    console.error('❌ MY_TEST_AIHUBMIX_APIKEY missing from .env')
    process.exit(1)
  }
  return line.slice('MY_TEST_AIHUBMIX_APIKEY='.length).trim().replace(/^["']|["']$/g, '')
}

const KEY = loadKey()
const BASE = 'https://aihubmix.com/v1'

async function smokeChat(model: string): Promise<void> {
  console.log(`\n▶ Chat: ${model}`)
  const resp = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KEY}`,
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
    console.error(`  ❌ HTTP ${resp.status}`)
    console.error('  body:', await resp.text())
    process.exit(1)
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
    console.error('  ❌ Empty response')
    process.exit(1)
  }
  if (!/function/i.test(collected)) {
    console.error('  ⚠️  Response does not contain "function" — model may have refused or veered off-topic. Body:')
    console.error('  ', collected.slice(0, 500))
  }
  console.log(`  ✅ ${collected.length} chars streamed (snippet: ${collected.slice(0, 80).replace(/\s+/g, ' ')}...)`)
}

async function smokeImage(model: string): Promise<void> {
  console.log(`\n▶ Image: ${model}`)
  const resp = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: 'a red apple on white background' }],
      }],
      modalities: ['text', 'image'],
      temperature: 0.7,
    }),
  })
  if (!resp.ok) {
    console.error(`  ❌ HTTP ${resp.status}`)
    console.error('  body:', await resp.text())
    process.exit(1)
  }
  const data = await resp.json() as {
    // AiHubMix uses snake_case: inline_data / data / mime_type (verified 2026-04-26)
    choices?: Array<{ message?: { multi_mod_content?: Array<{ inline_data?: { data?: string; mime_type?: string } }> } }>
  }
  const parts = data.choices?.[0]?.message?.multi_mod_content ?? []
  const imgPart = parts.find(p => p.inline_data?.data)
  if (!imgPart?.inline_data?.data) {
    console.error('  ❌ No inline image part found. Full response:')
    console.error(JSON.stringify(data, null, 2).slice(0, 2000))
    process.exit(1)
  }
  const len = imgPart.inline_data.data.length
  if (len < 1024) {
    console.error(`  ❌ base64 too short: ${len} chars`)
    process.exit(1)
  }
  console.log(`  ✅ ${len}-char base64 image (mime: ${imgPart.inline_data.mime_type ?? 'image/png'})`)
}

async function main(): Promise<void> {
  console.log('AiHubMix smoke test — calling 3 free models against', BASE)
  await smokeChat('coding-glm-5.1-free')
  await smokeChat('k2.6-code-preview-free')
  await smokeImage('gemini-3.1-flash-image-preview-free')
  console.log('\n✅ All 3 free models reachable via AiHubMix')
}

void main().catch(err => {
  console.error('Smoke test crashed:', err)
  process.exit(1)
})
