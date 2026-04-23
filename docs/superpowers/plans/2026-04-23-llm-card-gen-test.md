# LLM 卡牌生成自动化测试 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个手动触发的自动化测试套件，验证给定 LLM（默认 Gemini gemini-3.1-pro-preview）能否通过当前 workshop prompt 生成可在 GameSession 里跑通的卡牌实现，覆盖 9 个常见机制各 1 张测试卡。

**Architecture:** 新增 `tests/llm-card-gen/` 目录：(1) minimal Node fetch LLM client，OpenAI 兼容路由；(2) 9 张 fixture 卡（M1-M9）各自的 scenario/trigger/assert；(3) vitest runner 遍历 fixtures，调 LLM → 提取代码 → `validateAndCompileCustomCode` → 注册到 fresh GameSession → 触发 → 断言。配套独立 `pnpm test:llm` 脚本，新 `.github/workflows/ci-llm-cards.yml`（only `workflow_dispatch`），不进默认 CI。

**Tech Stack:** Vitest 4，Node 22 原生 fetch，复用 `server/custom-code/engine.ts` (`validateAndCompileCustomCode` + `invokeCustomCodeEffect`)，复用 `client/services/llmPrompts.ts` 的 `CARD_DESIGNER_SYSTEM_PROMPT`。

**Spec:** `docs/superpowers/specs/2026-04-23-llm-card-gen-test-design.md`

---

## File Structure

| File | Operation | Responsibility |
|---|---|---|
| `tests/llm-card-gen/llm-client.ts` | Create | Provider 路由（gemini / openai）+ retry on 429/5xx + timeout |
| `tests/llm-card-gen/extract.ts` | Create | 从 LLM markdown 响应里抽出 `CARD_DEF`/`CARD_IMPL` 完整 TS 代码块 |
| `tests/llm-card-gen/session-helpers.ts` | Create | `freshSessionWithCustomCard(code, meta)` 等 scenario 起点 + `triggerHarvestFeed` / `advanceToRound` / `triggerEndgameScoring` / `invokeAnytime` |
| `tests/llm-card-gen/fixtures/types.ts` | Create | `CardFixture` 接口 + `FixtureMeta` |
| `tests/llm-card-gen/fixtures/M1_immediate-gain-with-cost-prereq.ts` ... `M9_future-meeple.ts` | Create (9 个文件) | 每张测试卡 fixture |
| `tests/llm-card-gen/fixtures/index.ts` | Create | 聚合 9 张 fixture 成数组 export |
| `tests/llm-card-gen/runner.test.ts` | Create | vitest 入口，per-fixture 一个 `it()` |
| `tests/llm-card-gen/spike.test.ts` | Create then Delete | 验证 vitest 能 import `CARD_DESIGNER_SYSTEM_PROMPT`（含 `?raw` 内联），完成后删除 |
| `package.json` | Modify | 加 `test:llm` 脚本 |
| `vitest.config.ts` | Modify | `tests/llm-card-gen/**` 从 fast/slow 两个 project 都排除 |
| `.github/workflows/ci-llm-cards.yml` | Create | `workflow_dispatch` only，secret 注入，artifact 上传 |
| `.env.example` | Modify | 加注释行 `# MY_TEST_GEMINI_APIKEY=<key>` |
| `output/tmp/llm-card-gen/` | (runtime artifact) | 每次跑 dump 9 个 `<fixture-id>.txt`；已在 `.gitignore` |

---

## Task 1: Spike — verify vitest can import the workshop prompt

**Files:**
- Create then Delete: `tests/llm-card-gen/spike.test.ts`

**Background:** `client/services/llmPrompts.ts` exports `CARD_DESIGNER_SYSTEM_PROMPT` as `PROMPT_BODY + '\n' + communityExamples`, where `communityExamples` is `import communityExamples from '../../docs/community-card-examples.md?raw'`. Vitest uses Vite for module resolution, so `?raw` SHOULD work — but verify before building everything on top.

- [ ] **Step 1.1: Create the spike file**

Path: `tests/llm-card-gen/spike.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { CARD_DESIGNER_SYSTEM_PROMPT } from '../../client/services/llmPrompts'

describe('spike: prompt import', () => {
  it('CARD_DESIGNER_SYSTEM_PROMPT loads with ?raw markdown inlined', () => {
    expect(CARD_DESIGNER_SYSTEM_PROMPT.length).toBeGreaterThan(1000)
    expect(CARD_DESIGNER_SYSTEM_PROMPT).toContain('Open Agricola')
    expect(CARD_DESIGNER_SYSTEM_PROMPT).toContain('## 示例')
    // The community examples should be appended (10 cards, each starts with `### `)
    const exampleHeaderCount = (CARD_DESIGNER_SYSTEM_PROMPT.match(/^### /gm) ?? []).length
    expect(exampleHeaderCount).toBeGreaterThanOrEqual(5)
  })
})
```

- [ ] **Step 1.2: Run the spike**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/llm-card-test && \
  pnpm exec vitest run tests/llm-card-gen/spike.test.ts 2>&1 | tail -10
```

Expected: `Test Files  1 passed (1)`, `Tests  1 passed`. The prompt string is loaded with the markdown examples inlined.

If it fails with "Failed to resolve import '../../docs/community-card-examples.md?raw'", the spec's fallback applies — switch the strategy to read the `.md` via `fs.readFileSync` in a `getCardDesignerPrompt()` wrapper. Document the fallback choice in the next task's commit message and adapt subsequent tasks (specifically Task 7 runner) to call the wrapper instead of importing directly.

