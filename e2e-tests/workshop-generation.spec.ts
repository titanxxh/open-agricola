import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { FRONTEND_URL } from './fixtures'
import { createLocalUserForTests, createSession } from '../server/auth'
import { getDb } from '../server/db'

const modelUrl = 'https://api.deepseek.com/v1/chat/completions'
const referenceCommit = 'e'.repeat(40)
const referencePath = 'docs/CUSTOM_CARD_SANDBOX.md'
const referenceBody = 'Sandbox example: use gainLeaf(CARD_ID, { food: 1 }).\n'
const blob = createHash('sha1').update(`blob ${Buffer.byteLength(referenceBody)}\0`).update(referenceBody).digest('hex')
const modelKey = 'browser-only-llm-credential-canary'

test.afterAll(async () => { await getDb().close() })

test('browser tools round-trip into authoritative validation without forwarding model credentials', async ({ page }) => {
  const username = `loop_${Date.now().toString(36)}`
  const user = await createLocalUserForTests(username, 'loop-test-password')
  const cookie = await createSession(user.id)
  if (!cookie) throw new Error('Could not create the local acceptance session')
  await page.context().addCookies([{ name: 'oa_session', value: cookie, url: FRONTEND_URL }])
  const destinations: Array<{ url: string; containsModelKey: boolean }> = []
  page.on('request', req => {
    destinations.push({ url: req.url(), containsModelKey: JSON.stringify(req.headers()).includes(modelKey) || (req.postData() ?? '').includes(modelKey) })
  })
  await page.route('https://api.github.com/**', route => route.fulfill({ json: route.request().url().includes('/git/ref/')
    ? { object: { sha: referenceCommit } }
    : { truncated: false, tree: [{ path: referencePath, type: 'blob', sha: blob, size: Buffer.byteLength(referenceBody) }] }, headers: { 'Access-Control-Allow-Origin': '*' } }))
  await page.route('https://raw.githubusercontent.com/**', route => route.fulfill({ body: referenceBody, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' } }))
  const cardId = `CUSTOM_BrowserLoop_${Date.now()}`
  const source = `const CARD_ID = '${cardId}'; const CARD_DEF = { cardType: 'minor', meta: { id: CARD_ID, name: 'Browser Loop', cost: { wood: 2 }, desc: ['Gain 1 food.'] } }; const CARD_IMPL = { effect: { onBuy: () => gainLeaf(CARD_ID, { food: 1 }) } };`
  let posts = 0
  let preservedProtocol = false
  await page.route(modelUrl, async route => {
    const body = route.request().postDataJSON()
    posts += 1
    if (posts === 2) {
      const assistant = body.messages.at(-2)
      const tool = body.messages.at(-1)
      preservedProtocol = assistant.reasoning_content === 'private-reasoning-canary'
        && assistant.tool_calls[0].id === 'reference-call'
        && tool.role === 'tool' && tool.tool_call_id === 'reference-call'
        && tool.content.includes(referenceCommit) && tool.content.includes('gainLeaf')
    }
    const delta = posts === 1 ? { role: 'assistant', reasoning_content: 'private-reasoning-canary', tool_calls: [{ index: 0, id: 'reference-call', type: 'function', function: { name: 'read_reference', arguments: JSON.stringify({ path: referencePath, startLine: 1, lineCount: 10 }) } }] }
      : { role: 'assistant', content: `\`\`\`typescript\n${source}\n\`\`\`` }
    const frames = [
      { id: `request-${posts}`, model: 'deepseek-v4-flash', choices: [{ index: 0, delta, finish_reason: posts === 1 ? 'tool_calls' : 'stop' }] },
      { choices: [], usage: { prompt_tokens: 100, completion_tokens: 50 } },
    ]
    await route.fulfill({ contentType: 'text/event-stream', headers: { 'Access-Control-Allow-Origin': '*' }, body: frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n' })
  })
  await page.goto(FRONTEND_URL)
  const snapshot = await page.evaluate(async ({ cardId, modelKey }) => {
    const root = '/client/services/llm/generation/'
    const [{ GenerationAttempt }, { buildGenerationRequest }, { createToolTransport }, { createSandboxPorts }, { ReferenceSession }] = await Promise.all([
      import(root + 'attempt.ts'), import(root + 'request.ts'), import(root + 'protocol.ts'), import(root + 'browser.ts'), import(root + 'references.ts'),
    ])
    const request = buildGenerationRequest({ workspaceId: 'browser-probe', baseRevision: 1,
      draft: { cardId, cardType: 'minor', name: 'Browser Loop', description: '', cardJson: {}, effectCode: null, artUrl: null, generation: {} },
      intent: { kind: 'generate', message: 'Cost 2 wood; gain 1 food when played.' },
    })
    const model = createToolTransport({ provider: 'deepseek', model: 'deepseek-v4-flash', apiKey: modelKey }, {
      // Test-only authorization of the exact candidate tuple. Product admission remains closed.
      authorize: (target: { provider: string; model: string; endpoint: string }) => {
        if (target.provider !== 'deepseek' || target.model !== 'deepseek-v4-flash' || target.endpoint !== 'https://api.deepseek.com/v1/chat/completions') throw new Error('Unexpected test target')
      },
    })
    return await new GenerationAttempt(request, { model, ...createSandboxPorts((path: string, init?: RequestInit) => fetch(path, { ...init, credentials: 'include' })), openReferences: (signal: AbortSignal) => ReferenceSession.open(signal) }).start()
  }, { cardId, modelKey })
  expect(posts).toBe(2)
  expect(preservedProtocol).toBe(true)
  expect(snapshot).toMatchObject({ status: 'completed', referenceCommit, modelRequests: 2, referenceCalls: 1,
    candidate: { sourceCode: source, cardJson: { id: cardId, cost: { wood: 2 } }, validation: { valid: true } }, result: { kind: 'candidate' },
  })
  expect(JSON.stringify(snapshot)).not.toContain('private-reasoning-canary')
  expect(destinations.filter(item => item.containsModelKey).map(item => item.url)).toEqual([modelUrl, modelUrl])
  expect(destinations.some(item => item.url.includes('/api/workshop/cards/validate-code'))).toBe(true)
})

test('anonymous GitHub references work from the real browser origin', async ({ page }) => {
  test.skip(process.env.RUN_GITHUB_REFERENCE_PROBE !== '1', 'Explicit network probe; deterministic CI uses the controlled round-trip above.')
  await page.goto(FRONTEND_URL)
  const evidence = await page.evaluate(async () => {
    const modulePath = '/client/services/llm/generation/references.ts'
    const { ReferenceSession } = await import(modulePath)
    const signal = AbortSignal.timeout(45_000)
    const refs = await ReferenceSession.open(signal)
    const result = JSON.parse(await refs.execute({ id: 'probe', type: 'function', function: { name: 'read_reference', arguments: JSON.stringify({ path: 'docs/CUSTOM_CARD_SANDBOX.md', startLine: 1, lineCount: 8 }) } }, signal))
    return { commit: refs.commit, path: result.path, text: result.text, url: result.url }
  })
  expect(evidence.commit).toMatch(/^[a-f0-9]{40}$/)
  expect(evidence.path).toBe('docs/CUSTOM_CARD_SANDBOX.md')
  expect(evidence.text.length).toBeGreaterThan(20)
  expect(evidence.url).toContain(`/blob/${evidence.commit}/`)
  console.log(JSON.stringify({ githubBrowserProbe: 'passed', commit: evidence.commit, path: evidence.path }))
})
