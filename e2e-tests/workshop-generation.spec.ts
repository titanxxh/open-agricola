import { createHash } from 'node:crypto'
import { expect } from '@playwright/test'
import { test } from './server-fixtures'
import { FRONTEND_URL } from './fixtures'
import { createLocalUserForTests, createSession } from '../server/auth'

const modelUrl = 'https://api.deepseek.com/v1/chat/completions'
const referenceCommit = 'e'.repeat(40)
const referencePath = 'docs/CUSTOM_CARD_SANDBOX.md'
const referenceBody = 'Sandbox example: use gainLeaf(CARD_ID, { food: 1 }).\n'
const blob = createHash('sha1').update(`blob ${Buffer.byteLength(referenceBody)}\0`).update(referenceBody).digest('hex')
const modelKey = 'browser-only-llm-credential-canary'

for (const locale of ['zh', 'en'] as const) test(`editor candidate recovery and explicit adoption (${locale})`, async ({ page, browser }) => {
  test.setTimeout(90_000)
  if (locale === 'en') await page.setViewportSize({ width: 390, height: 844 })
  const user = await createLocalUserForTests(`editor_${locale}_${Date.now().toString(36)}`, 'editor-test-password')
  const cookie = await createSession(user.id)
  if (!cookie) throw new Error('No local test session')
  await page.context().addCookies([{ name: 'oa_session', value: cookie, url: FRONTEND_URL }])
  // Substitute only the test browser's module. The shipped admission registry has no bypass.
  await page.route('**/client/services/llm/generation/admission.ts*', async route => {
    const response = await route.fetch()
    const body = (await response.text()).replace('ADMITTED_GENERATION_MODELS = []', `ADMITTED_GENERATION_MODELS = [{provider:'deepseek',endpoint:'${modelUrl}',model:'deepseek-v4-flash',evidence:'controlled browser test',batch:'fixture'}]`)
    await route.fulfill({ response, body })
  })
  await page.route('https://api.github.com/**', route => route.fulfill({ json: route.request().url().includes('/git/ref/') ? { object: { sha: referenceCommit } } : { truncated: false, tree: [] } }))
  await page.goto(FRONTEND_URL)
  const cardId = `CUSTOM_Editor_${locale}_${Date.now()}`
  const name = 'Editor Tool Test'
  const id = await page.evaluate(async ({ cardId, name, modelKey, locale }) => {
    localStorage.setItem('open-agricola-locale-v2', locale)
    localStorage.setItem('open-agricola-llm-config', JSON.stringify({ provider: 'deepseek', apiKey: modelKey, model: 'deepseek-v4-flash' }))
    const response = await fetch('/api/workshop/cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ card_id: cardId, card_type: 'minor', name, description: '', card_json: { id: cardId, card_type: 'minor', name, cost: { wood: 2 }, desc: [] }, status: 'draft' }) })
    const data = await response.json()
    if (!response.ok || !data.id) throw new Error(JSON.stringify(data))
    return data.id as string
  }, { cardId, name, modelKey, locale })
  const source = (amount: number, bad = false) => `const CARD_ID = '${cardId}'; const CARD_DEF = { cardType: 'minor', meta: { id: CARD_ID, name: '${name}', cost: { wood: 2 }, desc: ['Gain ${amount} food.'] } }; const CARD_IMPL = { effect: { onBuy: () => ${bad ? 'eval("invalid")' : `gainLeaf(CARD_ID, { food: ${amount} })`} } };`
  const bodies: Array<{ messages: Array<{ role: string; content: string }> }> = []
  let fail = false
  await page.route(modelUrl, async route => {
    bodies.push(route.request().postDataJSON())
    const content = `\`\`\`typescript\n${source(fail ? 9 : bodies.length, fail)}\n\`\`\``
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ model: 'deepseek-v4-flash', choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 40 } })}\n\ndata: [DONE]\n\n` })
  })
  const zh = locale === 'zh'
  const enter = async () => {
    await page.goto(`${FRONTEND_URL}/?page=workshop&view=editor&card=${id}`)
    await page.getByRole('button', { name: zh ? /卡牌能力\s*对话、源码与验证/ : /Card ability\s*Conversation/ }).click()
  }
  await enter()
  const input = page.getByPlaceholder(zh ? '描述你想要的卡牌效果…' : 'Describe the card effect…')
  const generate = page.getByRole('button', { name: zh ? '生成能力候选' : 'Generate ability candidate' })
  const editor = page.getByLabel(zh ? '能力候选源码' : 'Ability candidate source')
  const adopt = page.getByRole('button', { name: zh ? '采用为当前源码' : 'Adopt as current source' })
  await input.fill('Gain 1 food when played')
  await generate.click()
  await expect(adopt).toBeEnabled()
  await expect(editor).toHaveValue(source(1))
  await expect(page.locator('.aicw-current-code')).toHaveCount(0)
  await input.fill('Change the food reward to 2')
  await generate.click()
  await expect(editor).toHaveValue(source(2))
  const secondInput = JSON.parse(bodies[1].messages[1].content)
  expect(secondInput.source).toBe(source(1))
  expect(secondInput.card).toMatchObject({ id: cardId, name, type: 'minor', definition: { cost: { wood: 2 } } })
  fail = true
  await input.fill('A failed complete source')
  await generate.click()
  await expect(page.locator('.aicw-generation-progress')).toContainText(zh ? '本次尝试已结束' : 'Attempt finished')
  await expect(editor).toHaveValue(source(9, true))
  await expect(adopt).toBeDisabled()
  expect(bodies).toHaveLength(5) // Original + exactly two static repairs.
  await page.reload()
  await page.getByRole('button', { name: zh ? /卡牌能力\s*对话、源码与验证/ : /Card ability\s*Conversation/ }).click()
  await expect(editor).toHaveValue(source(9, true))
  await expect(adopt).toBeDisabled()
  expect(bodies).toHaveLength(5)
  await page.locator('.aicw-ability-tabs button').filter({ hasText: zh ? '代码校验通过' : 'Code validated' }).last().click()
  await expect(editor).toHaveValue(source(2))
  await adopt.click()
  await expect(page.locator('.aicw-current-code code')).toHaveText(source(2))
  const persisted = await page.evaluate(async id => (await (await fetch(`/api/workshop/cards/${id}/workspace`)).json()).workspace, id)
  expect(persisted.draft.effectCode).toBe(source(2))
  expect(JSON.stringify(persisted.draft.generation)).not.toContain(modelKey)
  expect(JSON.stringify(persisted.draft.generation)).not.toContain('"messages"')
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate(element => element.clientWidth))
  await page.unroute(modelUrl)
  let interruptedCalls = 0
  await page.route(modelUrl, async route => {
    interruptedCalls += 1
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: '```typescript\nconst CARD_IMPL = {' } }] })}\n\n` })
  })
  await input.fill('An interrupted response')
  await generate.click()
  await expect(page.locator('.aicw-generation-progress')).toContainText(zh ? '已暂停' : 'Paused')
  await page.reload()
  await page.getByRole('button', { name: zh ? /卡牌能力\s*对话、源码与验证/ : /Card ability\s*Conversation/ }).click()
  await expect(page.locator('.aicw-generation-result')).toContainText(zh ? '上次尝试已中断' : 'Previous attempt interrupted')
  await expect(page.locator('.aicw-current-code code')).toHaveText(source(2))
  expect(interruptedCalls).toBe(1)
  await expect(page.getByRole('button', { name: zh ? '重试当前步骤' : 'Retry this step' })).toHaveCount(0)
  const other = await browser.newContext()
  await other.addCookies([{ name: 'oa_session', value: cookie, url: FRONTEND_URL }])
  const otherPage = await other.newPage()
  await otherPage.goto(`${FRONTEND_URL}/?page=workshop&view=editor&card=${id}`)
  await otherPage.getByRole('button', { name: /卡牌能力|Card ability/ }).click()
  await expect(otherPage.locator('.aicw-current-code code')).toHaveText(source(2))
  await expect(otherPage.locator('.ai-message')).toHaveCount(0)
  await other.close()
})