- [ ] **Step 1.3: Delete the spike file** (it's served its purpose)

```bash
rm tests/llm-card-gen/spike.test.ts
```

- [ ] **Step 1.4: Commit (or skip if no fallback was needed and Task 2 follows immediately)**

If Task 1 went through cleanly with the direct import working, just record it in Task 7's commit message later. No standalone commit needed for delete-only.

If you had to switch to the fs.readFileSync fallback, commit a `tests/llm-card-gen/prompt.ts` wrapper here instead of deleting:

```ts
// tests/llm-card-gen/prompt.ts (only if ?raw import didn't work)
import fs from 'node:fs'
import path from 'node:path'

const PROMPT_BODY_PATH = path.resolve(__dirname, '../../client/services/llmPrompts.ts')
const EXAMPLES_PATH = path.resolve(__dirname, '../../docs/community-card-examples.md')

export function getCardDesignerSystemPrompt(): string {
  // Extract PROMPT_BODY string literal from llmPrompts.ts (everything between the
  // first backtick after `const PROMPT_BODY = ` and the matching backtick).
  const src = fs.readFileSync(PROMPT_BODY_PATH, 'utf-8')
  const match = src.match(/const PROMPT_BODY = `([\s\S]*?)`/)
  if (!match) throw new Error('Could not extract PROMPT_BODY from llmPrompts.ts')
  const body = match[1]!
  const examples = fs.readFileSync(EXAMPLES_PATH, 'utf-8')
  return body + '\n' + examples
}
```

```bash
git add tests/llm-card-gen/prompt.ts
git commit -m "feat(test/llm): fallback prompt loader (vitest can't resolve ?raw md import)"
```

---

## Task 2: LLM client (Node fetch + retry)

**Files:**
- Create: `tests/llm-card-gen/llm-client.ts`

- [ ] **Step 2.1: Create `llm-client.ts`**

Path: `tests/llm-card-gen/llm-client.ts`

```ts
/**
 * Minimal LLM client for the card-gen test suite. Calls OpenAI-compatible
 * chat completions endpoints (Gemini exposes one at
 * generativelanguage.googleapis.com/v1beta/openai). No streaming; just blocking
 * call and return the first choice's content.
 *
 * Retries on 429 / 5xx (configurable). Other 4xx errors are thrown immediately.
 */

export type Provider = 'gemini' | 'openai'

const PROVIDER_BASE_URL: Record<Provider, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
}

export interface CallLLMOptions {
  provider: Provider
  model: string
  systemPrompt: string
  userMessage: string
  apiKey: string
  /** Single-request timeout in ms. Default 60_000. */
  timeoutMs?: number
  /** Max retries on 429 / 5xx / network error. Default 3. */
  maxRetries?: number
  /** Sleep between retries in ms. Default 60_000. */
  retryDelayMs?: number
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string,
  ) {
    super(message)
    this.name = 'LLMError'
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function callLLM(opts: CallLLMOptions): Promise<string> {
  const url = PROVIDER_BASE_URL[opts.provider]
  const timeoutMs = opts.timeoutMs ?? 60_000
  const maxRetries = opts.maxRetries ?? 3
  const retryDelayMs = opts.retryDelayMs ?? 60_000

  const body = JSON.stringify({
    model: opts.model,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.userMessage },
    ],
    temperature: 0.2,
    stream: false,
  })

  let lastError: unknown = null
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body,
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (res.ok) {
        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
        const content = json.choices?.[0]?.message?.content
        if (typeof content !== 'string' || content.length === 0) {
          throw new LLMError(`empty content from provider response: ${JSON.stringify(json).slice(0, 500)}`)
        }
        return content
      }

      const text = await res.text().catch(() => '')
      const retryable = res.status === 429 || (res.status >= 500 && res.status < 600)
      if (!retryable || attempt === maxRetries) {
        throw new LLMError(`HTTP ${res.status} from ${opts.provider}`, res.status, text.slice(0, 500))
      }
      lastError = new LLMError(`HTTP ${res.status}`, res.status, text.slice(0, 200))
      console.warn(`[llm-client] attempt ${attempt + 1}/${maxRetries + 1} got ${res.status}; sleeping ${retryDelayMs}ms`)
      await sleep(retryDelayMs)
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof LLMError && err.status && (err.status < 500 && err.status !== 429)) {
        throw err
      }
      if (attempt === maxRetries) {
        throw err instanceof Error ? err : new Error(String(err))
      }
      lastError = err
      console.warn(`[llm-client] attempt ${attempt + 1}/${maxRetries + 1} threw ${(err as Error)?.message}; sleeping ${retryDelayMs}ms`)
      await sleep(retryDelayMs)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('callLLM exhausted retries')
}

export function readApiKey(provider: Provider): string {
  const envName = provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'
  const key = process.env[envName]
  if (!key) {
    throw new Error(`missing env ${envName} for provider ${provider}`)
  }
  return key
}
```

- [ ] **Step 2.2: Sanity import check (no real call)**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/llm-card-test && \
  pnpm exec tsx -e "import('./tests/llm-card-gen/llm-client.ts').then(m => console.log(Object.keys(m)))"
```

Expected: `[ 'PROVIDER_BASE_URL', 'LLMError', 'callLLM', 'readApiKey' ]` (or a similar list including `callLLM`). No real API call yet — just confirms module loads + types are consistent.

If TS compile fails, fix the errors before continuing.

- [ ] **Step 2.3: Commit**

```bash
git add tests/llm-card-gen/llm-client.ts
git commit -m "feat(test/llm): minimal Node LLM client with retry on 429/5xx

Routes gemini / openai through the OpenAI-compatible /chat/completions
endpoint. 60s single-request timeout, up to 3 retries with 60s backoff
on 429 / 5xx / network errors. API key read from env (GEMINI_API_KEY
/ OPENAI_API_KEY)."
```

---

## Task 3: Extract `CARD_DEF` + `CARD_IMPL` from LLM response

**Files:**
- Create: `tests/llm-card-gen/extract.ts`

**Background:** LLM responses typically wrap code in markdown fences (\`\`\`typescript ... \`\`\`). The prompt asks for `CARD_DEF` + `CARD_IMPL` constants, no `import`/`export`. We need a robust extractor that finds the first ts/typescript code block containing both `CARD_DEF` and `CARD_IMPL`. The existing `client/services/llmService.ts` has `extractCardFromResponse` for partial parsing of metadata; we want the full code block.

- [ ] **Step 3.1: Create `extract.ts`**

Path: `tests/llm-card-gen/extract.ts`

```ts
/**
 * Extract the full TypeScript code block (CARD_DEF + CARD_IMPL) from an LLM
 * markdown response. The prompt instructs the model to wrap code in a
 * ```typescript fence; we tolerate ```ts as well.
 */

const FENCE_RE = /```(?:typescript|ts)\s*\n([\s\S]*?)```/gi

export class ExtractError extends Error {
  constructor(message: string, public readonly response: string) {
    super(message)
    this.name = 'ExtractError'
  }
}

export function extractCardCode(response: string): string {
  const blocks: string[] = []
  let match: RegExpExecArray | null
  FENCE_RE.lastIndex = 0
  while ((match = FENCE_RE.exec(response)) !== null) {
    blocks.push(match[1]!)
  }
  if (blocks.length === 0) {
    throw new ExtractError('no ```typescript or ```ts code fence found in LLM response', response)
  }
  // Pick the first block that contains both CARD_DEF and CARD_IMPL.
  const winner = blocks.find((b) => /\bCARD_DEF\b/.test(b) && /\bCARD_IMPL\b/.test(b))
  if (!winner) {
    throw new ExtractError(
      `no code block contained both CARD_DEF and CARD_IMPL (found ${blocks.length} block(s))`,
      response,
    )
  }
  return winner.trim()
}

/**
 * Rewrite the cardId in the extracted code so it matches the fixture's
 * expected ID. LLM tends to invent its own ID; we want a stable one for
 * registration. We do a textual replacement of any `CARD_ID = '...'` literal
 * and the `id: '...'` inside CARD_DEF.
 *
 * Returns the rewritten code. If we can't find a CARD_ID literal to rewrite,
 * we leave the code untouched (the validate step will surface the issue).
 */
export function rewriteCardId(code: string, targetId: string): string {
  // Most generated code follows: const CARD_ID = 'XXX'   then references CARD_ID.
  // If present, just rewrite that one literal.
  const idLiteralRe = /(const\s+CARD_ID\s*=\s*['"])([^'"]+)(['"])/m
  if (idLiteralRe.test(code)) {
    return code.replace(idLiteralRe, `$1${targetId}$3`)
  }
  // Fallback: replace `id: '...'` field within CARD_DEF.
  // This is heuristic — only the first occurrence inside CARD_DEF.
  const defStart = code.indexOf('CARD_DEF')
  if (defStart < 0) return code
  // Find the next id: '...' after CARD_DEF
  const window = code.slice(defStart)
  const idFieldRe = /(\bid\s*:\s*['"])([^'"]+)(['"])/
  const m = window.match(idFieldRe)
  if (!m) return code
  const newWindow = window.replace(idFieldRe, `$1${targetId}$3`)
  return code.slice(0, defStart) + newWindow
}
```

- [ ] **Step 3.2: Add a small unit test for extract.ts**

Path: `tests/llm-card-gen/extract.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { extractCardCode, rewriteCardId, ExtractError } from './extract'

describe('extractCardCode', () => {
  it('extracts the typescript fence block containing CARD_DEF + CARD_IMPL', () => {
    const response = `
Sure, here's the implementation:

\`\`\`typescript
const CARD_ID = 'CUSTOM_FOO'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Foo' })
const CARD_IMPL = { effect: { id: CARD_ID } }
\`\`\`

Hope this helps!
`
    const code = extractCardCode(response)
    expect(code).toContain('CARD_ID')
    expect(code).toContain('CARD_DEF')
    expect(code).toContain('CARD_IMPL')
  })

  it('also accepts ```ts fence', () => {
    const response = `\`\`\`ts\nconst CARD_DEF = {}\nconst CARD_IMPL = {}\n\`\`\``
    expect(() => extractCardCode(response)).not.toThrow()
  })

  it('throws when no fence present', () => {
    expect(() => extractCardCode('no code here')).toThrow(ExtractError)
  })

  it('throws when no fence has both CARD_DEF and CARD_IMPL', () => {
    const response = `\`\`\`typescript\nconst CARD_DEF = {}\n\`\`\``
    expect(() => extractCardCode(response)).toThrow(ExtractError)
  })
})

describe('rewriteCardId', () => {
  it('rewrites CARD_ID literal', () => {
    const code = `const CARD_ID = 'OLD_ID'\nconst CARD_DEF = { id: CARD_ID }`
    const rewritten = rewriteCardId(code, 'NEW_ID')
    expect(rewritten).toContain(`CARD_ID = 'NEW_ID'`)
    expect(rewritten).not.toContain('OLD_ID')
  })

  it('falls back to id field inside CARD_DEF when no CARD_ID literal', () => {
    const code = `const CARD_DEF = { id: 'OLD_ID', name: 'X' }\nconst CARD_IMPL = {}`
    const rewritten = rewriteCardId(code, 'NEW_ID')
    expect(rewritten).toContain(`id: 'NEW_ID'`)
    expect(rewritten).not.toContain('OLD_ID')
  })
})
```

- [ ] **Step 3.3: Run extract tests**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/llm-card-test && \
  pnpm exec vitest run tests/llm-card-gen/extract.test.ts 2>&1 | tail -10
```

Expected: 6 tests passed.

- [ ] **Step 3.4: Commit**

```bash
git add tests/llm-card-gen/extract.ts tests/llm-card-gen/extract.test.ts
git commit -m "feat(test/llm): extract CARD_DEF/CARD_IMPL block + cardId rewriter

Pulls the first \`\`\`typescript fence that contains both CARD_DEF
and CARD_IMPL. \`rewriteCardId\` normalises the LLM's invented card
id to a stable fixture id so registration doesn't collide."
```

---

## Task 4: Session helpers — wrap GameSession into reusable scenario steps

**Files:**
- Create: `tests/llm-card-gen/session-helpers.ts`

**Background:** Existing session tests in `server/__tests__/*-session.test.ts` (e.g. `A87_StablePlanner-session.test.ts`, `D154_ChimneySweep-session.test.ts`) demonstrate the GameSession API used for scenario setup. The custom-code path is shown in `server/__tests__/custom-code-executor.test.ts` — it uses `validateAndCompileCustomCode` + `registerExecutorBackedCustomCard` from `server/custom-code/runtime.ts` to load LLM-generated code into the test session.

This task creates a thin wrapper layer so each fixture's scenario doesn't have to repeat the boilerplate.

- [ ] **Step 4.1: Read template tests for the GameSession API surface**

Open these in a quick scan to confirm method names + types — do NOT modify:
- `server/__tests__/custom-code-executor.test.ts` (custom code load + invoke pattern)
- `server/__tests__/A10_WoodenShed-session.test.ts` (basic session test pattern, simple card)
- `server/game/authoritative-session.ts` (GameSession class — find `takeAction` / `confirmAnimalReorg` / harvest-related methods + pending model)

If method names differ from what's used in this plan (e.g. plan says `session.takeAction(...)` but the class uses `session.executeAction(...)`), adjust the helpers to match the actual API. The plan reflects what was discovered during brainstorming — verify before writing.

- [ ] **Step 4.2: Create `session-helpers.ts`**

Path: `tests/llm-card-gen/session-helpers.ts`

```ts
/**
 * Reusable scenario primitives for the LLM card-gen test suite.
 * Wraps GameSession so each fixture's scenario function stays short.
 *
 * IMPORTANT: All method names here MUST match the actual GameSession API
 * (see server/game/authoritative-session.ts). If you find a mismatch when
 * implementing fixtures, fix this file's wrappers — don't work around it
 * in each fixture.
 */

import type { GameSession } from '../../server/game/authoritative-session'
import { validateAndCompileCustomCode } from '../../server/custom-code/engine'
import { registerExecutorBackedCustomCard } from '../../server/custom-code/runtime'
import { rewriteCardId } from './extract'
import type { Resource } from '../../shared/game/types'

export type CardType = 'major' | 'minor' | 'occupation'

export interface FixtureCardMeta {
  cardId: string
  cardType: CardType
  cardName: string
  cardCost?: Partial<Resource>
  cardPrerequisite?: { occupations?: number; improvements?: number }
}

export interface FreshSessionOptions extends FixtureCardMeta {
  /** LLM-generated TS source (CARD_DEF + CARD_IMPL). */
  llmGeneratedCode: string
  /** Should the card be considered already played by p1? Default false (in hand). */
  preplayed?: boolean
  /** Override p1's starting resources (additive over the default initial state). */
  p1Resources?: Partial<Resource>
  /** Override p2's starting resources. */
  p2Resources?: Partial<Resource>
  /** Pre-played occupation count for p1 (used for prerequisite tests). */
  p1OccupationsPlayed?: number
  /** Round to advance to before returning. Default: leave at round 1 start. */
  startAtRound?: number
}

/**
 * Build a fresh 2-player GameSession, validate + register the LLM code as a
 * custom card, optionally pre-deal it into p1's hand or p1's played pile,
 * and apply any state overrides. Returns the session ready for trigger().
 *
 * If validateAndCompileCustomCode rejects the code, throws an Error containing
 * the validation errors — the fixture's it() will fail with that message.
 */
export async function freshSessionWithCustomCard(
  opts: FreshSessionOptions,
): Promise<GameSession> {
  const code = rewriteCardId(opts.llmGeneratedCode, opts.cardId)
  const result = validateAndCompileCustomCode(code, opts.cardId)
  if (!result.valid) {
    throw new Error(`validateAndCompileCustomCode failed for ${opts.cardId}: ${result.errors.join('; ')}`)
  }

  // Construct a 2-player GameSession. The exact constructor / factory needs to
  // match server/game/authoritative-session.ts — adapt the call site here.
  // (Use the same pattern as the existing *-session.test.ts files.)
  const session = await createTwoPlayerSession()

  // Register the LLM-generated card with the session's registry.
  registerExecutorBackedCustomCard({
    cardData: {
      cardType: opts.cardType,
      cardJson: {
        id: opts.cardId,
        name: opts.cardName,
        deck: 'CUSTOM',
        number: 0,
        desc: ['LLM-generated test card'],
        ...(opts.cardCost ? { cost: opts.cardCost } : {}),
        ...(opts.cardPrerequisite ? { prerequisite: opts.cardPrerequisite } : {}),
      },
      compiledCode: result.compiledCode,
      codeManifest: result.manifest,
    },
    activeRegistry: session.cardRegistry,  // adjust per real GameSession API
  })

  // Apply state overrides.
  applyResourceOverride(session, 0, opts.p1Resources)
  applyResourceOverride(session, 1, opts.p2Resources)

  if (opts.p1OccupationsPlayed != null) {
    primeOccupationCount(session, 0, opts.p1OccupationsPlayed)
  }

  if (opts.preplayed) {
    pushCardToPlayedPile(session, 0, opts.cardId, opts.cardType)
  } else {
    pushCardToHand(session, 0, opts.cardId, opts.cardType)
  }

  if (opts.startAtRound && opts.startAtRound > 1) {
    await advanceToRound(session, opts.startAtRound)
  }

  return session
}

// --- Internal helpers (signatures shown; bodies follow patterns from
//     server/__tests__/*-session.test.ts) ---

async function createTwoPlayerSession(): Promise<GameSession> {
  // See server/__tests__/A10_WoodenShed-session.test.ts for the exact factory.
  // Pseudocode — replace with the real call:
  //   return GameSession.create({ players: ['p1', 'p2'] })
  throw new Error('TODO: implement using GameSession.create or whatever the real factory is')
}

function applyResourceOverride(
  session: GameSession,
  playerIndex: number,
  overrides: Partial<Resource> | undefined,
): void {
  if (!overrides) return
  const p = session.state.players[playerIndex]!
  for (const [key, value] of Object.entries(overrides)) {
    ;(p.resources as any)[key] = value
  }
}

function primeOccupationCount(session: GameSession, playerIndex: number, n: number): void {
  // For prerequisite checks we just need the COUNT to satisfy the gate.
  // Push n placeholder occupation cardIds onto p.occupations / p.played as
  // appropriate per shared/game/types.ts.
  // See A87_StablePlanner-session.test.ts for the exact field name.
  throw new Error('TODO: prime p.occupationsPlayed / p.played to count n')
}

function pushCardToHand(
  session: GameSession,
  playerIndex: number,
  cardId: string,
  cardType: CardType,
): void {
  // p.hand or p.minorHand depending on cardType — match shared/game/types.ts.
  throw new Error('TODO: push cardId into the right hand bucket')
}

function pushCardToPlayedPile(
  session: GameSession,
  playerIndex: number,
  cardId: string,
  cardType: CardType,
): void {
  // p.played, or p.minorPlayed/p.occupationsPlayed depending on cardType.
  throw new Error('TODO: push cardId into the played pile')
}

// --- Trigger primitives (used by fixtures' trigger()) ---

export async function takeActionById(
  session: GameSession,
  playerIndex: number,
  actionId: string,
  args?: Record<string, unknown>,
): Promise<void> {
  // session.takeAction({ playerIndex, actionId, ... }) — match real signature.
  throw new Error('TODO: call GameSession.takeAction')
}

export async function playCardFromHand(
  session: GameSession,
  playerIndex: number,
  cardId: string,
): Promise<void> {
  // Most likely a takeAction with type='play-minor' / 'play-improvement' /
  // 'play-occupation'. Match real GameSession API.
  throw new Error('TODO: play cardId from p1 hand')
}

export async function advanceToRound(session: GameSession, round: number): Promise<void> {
  // Advance the round counter, replaying round-start hooks at each step.
  // Use whatever the real GameSession exposes for round transitions.
  throw new Error('TODO: advance to round N')
}

export async function triggerHarvestFeed(session: GameSession): Promise<void> {
  // Push the session into the harvest > feed phase and resolve feeding.
  throw new Error('TODO: drive harvest feed')
}

export async function triggerEndgameScoring(session: GameSession): Promise<void> {
  // Mark the game over and compute final scores.
  // After this, session.scores should contain breakdowns per player.
  throw new Error('TODO: trigger endgame scoring')
}

export async function invokeAnytime(
  session: GameSession,
  playerIndex: number,
  cardId: string,
  args?: Record<string, unknown>,
): Promise<void> {
  // Anytime abilities are dispatched outside the regular action flow.
  // Find the entrypoint in GameSession (likely session.invokeAnytime).
  throw new Error('TODO: invoke anytime ability')
}
```

**The TODO bodies above are intentional**: they enumerate every API call the fixtures will need. Step 4.3 fills them in by pattern-matching the existing test files. **Do not** start fixture work until each TODO body is replaced with a real implementation that one of the helpers below has been smoke-tested.

- [ ] **Step 4.3: Replace each `TODO: ...` body with the real implementation**

For each TODO:
1. Open the referenced test file (e.g. `server/__tests__/A10_WoodenShed-session.test.ts`) in your editor.
2. Find a piece of code doing the same thing (creating session, taking action, advancing round, etc.).
3. Copy the call pattern verbatim, adapting for the helper's parameters.
4. Run the smoke test in Step 4.4 to confirm.

Common adjustments you'll probably make:
- `createTwoPlayerSession`: in the existing tests it's typically `new GameSession({ players: [...] })` or a `createSession(...)` factory. Use the same.
- `takeActionById`: existing tests do `session.takeAction(playerIndex, actionId, args)` or pass an object — match the signature.
- `pushCardToHand` / `pushCardToPlayedPile`: existing tests usually mutate `session.state.players[i].hand` / `.minorPlayed` / `.played` directly.

- [ ] **Step 4.4: Smoke test — load a trivial custom card and invoke its effect**

Path: `tests/llm-card-gen/session-helpers.smoke.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { freshSessionWithCustomCard, playCardFromHand } from './session-helpers'

describe('session-helpers smoke', () => {
  it('builds a session, registers a custom card, plays it, observes effect', async () => {
    const trivialCode = `
const CARD_ID = 'TEST_TRIVIAL'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Trivial Test' })
const CARD_IMPL = {
  listeners: [{
    id: CARD_ID,
    cardIds: [CARD_ID],
    actions: ['_play_card'],   // most generic listener
    phases: ['after'],
    handler: () => ({ flow: { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: CARD_ID } }),
  }],
}
`
    const session = await freshSessionWithCustomCard({
      llmGeneratedCode: trivialCode,
      cardId: 'TEST_TRIVIAL',
      cardType: 'minor',
      cardName: 'Trivial Test',
      p1Resources: { wood: 0 },
    })
    await playCardFromHand(session, 0, 'TEST_TRIVIAL')
    // The exact assertion depends on what the listener actually does in the
    // real engine. Adjust based on observed behaviour.
    expect(session.state.players[0]!.resources.wood).toBeGreaterThanOrEqual(0)
  })
})
```

Run:
```bash
pnpm exec vitest run tests/llm-card-gen/session-helpers.smoke.test.ts 2>&1 | tail -10
```

Expected: passes (or fails with a specific reason that lets you fix the helper). The point is to confirm the wrappers actually work end-to-end before any LLM-dependent fixture is built.

If this smoke test won't pass without unreasonable scenario plumbing, narrow it: the goal is to validate the helper signatures, not to pre-test the LLM pipeline.

- [ ] **Step 4.5: Delete the smoke test (it served its purpose) and commit**

```bash
rm tests/llm-card-gen/session-helpers.smoke.test.ts
git add tests/llm-card-gen/session-helpers.ts
git commit -m "feat(test/llm): session helpers wrapping GameSession for fixture scenarios

freshSessionWithCustomCard builds a 2-player GameSession, registers
the LLM-generated card via validateAndCompileCustomCode +
registerExecutorBackedCustomCard, and applies p1/p2 resource +
prerequisite overrides. Plus trigger primitives:
playCardFromHand, takeActionById, advanceToRound, triggerHarvestFeed,
triggerEndgameScoring, invokeAnytime. Patterns lifted verbatim from
server/__tests__/A10_WoodenShed-session.test.ts and
server/__tests__/custom-code-executor.test.ts."
```

---

## Task 5: Fixture interface + first fixture (M1) + runner skeleton

**Files:**
- Create: `tests/llm-card-gen/fixtures/types.ts`
- Create: `tests/llm-card-gen/fixtures/M1_immediate-gain-with-cost-prereq.ts`
- Create: `tests/llm-card-gen/fixtures/index.ts`
- Create: `tests/llm-card-gen/runner.test.ts`

**Background:** This task is the end-to-end skeleton. Run M1 once, observe what the LLM actually produces, see if the assertion fires correctly. Tasks 6.x add the rest of the fixtures; if Task 5's M1 doesn't work end-to-end, none of the others will either.

- [ ] **Step 5.1: Create `fixtures/types.ts`**

Path: `tests/llm-card-gen/fixtures/types.ts`

```ts
import type { GameSession } from '../../../server/game/authoritative-session'

export interface CardFixture {
  /** Test ID, used for it() name and dump filename. */
  id: string
  /** Stable cardId used in registration. The LLM's id is rewritten to this. */
  cardId: string
  cardType: 'major' | 'minor' | 'occupation'
  /** Message sent to the LLM as the user turn (after the system prompt). */
  userMessage: string
  /**
   * Build a fresh GameSession with the LLM-generated code registered + initial
   * state primed for the trigger.
   */
  scenario: (llmGeneratedCode: string, cardId: string) => Promise<GameSession>
  /** Trigger the card's effect (play the card, run an action, advance, etc.). */
  trigger: (session: GameSession) => Promise<void>
  /** Inspect the resulting state and decide pass / fail. */
  assert: (session: GameSession) => { ok: boolean; reason?: string }
}
```

- [ ] **Step 5.2: Create `fixtures/M1_immediate-gain-with-cost-prereq.ts`**

Path: `tests/llm-card-gen/fixtures/M1_immediate-gain-with-cost-prereq.ts`

```ts
import { freshSessionWithCustomCard, playCardFromHand } from '../session-helpers'
import type { CardFixture } from './types'

const CARD_ID = 'TEST_M1_QuickHaul'

const fixture: CardFixture = {
  id: 'M1-immediate-gain-with-cost-prereq',
  cardId: CARD_ID,
  cardType: 'minor',
  userMessage: [
    '请实现一张小改良卡牌：',
    '',
    '- 卡牌类型: 小改良 (MinorImprovement)',
    '- 卡牌名称: 速运',
    '- 打出费用: 1 wood',
    '- 前置条件: 至少打出 3 张职业',
    '- 效果: 打出本牌时，立即获得 3 木材和 1 食物。',
  ].join('\n'),
  scenario: (llmCode) =>
    freshSessionWithCustomCard({
      llmGeneratedCode: llmCode,
      cardId: CARD_ID,
      cardType: 'minor',
      cardName: '速运',
      cardCost: { wood: 1 },
      cardPrerequisite: { occupations: 3 },
      // p1 already meets prerequisite (3 occupations played) and has enough wood
      p1Resources: { wood: 5, food: 0 },
      p1OccupationsPlayed: 3,
    }),
  trigger: async (session) => {
    await playCardFromHand(session, 0, CARD_ID)
  },
  assert: (session) => {
    const p = session.state.players[0]!
    // Cost paid: 1 wood deducted; reward: +3 wood +1 food.
    // Net: wood = 5 - 1 + 3 = 7; food = 0 + 1 = 1.
    if (p.resources.wood !== 7) {
      return { ok: false, reason: `wood=${p.resources.wood}, expected 7 (5 - cost 1 + reward 3)` }
    }
    if (p.resources.food !== 1) {
      return { ok: false, reason: `food=${p.resources.food}, expected 1` }
    }
    return { ok: true }
  },
}

export default fixture
```

- [ ] **Step 5.3: Create `fixtures/index.ts`**

Path: `tests/llm-card-gen/fixtures/index.ts`

```ts
import M1 from './M1_immediate-gain-with-cost-prereq'
import type { CardFixture } from './types'

export const fixtures: CardFixture[] = [M1]
```

(Tasks 6.x will append M2-M9 to this array.)

- [ ] **Step 5.4: Create the runner**

Path: `tests/llm-card-gen/runner.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixtures } from './fixtures'
import { callLLM, readApiKey, type Provider } from './llm-client'
import { extractCardCode, ExtractError } from './extract'
import { CARD_DESIGNER_SYSTEM_PROMPT } from '../../client/services/llmPrompts'

const PROVIDER = (process.env.LLM_TEST_PROVIDER ?? 'gemini') as Provider
const MODEL = process.env.LLM_TEST_MODEL ?? 'gemini-3.1-pro-preview'
const DUMP_DIR = 'output/tmp/llm-card-gen'

const apiKeyAvailable = (() => {
  try {
    readApiKey(PROVIDER)
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!apiKeyAvailable)(`LLM card-gen [${PROVIDER}/${MODEL}]`, () => {
  for (const fixture of fixtures) {
    it(fixture.id, async () => {
      const apiKey = readApiKey(PROVIDER)

      let llmResponse: string
      try {
        llmResponse = await callLLM({
          provider: PROVIDER,
          model: MODEL,
          systemPrompt: CARD_DESIGNER_SYSTEM_PROMPT,
          userMessage: fixture.userMessage,
          apiKey,
        })
      } catch (err) {
        throw new Error(`[${fixture.id}] LLM call failed: ${(err as Error).message}`)
      }

      mkdirSync(DUMP_DIR, { recursive: true })
      writeFileSync(join(DUMP_DIR, `${fixture.id}.txt`), llmResponse, 'utf-8')

      let code: string
      try {
        code = extractCardCode(llmResponse)
      } catch (err) {
        const reason = err instanceof ExtractError ? err.message : (err as Error).message
        throw new Error(`[${fixture.id}] extract failed: ${reason} (see ${DUMP_DIR}/${fixture.id}.txt)`)
      }

      let session
      try {
        session = await fixture.scenario(code, fixture.cardId)
      } catch (err) {
        throw new Error(`[${fixture.id}] scenario failed: ${(err as Error).message} (see ${DUMP_DIR}/${fixture.id}.txt)`)
      }

      try {
        await fixture.trigger(session)
      } catch (err) {
        throw new Error(`[${fixture.id}] trigger threw: ${(err as Error).message} (see ${DUMP_DIR}/${fixture.id}.txt)`)
      }

      const result = fixture.assert(session)
      if (!result.ok) {
        throw new Error(`[${fixture.id}] assert failed: ${result.reason} (see ${DUMP_DIR}/${fixture.id}.txt)`)
      }
      expect(result.ok).toBe(true)
    }, 120_000)
  }
})
```

- [ ] **Step 5.5: Run M1 once, observe outcome**

Set the API key env locally (read from `.env`):

```bash
export GEMINI_API_KEY="$(grep '^MY_TEST_GEMINI_APIKEY=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | cut -d= -f2-)"
```

Run:

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/llm-card-test && \
  pnpm exec vitest run tests/llm-card-gen/runner.test.ts --testTimeout=120000 2>&1 | tail -30
```

Three possible outcomes:

1. **PASS** — M1 works end to end. Move to Task 6.
2. **FAIL on extract / validate / scenario** — the LLM output is malformed in a way the extractor can't handle. Look at `output/tmp/llm-card-gen/M1-immediate-gain-with-cost-prereq.txt`. If the model is consistently producing the wrong format (e.g. no `CARD_ID` literal, multiple code blocks, output prose mixed in), this is a **prompt issue** — go to Task 5.6.
3. **FAIL on trigger / assert** — the LLM produced code that compiles but doesn't do what the desc asked. Same dump file is your evidence; the fix is to **tighten the prompt** (add a closer example for cost+prereq, or clarify that "打出费用" maps to the `cost` field of MinorImprovement). Iterate until M1 passes.

- [ ] **Step 5.6: (If 5.5 failed) Iterate the prompt**

The prompt lives at `client/services/llmPrompts.ts`. Re-read the dump file, identify the systematic issue, and edit `PROMPT_BODY` (or add an example to `docs/community-card-examples.md`) to address it. Re-run Step 5.5. Repeat until M1 is green.

Commit each prompt iteration separately so the diff makes the gap visible:

```bash
git add client/services/llmPrompts.ts docs/community-card-examples.md
git commit -m "fix(prompt): <one-line summary of the gap, e.g. 'clarify cost field maps to CARD_DEF.cost'>"
```

- [ ] **Step 5.7: Commit Task 5 deliverables**

```bash
git add tests/llm-card-gen/fixtures/types.ts \
        tests/llm-card-gen/fixtures/M1_immediate-gain-with-cost-prereq.ts \
        tests/llm-card-gen/fixtures/index.ts \
        tests/llm-card-gen/runner.test.ts
git commit -m "feat(test/llm): runner + M1 fixture (immediate gain + cost + prereq)

End-to-end skeleton: per-fixture it() calls LLM, extracts code, builds
session, triggers, asserts. Dumps every LLM response to
output/tmp/llm-card-gen/<fixture-id>.txt for prompt iteration. M1
covers play-cost deduction, occupation-count prerequisite, and
immediate reward."
```

---

## Task 6: Add fixtures M2-M9

**Files:** Create one fixture file per mechanic.

Each fixture follows the same skeleton as M1. The list below gives:
- file name
- `userMessage` text (what to send the LLM)
- expected scenario priming
- trigger
- assert formula

Implementer should write each as a separate commit (so prompt-iteration commits between fixtures stay clean). For each fixture, after creating the file:
1. Append the import + entry to `fixtures/index.ts`.
2. Run `pnpm exec vitest run tests/llm-card-gen/runner.test.ts -t '<fixture-id>'` to test in isolation.
3. If failing because of prompt: iterate per Task 5.6 instructions.
4. Commit.

### M2 — per-action triggered hook

**File:** `tests/llm-card-gen/fixtures/M2_per-action-bonus.ts`

```ts
import { freshSessionWithCustomCard, takeActionById } from '../session-helpers'
import type { CardFixture } from './types'

const CARD_ID = 'TEST_M2_LumberJackBoots'
const TAKE_WOOD_ACTION_ID = 'gather-wood'  // verify the actual id from shared/actions/effects/

const fixture: CardFixture = {
  id: 'M2-per-action-bonus',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 伐木靴',
    '- 效果: 你每次使用「取木材」(gather-wood) 行动时，额外获得 1 木材。',
  ].join('\n'),
  scenario: (code) =>
    freshSessionWithCustomCard({
      llmGeneratedCode: code,
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '伐木靴',
      preplayed: true,            // already in p1's played pile so the hook is active
      p1Resources: { wood: 0 },
    }),
  trigger: async (session) => {
    await takeActionById(session, 0, TAKE_WOOD_ACTION_ID)
  },
  assert: (session) => {
    // Baseline gather-wood at round 1 typically gives 3 wood (verify from
    // shared/actions/effects/take-wood.ts or wherever). With +1 hook = 4.
    const got = session.state.players[0]!.resources.wood
    const expected = 4  // adjust after looking up baseline
    if (got !== expected) return { ok: false, reason: `wood=${got}, expected ${expected} (baseline + 1)` }
    return { ok: true }
  },
}

export default fixture
```

After writing, append to `fixtures/index.ts`:
```ts
import M2 from './M2_per-action-bonus'
export const fixtures: CardFixture[] = [M1, M2]
```

Test, iterate prompt if needed, commit:
```bash
git add tests/llm-card-gen/fixtures/M2_per-action-bonus.ts tests/llm-card-gen/fixtures/index.ts
git commit -m "feat(test/llm): M2 fixture (per-action triggered hook)"
```

### M3 — harvest feed modifier

**File:** `tests/llm-card-gen/fixtures/M3_harvest-feed-modifier.ts`

```ts
import { freshSessionWithCustomCard, triggerHarvestFeed } from '../session-helpers'
import type { CardFixture } from './types'

const CARD_ID = 'TEST_M3_LazyShepherd'

const fixture: CardFixture = {
  id: 'M3-harvest-feed-modifier',
  cardId: CARD_ID,
  cardType: 'minor',
  userMessage: [
    '请实现一张小改良卡牌：',
    '',
    '- 卡牌类型: 小改良 (MinorImprovement)',
    '- 卡牌名称: 懒牧人',
    '- 效果: 收获的喂养阶段，你的每只羊只需要 0 食物（不需要喂）。',
  ].join('\n'),
  scenario: (code) =>
    freshSessionWithCustomCard({
      llmGeneratedCode: code,
      cardId: CARD_ID,
      cardType: 'minor',
      cardName: '懒牧人',
      preplayed: true,
      p1Resources: { food: 5, sheep: 2 },   // 2 sheep on the farm; farm-grid plumbing TBD
      // NOTE: animals are placed on the farm grid, not the resource pool — fix
      // the helper to put 2 sheep into a pasture or equivalent. See
      // server/__tests__/A87_StablePlanner-session.test.ts for that pattern.
    }),
  trigger: async (session) => {
    await triggerHarvestFeed(session)
  },
  assert: (session) => {
    const p = session.state.players[0]!
    if (p.resources.food !== 5) return { ok: false, reason: `food consumed: was 5, now ${p.resources.food}` }
    const begging = (p as any).beggingTokens ?? 0  // adapt to real field
    if (begging > 0) return { ok: false, reason: `unexpected begging token (${begging})` }
    return { ok: true }
  },
}