test('browser tools preserve protocol through the final response slot and authoritative validation', async ({ page }) => {
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
  let preservedProtocol = true
  await page.route(modelUrl, async route => {
    const body = route.request().postDataJSON()
    posts += 1
    expect(body.tool_choice).toBe(posts === 8 ? 'none' : 'auto')
    expect(body.tools).toHaveLength(2)
    if (posts > 1) {
      const assistant = body.messages.at(-3)
      const tool = body.messages.at(-2)
      preservedProtocol &&= assistant.reasoning_content === 'private-reasoning-canary'
        && assistant.tool_calls[0].id === `reference-call-${posts - 1}`
        && tool.role === 'tool' && tool.tool_call_id === `reference-call-${posts - 1}`
        && tool.content.includes(referenceCommit) && tool.content.includes('gainLeaf')
        && body.messages.at(-1).role === 'system'
        && body.messages.at(-1).content.includes(`model request ${posts} of 8`)
    }
    const delta = posts < 8 ? { role: 'assistant', reasoning_content: 'private-reasoning-canary', tool_calls: [{ index: 0, id: `reference-call-${posts}`, type: 'function', function: { name: 'read_reference', arguments: JSON.stringify({ path: referencePath, startLine: 1, lineCount: 10 }) } }] }
      : { role: 'assistant', content: `\`\`\`typescript\n${source}\n\`\`\`` }
    const frames = [
      { id: `request-${posts}`, model: 'deepseek-v4-flash', choices: [{ index: 0, delta, finish_reason: posts < 8 ? 'tool_calls' : 'stop' }] },
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
  expect(posts).toBe(8)
  expect(preservedProtocol).toBe(true)
  expect(snapshot).toMatchObject({ status: 'completed', referenceCommit, modelRequests: 8, referenceCalls: 7,
    candidate: { sourceCode: source, cardJson: { id: cardId, cost: { wood: 2 } }, validation: { valid: true } }, result: { kind: 'candidate' },
  })
  expect(JSON.stringify(snapshot)).not.toContain('private-reasoning-canary')
  expect(destinations.filter(item => item.containsModelKey).map(item => item.url)).toEqual(Array(8).fill(modelUrl))
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