export default fixture
```

Update `index.ts`, test, commit `feat(test/llm): M3 fixture (harvest feed modifier)`.

### M4 — endgame VP

**File:** `tests/llm-card-gen/fixtures/M4_endgame-vp.ts`

```ts
import { freshSessionWithCustomCard, triggerEndgameScoring } from '../session-helpers'
import type { CardFixture } from './types'

const CARD_ID = 'TEST_M4_CattleSteward'

const fixture: CardFixture = {
  id: 'M4-endgame-vp',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 牛倌',
    '- 效果: 局末，你每 2 头牛额外获得 1 分。',
  ].join('\n'),
  scenario: (code) =>
    freshSessionWithCustomCard({
      llmGeneratedCode: code,
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '牛倌',
      preplayed: true,
      p1Resources: { cattle: 4 },   // 4 cattle for + 2 VP
    }),
  trigger: async (session) => {
    await triggerEndgameScoring(session)
  },
  assert: (session) => {
    // session.scores[0].breakdown should include an entry attributed to this card.
    // Exact shape: see shared/protocol/game.ts ScoreBreakdownEntry.
    const breakdown = (session as any).scores?.[0]?.breakdown ?? []
    const entry = breakdown.find((e: any) => e?.cardId === CARD_ID || e?.source === CARD_ID)
    if (!entry) return { ok: false, reason: `no breakdown entry from ${CARD_ID} found in ${JSON.stringify(breakdown).slice(0, 200)}` }
    if (entry.value !== 2) return { ok: false, reason: `bonus VP=${entry.value}, expected 2 (4 cattle / 2)` }
    return { ok: true }
  },
}

export default fixture
```

Update `index.ts`, test, commit `feat(test/llm): M4 fixture (endgame VP scoring)`.

### M5 — cost reduction modifier

**File:** `tests/llm-card-gen/fixtures/M5_cost-reduction.ts`

```ts
import { freshSessionWithCustomCard, takeActionById } from '../session-helpers'
import type { CardFixture } from './types'

const CARD_ID = 'TEST_M5_FrugalMason'
const RENOVATE_ACTION_ID = 'house-renovation'  // verify exact id

const fixture: CardFixture = {
  id: 'M5-cost-reduction',
  cardId: CARD_ID,
  cardType: 'minor',
  userMessage: [
    '请实现一张小改良卡牌：',
    '',
    '- 卡牌类型: 小改良 (MinorImprovement)',
    '- 卡牌名称: 节俭石匠',
    '- 效果: 当你改建房屋 (renovation) 时，所需的 stone 或 clay 减 2 (最少 0)。',
  ].join('\n'),
  scenario: (code) =>
    freshSessionWithCustomCard({
      llmGeneratedCode: code,
      cardId: CARD_ID,
      cardType: 'minor',
      cardName: '节俭石匠',
      preplayed: true,
      // Setup: p1 has wood house, 2 rooms => baseline renovate cost = 1 reed + 2 clay/room = 4 clay.
      // With -2 modifier, p1 should pay 2 clay.
      p1Resources: { clay: 5, reed: 1 },
    }),
  trigger: async (session) => {
    await takeActionById(session, 0, RENOVATE_ACTION_ID, { target: 'clay' })
  },
  assert: (session) => {
    const p = session.state.players[0]!
    if ((p as any).houseType !== 'clay') return { ok: false, reason: `houseType=${(p as any).houseType}, expected clay` }
    // 5 - (4 - 2) = 3 clay remaining
    if (p.resources.clay !== 3) return { ok: false, reason: `clay=${p.resources.clay}, expected 3` }
    return { ok: true }
  },
}

export default fixture
```

Update `index.ts`, test, commit `feat(test/llm): M5 fixture (cost reduction modifier)`.

### M6 — cardStates counter (once-per-round)

**File:** `tests/llm-card-gen/fixtures/M6_cardstate-counter.ts`

```ts
import { freshSessionWithCustomCard, takeActionById } from '../session-helpers'
import type { CardFixture } from './types'

const CARD_ID = 'TEST_M6_FrugalLogger'
const TAKE_WOOD_ACTION_ID = 'gather-wood'

const fixture: CardFixture = {
  id: 'M6-cardstate-counter',
  cardId: CARD_ID,
  cardType: 'minor',
  userMessage: [
    '请实现一张小改良卡牌：',
    '',
    '- 卡牌类型: 小改良 (MinorImprovement)',
    '- 卡牌名称: 木屑节约',
    '- 效果: 每个工作回合，你第 1 次使用「取木材」行动时，额外获得 1 木材。',
    '  同一回合内第 2 次及以后的「取木材」无此加成。',
  ].join('\n'),
  scenario: (code) =>
    freshSessionWithCustomCard({
      llmGeneratedCode: code,
      cardId: CARD_ID,
      cardType: 'minor',
      cardName: '木屑节约',
      preplayed: true,
      p1Resources: { wood: 0 },
    }),
  trigger: async (session) => {
    // First take-wood: should get baseline + 1
    await takeActionById(session, 0, TAKE_WOOD_ACTION_ID)
    // Second take-wood within same round: no bonus
    // (Requires the action space to be re-occupiable, which in real Agricola
    // it isn't — adjust the trigger to whatever makes sense per the engine,
    // e.g. a different wood-yielding action, or use anytime to advance turns.)
    await takeActionById(session, 0, TAKE_WOOD_ACTION_ID)
  },
  assert: (session) => {
    const wood = session.state.players[0]!.resources.wood
    // Baseline gather-wood gives X (e.g. 3); two takes = 2X. With M6 bonus,
    // first take adds 1 only. So expected = 2X + 1.
    const X = 3
    const expected = 2 * X + 1
    if (wood !== expected) return { ok: false, reason: `wood=${wood}, expected ${expected} (2 takes; only first gets +1)` }
    return { ok: true }
  },
}

export default fixture
```

Update `index.ts`, test, commit `feat(test/llm): M6 fixture (cardStates per-round counter)`.

### M7 — anytime ability

**File:** `tests/llm-card-gen/fixtures/M7_anytime-ability.ts`

```ts
import { freshSessionWithCustomCard, invokeAnytime } from '../session-helpers'
import type { CardFixture } from './types'

const CARD_ID = 'TEST_M7_RoadsideCook'

const fixture: CardFixture = {
  id: 'M7-anytime-ability',
  cardId: CARD_ID,
  cardType: 'minor',
  userMessage: [
    '请实现一张小改良卡牌：',
    '',
    '- 卡牌类型: 小改良 (MinorImprovement)',
    '- 卡牌名称: 路边厨子',
    '- 效果: 任意时机，你可以支付 1 wood 换 2 food (每个工作回合最多触发 3 次)。',
  ].join('\n'),
  scenario: (code) =>
    freshSessionWithCustomCard({
      llmGeneratedCode: code,
      cardId: CARD_ID,
      cardType: 'minor',
      cardName: '路边厨子',
      preplayed: true,
      p1Resources: { wood: 3, food: 0 },
    }),
  trigger: async (session) => {
    await invokeAnytime(session, 0, CARD_ID)
  },
  assert: (session) => {
    const p = session.state.players[0]!
    if (p.resources.wood !== 2) return { ok: false, reason: `wood=${p.resources.wood}, expected 2 (3 - 1)` }
    if (p.resources.food !== 2) return { ok: false, reason: `food=${p.resources.food}, expected 2` }
    return { ok: true }
  },
}

export default fixture
```

Update `index.ts`, test, commit `feat(test/llm): M7 fixture (anytime ability)`.

### M8 — cross-player trigger

**File:** `tests/llm-card-gen/fixtures/M8_cross-player-trigger.ts`

```ts
import { freshSessionWithCustomCard, playCardFromHand } from '../session-helpers'
import type { CardFixture } from './types'

const CARD_ID = 'TEST_M8_GossipMonger'
const OPPONENT_MINOR_ID = 'CUSTOM_DummyMinor'

const fixture: CardFixture = {
  id: 'M8-cross-player-trigger',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 八卦贩子',
    '- 效果: 当其他玩家打出任何小改良时，你立即获得 1 食物。',
  ].join('\n'),
  scenario: (code) =>
    freshSessionWithCustomCard({
      llmGeneratedCode: code,
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '八卦贩子',
      preplayed: true,            // p1 has the listener active
      p1Resources: { food: 0 },
      // p2 will need a minor improvement to play. Helper plumbing TODO: pre-deal
      // a vanilla minor to p2.hand (any existing card from the registry, e.g. a
      // simple Stone Path / Loam-Pit-style minor that costs nothing).
      p2Resources: { wood: 0 },
    }),
  trigger: async (session) => {
    // p2 plays an arbitrary minor improvement.
    await playCardFromHand(session, 1, OPPONENT_MINOR_ID)
  },
  assert: (session) => {
    const p1 = session.state.players[0]!
    if (p1.resources.food !== 1) return { ok: false, reason: `p1 food=${p1.resources.food}, expected 1 (triggered by p2's minor)` }
    return { ok: true }
  },
}

export default fixture
```

Update `index.ts`, test, commit `feat(test/llm): M8 fixture (cross-player trigger)`.

> **Note on M8 scenario:** the helper needs to put a real, no-cost minor improvement into p2's hand. Pick one from the existing card catalogue (e.g. one with `cost: {}` and trivial effect) and add a `p2HandCardIds` option to `freshSessionWithCustomCard`. Update `session-helpers.ts` if the option doesn't exist yet.

### M9 — future meeple

**File:** `tests/llm-card-gen/fixtures/M9_future-meeple.ts`

```ts
import { freshSessionWithCustomCard, advanceToRound, playCardFromHand } from '../session-helpers'
import type { CardFixture } from './types'

const CARD_ID = 'TEST_M9_StockpileTimer'

const fixture: CardFixture = {
  id: 'M9-future-meeple',
  cardId: CARD_ID,
  cardType: 'minor',
  userMessage: [
    '请实现一张小改良卡牌：',
    '',
    '- 卡牌类型: 小改良 (MinorImprovement)',
    '- 卡牌名称: 木材定时器',
    '- 效果: 打出本牌时，立即在接下来 3 个回合开始时，你各获得 1 wood。',
    '  (使用 futureMeeples 机制实现，每个未来回合开始触发一次)',
  ].join('\n'),
  scenario: (code) =>
    freshSessionWithCustomCard({
      llmGeneratedCode: code,
      cardId: CARD_ID,
      cardType: 'minor',
      cardName: '木材定时器',
      p1Resources: { wood: 0 },
      // Card sits in hand to be played in trigger().
    }),
  trigger: async (session) => {
    await playCardFromHand(session, 0, CARD_ID)
    // Advance 3 rounds; each round-start should fire the future-meeple payout.
    const startRound = session.state.round
    await advanceToRound(session, startRound + 3)
  },
  assert: (session) => {
    const wood = session.state.players[0]!.resources.wood
    if (wood !== 3) return { ok: false, reason: `wood=${wood}, expected 3 (1/round × 3 rounds)` }
    return { ok: true }
  },
}

export default fixture
```

Update `index.ts`, test, commit `feat(test/llm): M9 fixture (future meeple round-start payout)`.

After M9 is in, `fixtures/index.ts` should look like:

```ts
import M1 from './M1_immediate-gain-with-cost-prereq'
import M2 from './M2_per-action-bonus'
import M3 from './M3_harvest-feed-modifier'
import M4 from './M4_endgame-vp'
import M5 from './M5_cost-reduction'
import M6 from './M6_cardstate-counter'
import M7 from './M7_anytime-ability'
import M8 from './M8_cross-player-trigger'
import M9 from './M9_future-meeple'
import type { CardFixture } from './types'

export const fixtures: CardFixture[] = [M1, M2, M3, M4, M5, M6, M7, M8, M9]
```

---

## Task 7: Wire up `pnpm test:llm` + exclude from default tiers

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.ts`
- Modify: `.env.example`

- [ ] **Step 7.1: Add the test:llm script**

In `package.json`, locate the test scripts block (currently has `test`, `test:fast`, `test:slow`, `test:bench`, `test:e2e`). Add immediately after `test:slow`:

```json
"test:llm": "vitest run tests/llm-card-gen/runner.test.ts --testTimeout=120000",
```

- [ ] **Step 7.2: Exclude `tests/llm-card-gen/**` from fast + slow projects**

In `vitest.config.ts`, find the existing `FAST_EXCLUDE` constant. Add `'tests/llm-card-gen/**'` to the array:

```ts
const FAST_EXCLUDE = [
  ...SHARED_EXCLUDE,
  ...SLOW_INCLUDE,
  'tests/llm-card-gen/**',     // <-- new
]
```

Also exclude from the slow project (since slow uses `SHARED_EXCLUDE` directly, append to that):

```ts
const SHARED_EXCLUDE = [
  ...defaultExclude,
  '**/.worktree/**',
  'tests/llm-card-gen/**',     // <-- new
]
```

- [ ] **Step 7.3: Verify the LLM tests are NOT picked up by default tiers**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/llm-card-test && \
  pnpm exec vitest run --project fast --reporter=verbose 2>&1 | grep -c "tests/llm-card-gen"
```

Expected: `0`. If non-zero, the exclude isn't working — re-check the glob.

- [ ] **Step 7.4: Annotate `.env.example`**

Open `.env.example`. Add (anywhere; conventionally near other key entries):

```
# For pnpm test:llm — Gemini API key (Google AI Studio)
# MY_TEST_GEMINI_APIKEY=...
```

- [ ] **Step 7.5: Commit**

```bash
git add package.json vitest.config.ts .env.example
git commit -m "chore(test/llm): wire pnpm test:llm + exclude from default vitest tiers

New \`pnpm test:llm\` runs the LLM card-gen suite with a 120s
per-test timeout. \`tests/llm-card-gen/**\` is excluded from both
fast and slow vitest projects so \`pnpm test\`, \`pnpm test:fast\`,
and \`pnpm test:slow\` never pick it up — the suite only runs when
explicitly invoked or via the new ci-llm-cards.yml workflow."
```

---

## Task 8: CI workflow — `ci-llm-cards.yml` (`workflow_dispatch` only)

**Files:**
- Create: `.github/workflows/ci-llm-cards.yml`

- [ ] **Step 8.1: Create the workflow file**

Path: `.github/workflows/ci-llm-cards.yml`

```yaml
name: CI LLM Cards

on:
  workflow_dispatch:
    inputs:
      model:
        description: 'LLM model id (e.g. gemini-3.1-pro-preview)'
        required: false
        default: 'gemini-3.1-pro-preview'
      provider:
        description: 'Provider key (gemini | openai)'
        required: false
        default: 'gemini'

jobs:
  llm-cards:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.0
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: pnpm

      - name: Install deps
        run: pnpm install --frozen-lockfile

      - name: Build cards manifest (dependency of GameSession setup)
        run: pnpm run build:cards-manifest

      - name: Run LLM card-gen tests
        env:
          LLM_TEST_PROVIDER: ${{ github.event.inputs.provider || 'gemini' }}
          LLM_TEST_MODEL: ${{ github.event.inputs.model || 'gemini-3.1-pro-preview' }}
          GEMINI_API_KEY: ${{ secrets.MY_TEST_GEMINI_APIKEY }}
        run: pnpm run test:llm

      - name: Upload LLM response dumps (always, for inspection)
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: llm-card-gen-outputs
          path: output/tmp/llm-card-gen/
          if-no-files-found: warn
```

- [ ] **Step 8.2: YAML lint**

```bash
python3 -c "import yaml; yaml.safe_load(open('/data00/home/xuxinhao.titan/raw/open-agricola/.worktree/llm-card-test/.github/workflows/ci-llm-cards.yml'))" && echo "yaml ok"
```

Expected: `yaml ok`.

- [ ] **Step 8.3: Commit**

```bash
git add .github/workflows/ci-llm-cards.yml
git commit -m "ci: add ci-llm-cards.yml — workflow_dispatch only

Manual-trigger only (no auto run on push/PR). Inputs let the
operator pick a provider + model from the GH Actions UI. Reads the
API key from secrets.MY_TEST_GEMINI_APIKEY (operator must add this
secret in repo settings). Always uploads the LLM response dumps as
an artifact for prompt-iteration review."
```

---

## Task 9: Manual smoke — dispatch the workflow once + verify

**Files:** none (operational).

- [ ] **Step 9.1: Push the branch**

```bash
git -C /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/llm-card-test \
  push -u origin design/llm-card-gen-test
```

- [ ] **Step 9.2: Confirm the GH Secret exists**

You (the user) need to add `MY_TEST_GEMINI_APIKEY` in GitHub repo settings → Secrets and variables → Actions → New repository secret. Value = the Gemini API key from `.env`.

If this hasn't been done, the workflow will fail at the LLM-call step with "missing env GEMINI_API_KEY". Confirm the secret is set before triggering.

- [ ] **Step 9.3: Dispatch the workflow**

```bash
export $(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | xargs)
curl -s -X POST -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/titanxxh/open-agricola/actions/workflows/ci-llm-cards.yml/dispatches \
  -d '{"ref":"design/llm-card-gen-test"}'
```

Expected: HTTP 204 (no output). The workflow appears in `https://github.com/titanxxh/open-agricola/actions`.

- [ ] **Step 9.4: Wait for completion + check pass count**

```bash
export $(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | xargs)
until res=$(curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=20' \
  | jq -r '[.workflow_runs[] | select(.head_branch=="design/llm-card-gen-test") | select(.name=="CI LLM Cards")][0] | "\(.status) \(.conclusion) \(.id)"') \
  && echo "$res" | grep -q "completed"; do sleep 30; done
echo "$res"
```

If conclusion is `success`: all 9 fixtures passed. Move to Step 9.5.

If conclusion is `failure`: download the artifact to inspect what the LLM produced for failing fixtures:
```bash
RUN_ID=$(echo "$res" | awk '{print $3}')
curl -sL -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/titanxxh/open-agricola/actions/runs/$RUN_ID/artifacts" \
  | jq '.artifacts[] | {name, archive_download_url}'
```

Use the resulting `archive_download_url` with the same auth header to download. Iterate the prompt per Task 5.6 process, push the prompt fix, dispatch the workflow again. Repeat until either all 9 pass OR a fixture is identified as a known limitation (document in spec §6 risk #3).

- [ ] **Step 9.5: Open PR + merge**

After the workflow completes (success or with documented known failures), open a PR for review. Use the API pattern:

```bash
export $(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | xargs)
curl -s -X POST -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/titanxxh/open-agricola/pulls \
  -d "$(cat <<'JSON'
{
  "title": "feat(test): LLM card-gen automated test suite (manual-trigger CI)",
  "head": "design/llm-card-gen-test",
  "base": "main",
  "body": "## Summary\n\nImplements docs/superpowers/specs/2026-04-23-llm-card-gen-test-design.md.\n\n9-fixture suite (M1-M9) covering common card mechanics (immediate-reward+cost+prereq, per-action hook, harvest modifier, endgame VP, cost-discount, cardStates counter, anytime ability, cross-player trigger, future-meeple). Each fixture: 1 LLM call → extract code → register in GameSession → trigger → assert. New `pnpm test:llm` script + new `ci-llm-cards.yml` workflow on `workflow_dispatch` only.\n\n## Test plan\n\n- [x] Default `pnpm test` does not pick up the new tests (verified: 0 matches in fast tier)\n- [ ] `ci-llm-cards.yml` dispatched once successfully on this branch (results: <fill in pass count>)\n- [ ] CI green on this PR (only the standard CI runs; LLM tests are excluded)\n"
}
JSON
)" | jq '{number, html_url}'
```

After regular CI is green (the new test infrastructure should not affect default CI), rebase-merge per the project's standard flow.

- [ ] **Step 9.6: Cleanup**

```bash
git -C /data00/home/xuxinhao.titan/raw/open-agricola fetch origin --prune
git -C /data00/home/xuxinhao.titan/raw/open-agricola worktree remove .worktree/llm-card-test --force
git -C /data00/home/xuxinhao.titan/raw/open-agricola branch -D design/llm-card-gen-test
git -C /data00/home/xuxinhao.titan/raw/open-agricola push origin --delete design/llm-card-gen-test
```

---

## Risk Notes

1. **Vitest `?raw` import**: Task 1 verifies this works. If it doesn't, Task 1.4's fallback wrapper kicks in and Task 5.4's runner uses `getCardDesignerSystemPrompt()` from `./prompt` instead of the direct import. The downstream code is otherwise unaffected.

2. **GameSession API drift**: The exact method names + signatures used by `session-helpers.ts` are sketched here based on what the brainstorming exploration uncovered, but the implementer MUST cross-reference `server/__tests__/A10_WoodenShed-session.test.ts` and `server/game/authoritative-session.ts` before writing. Don't try to invent the API; copy from existing tests.

3. **Fixture iteration is the real cost**: Tasks 5 and 6 will likely require multiple LLM-call iterations as the implementer discovers gaps in the prompt. Budget a few hours for prompt tuning, not minutes. Each iteration is 1-2 LLM calls + a prompt edit + a re-run; cheap on a per-cycle basis but can accumulate.

4. **Some fixtures may not be achievable with the current prompt**: M6 (cardStates counter), M7 (anytime), M8 (cross-player), M9 (future-meeple) test deeper engine integration. If after 5-10 prompt-iteration cycles a fixture still fails consistently, accept it as a "known limitation" and document in `docs/superpowers/specs/...` what's needed to close the gap (likely: more example cards in `community-card-examples.md`, or an explicit DSL extension). Don't bend the assertion to make the test green — the test is the prompt's quality gate.

5. **GH Secret bootstrap**: Task 9.2 is a manual user step. If the operator forgets to set the secret, the workflow fails fast and visibly — easy to fix.

6. **Cost / rate limit**: 9 LLM calls per run, gemini-3.1-pro-preview free-tier 15 RPM should easily accommodate. If usage exceeds the free tier, the retry on 429 with 60s backoff will eventually succeed (or hit `maxRetries=3` and fail loudly).
