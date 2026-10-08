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
  // Exercise the shipped admission entry; only provider/reference responses are controlled.
  await page.route('**/api/workshop/references/**', route => route.fulfill({ json: route.request().url().endsWith('/main') ? { object: { sha: referenceCommit } } : { truncated: false, tree: [] } }))
  await page.goto(FRONTEND_URL)
  const cardId = `CUSTOM_Editor_${locale}_${Date.now()}`
  const name = 'Editor Tool Test'
  const id = await page.evaluate(async ({ cardId, name, modelKey, locale }) => {
    localStorage.setItem('open-agricola-locale-v2', locale)
    localStorage.setItem('open-agricola-llm-config', JSON.stringify({ provider: 'deepseek', apiKey: modelKey, model: 'deepseek-flash' }))
    const response = await fetch('/api/workshop/cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ card_id: cardId, card_type: 'minor', name, description: '', card_json: { id: cardId, card_type: 'minor', name, cost: { wood: 2 }, desc: [] }, status: 'draft' }) })
    const data = await response.json()
    if (!response.ok || !data.id) throw new Error(JSON.stringify(data))
    return data.id as string
  }, { cardId, name, modelKey, locale })
  const source = (amount: number, bad = false) => `const CARD_ID = '${cardId}'; const CARD_DEF = { cardType: 'minor', meta: { id: CARD_ID, name: '${name}', cost: { wood: 2 }, desc: ['Gain ${amount} food.'] } }; const CARD_IMPL = { effect: { onBuy: () => ${bad ? `({ type: 'seq', items: [gainLeaf(CARD_ID, { food: ${amount} })] })` : `gainLeaf(CARD_ID, { food: ${amount} })`} } };`
  const bodies: Array<{ messages: Array<{ role: string; content: string }> }> = []
  let fail = false
  await page.route(modelUrl, async route => {
    bodies.push(route.request().postDataJSON())
    const content = `\`\`\`typescript\n${source(fail ? 9 : bodies.length, fail)}\n\`\`\``
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ model: 'deepseek-flash', choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 40 } })}\n\ndata: [DONE]\n\n` })
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
  await page.locator('.aicw-stage-rail button').filter({ hasText: zh ? '基础信息' : 'Card details' }).click()
  await page.locator('#ai-cost-input').fill('3 wood')
  await page.locator('.aicw-stage-rail button').filter({ hasText: zh ? '卡牌能力' : 'Card ability' }).click()
  await expect(page.locator('.aicw-save-state')).toContainText(zh ? '已同步' : 'Synced')
  const pendingDevice = await browser.newContext()
  await pendingDevice.addCookies([{ name: 'oa_session', value: cookie, url: FRONTEND_URL }])
  const pendingPage = await pendingDevice.newPage()
  await pendingPage.addInitScript(locale => localStorage.setItem('open-agricola-locale-v2', locale), locale)
  await pendingPage.goto(`${FRONTEND_URL}/?page=workshop&view=editor&card=${id}`)
  await pendingPage.locator('.aicw-stage-rail button').filter({ hasText: zh ? '卡牌能力' : 'Card ability' }).click()
  await expect(pendingPage.locator('.aicw-candidate-state')).toContainText(zh ? '基于旧草稿生成' : 'Generated from an older draft')
  await Promise.all([
    pendingPage.waitForEvent('dialog').then(async dialog => {
      expect(dialog.message()).toContain(zh ? '旧草稿' : 'older draft')
      await dialog.dismiss()
    }),
    pendingPage.getByRole('button', { name: zh ? '采用为当前源码' : 'Adopt as current source' }).click(),
  ])
  const afterDecline = await pendingPage.evaluate(async id => (await (await fetch(`/api/workshop/cards/${id}/workspace`)).json()).workspace, id)
  expect(afterDecline.draft.cardJson.cost).toEqual({ wood: 3 })
  expect(afterDecline.draft.effectCode).toBeNull()
  await pendingDevice.close()
  await page.locator('.aicw-stage-rail button').filter({ hasText: zh ? '基础信息' : 'Card details' }).click()
  await page.getByLabel(zh ? '英文卡牌名' : 'Card name').fill('Changed draft identity')
  await page.locator('.aicw-stage-rail button').filter({ hasText: zh ? '卡牌能力' : 'Card ability' }).click()
  await page.getByRole('button', { name: zh ? '运行静态验证' : 'Run static validation' }).click()
  await expect(adopt).toBeDisabled()
  await expect(page.locator('.aicw-save-state')).toContainText(zh ? '已同步' : 'Synced')
  await enter()
  await expect(editor).toHaveValue(source(2))
  await expect(adopt).toBeDisabled()
  const revalidated = await page.evaluate(async id => (await (await fetch(`/api/workshop/cards/${id}/workspace`)).json()).workspace.draft.generation.ability, id)
  expect(revalidated).not.toHaveProperty('lastValid')
  expect(revalidated.latestResult.failedCandidate.sourceCode).toBe(source(2))
  await page.locator('.aicw-stage-rail button').filter({ hasText: zh ? '基础信息' : 'Card details' }).click()
  await page.getByLabel(zh ? '英文卡牌名' : 'Card name').fill(name)
  await page.locator('.aicw-stage-rail button').filter({ hasText: zh ? '卡牌能力' : 'Card ability' }).click()
  await page.getByRole('button', { name: zh ? '运行静态验证' : 'Run static validation' }).click()
  await expect(adopt).toBeEnabled()
  await editor.fill(source(2).replace(name, 'Manually changed identity'))
  await page.getByRole('button', { name: zh ? '运行静态验证' : 'Run static validation' }).click()
  await expect(page.locator('.aicw-validation-errors')).toContainText('id, card type and name must match')
  await expect(adopt).toBeDisabled()
  await editor.fill(source(2))
  await page.getByRole('button', { name: zh ? '运行静态验证' : 'Run static validation' }).click()
  await expect(adopt).toBeEnabled()
  fail = true
  await input.fill('A failed complete source')
  await generate.click()
  await expect(page.locator('.aicw-generation-progress')).toContainText(zh ? '本次尝试已结束' : 'Attempt finished')
  await expect(editor).toHaveValue(source(9, true))
  await expect(adopt).toBeDisabled()
  expect(bodies).toHaveLength(5) // Original + exactly two static repairs.
  // Verify recovery after the final result is saved, not the conflict branch
  // caused by navigating while its revision update is still in flight.
  await expect(page.locator('.aicw-save-state')).toContainText(zh ? '已同步' : 'Synced')
  await page.reload()
  await page.getByRole('button', { name: zh ? /卡牌能力\s*对话、源码与验证/ : /Card ability\s*Conversation/ }).click()
  await expect(editor).toHaveValue(source(9, true))
  await expect(adopt).toBeDisabled()
  expect(bodies).toHaveLength(5)
  await page.locator('.aicw-ability-tabs button').filter({ hasText: zh ? '代码校验通过' : 'Code validated' }).last().click()
  await expect(editor).toHaveValue(source(2))
  await Promise.all([
    page.waitForEvent('dialog').then(dialog => dialog.accept()),
    adopt.click(),
  ])
  await expect(page.locator('.aicw-current-code code')).toHaveText(source(2))
  const persisted = await page.evaluate(async id => (await (await fetch(`/api/workshop/cards/${id}/workspace`)).json()).workspace, id)
  expect(persisted.draft.effectCode).toBe(source(2))
  expect(persisted.draft.generation.ability.adopted).not.toHaveProperty('provenance')
  expect(persisted.draft.generation.ability.adopted).not.toHaveProperty('provider')
  expect(persisted.draft.generation.ability.adopted).not.toHaveProperty('model')
  expect(JSON.stringify(persisted.draft.generation)).not.toContain(modelKey)
  expect(JSON.stringify(persisted.draft.generation)).not.toContain('"messages"')
  await enter()
  await expect(page.locator('.aicw-ability-tabs button')).toHaveCount(0)
  await expect(page.locator('.aicw-current-code code')).toHaveText(source(2))
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
  await expect(page.locator('.aicw-save-state')).toContainText(zh ? '已同步' : 'Synced')
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
  await expect(otherPage.locator('.aicw-ability-tabs button')).toHaveCount(0)
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
  await page.route('**/api/workshop/references/**', route => route.fulfill({ json: route.request().url().endsWith('/main')
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
      { id: `request-${posts}`, model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason: posts < 8 ? 'tool_calls' : 'stop' }] },
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
    const model = createToolTransport({ provider: 'deepseek', model: 'deepseek-flash', apiKey: modelKey }, {
      // Test-only authorization of the exact candidate tuple. Product admission remains closed.
      authorize: (target: { provider: string; model: string; endpoint: string }) => {
        if (target.provider !== 'deepseek' || target.model !== 'deepseek-flash' || target.endpoint !== 'https://api.deepseek.com/v1/chat/completions') throw new Error('Unexpected test target')
      },
    })
    return await new GenerationAttempt(request, { model, ...createSandboxPorts((path: string, init?: RequestInit) => fetch(path, { ...init, credentials: 'include' })), openReferences: ReferenceSession.createOpener() }).start()
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

test('project metadata and anonymous GitHub source work from the real browser origin', async ({ page }) => {
  test.skip(process.env.RUN_GITHUB_REFERENCE_PROBE !== '1', 'Explicit network probe; deterministic CI uses the controlled round-trip above.')
  const user = await createLocalUserForTests(`reference_${Date.now().toString(36)}`, 'reference-test-password')
  const cookie = await createSession(user.id)
  if (!cookie) throw new Error('No reference test session')
  await page.context().addCookies([{ name: 'oa_session', value: cookie, url: FRONTEND_URL }])
  const destinations: Array<{ url: string; authorization?: string }> = []
  page.on('request', request => { destinations.push({ url: request.url(), authorization: request.headers().authorization }) })
  await page.goto(FRONTEND_URL)
  const evidence = await page.evaluate(async () => {
    const modulePath = '/client/services/llm/generation/references.ts'
    const { ReferenceSession } = await import(modulePath)
    const signal = AbortSignal.timeout(45_000)
    const refs = await ReferenceSession.createOpener()(signal)
    const result = JSON.parse(await refs.execute({ id: 'probe', type: 'function', function: { name: 'read_reference', arguments: JSON.stringify({ path: 'docs/CUSTOM_CARD_SANDBOX.md', startLine: 1, lineCount: 8 }) } }, signal))
    return { commit: refs.commit, path: result.path, text: result.text, url: result.url }
  })
  expect(evidence.commit).toMatch(/^[a-f0-9]{40}$/)
  expect(evidence.path).toBe('docs/CUSTOM_CARD_SANDBOX.md')
  expect(evidence.text.length).toBeGreaterThan(20)
  expect(evidence.url).toContain(`/blob/${evidence.commit}/`)
  expect(destinations.some(item => item.url.endsWith('/api/workshop/references/main'))).toBe(true)
  expect(destinations.filter(item => item.url.startsWith('https://api.github.com/'))).toHaveLength(0)
  const rawRequests = destinations.filter(item => item.url.startsWith('https://raw.githubusercontent.com/'))
  expect(rawRequests.length).toBeGreaterThan(0)
  expect(rawRequests.every(item => !item.authorization)).toBe(true)
  console.log(JSON.stringify({ githubBrowserProbe: 'passed', commit: evidence.commit, path: evidence.path }))
})

for (const mode of ['malformed', 'large', 'multiline-gap']) test(`acceptance captures bounded visible answers without opaque fields (${mode})`, async ({ page }) => {
  const large = mode === 'large'
  const multiline = mode === 'multiline-gap'
  const user = await createLocalUserForTests(`answer_${mode.replaceAll('-', '_')}_${Date.now().toString(36)}`, 'answer-test-password')
  const cookie = await createSession(user.id)
  if (!cookie) throw new Error('No answer evidence test session')
  await page.context().addCookies([{ name: 'oa_session', value: cookie, url: FRONTEND_URL }])
  await page.route('**/api/workshop/references/**', route => route.fulfill({ json: route.request().url().endsWith('/main') ? { object: { sha: referenceCommit } } : { truncated: false, tree: [] } }))
  const message = 'Missing field placement.\nKeep the cost and crop.'
  const answer = multiline ? `{"kind":"capability-gap","message":"${message}"}`
    : large ? '缺'.repeat(30_000) : '\uFEFF{"kind":"capability-gap","message":"Unavailable capability."}'
  const reasoning = 'private-answer-reasoning-canary'
  const signature = 'private-answer-signature-canary'
  let posts = 0
  let settlements = 0
  await page.exposeFunction('acceptanceReserve', () => 'synthetic-answer-reservation')
  await page.exposeFunction('acceptanceSettle', () => { settlements += 1 })
  await page.route(modelUrl, async route => {
    posts += 1
    const frames = [
      { model: 'deepseek-flash', choices: [{ index: 0, delta: { role: 'assistant', content: answer, reasoning_content: reasoning, extra_content: { google: { thought_signature: signature } } }, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 100, completion_tokens: 50 } },
    ]
    await route.fulfill({ contentType: 'text/event-stream', body: frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n' })
  })
  await page.goto(FRONTEND_URL)
  const result = await page.evaluate(async ({ modelKey }) => {
    const modulePath = '/tests/llm-card-gen/acceptance/browser.ts'
    const { runBrowserTask } = await import(modulePath)
    const { contract } = await (await fetch('/api/workshop/sandbox-contract')).json()
    return runBrowserTask({
      task: 'visible-answer-evidence',
      input: { id: 'visible-answer-evidence', workspaceId: 'answer-evidence', baseRevision: 1,
        draft: { cardId: 'CUSTOM_AnswerEvidence', cardType: 'minor', name: 'Answer Evidence', description: '', cardJson: {}, effectCode: null, artUrl: null, generation: {} },
        intent: { kind: 'generate', message: 'Explain the unavailable capability.' },
      },
      config: { provider: 'deepseek', model: 'deepseek-flash', apiKey: modelKey },
      sandboxContractId: contract.id,
    })
  }, { modelKey })
  expect(posts).toBe(1)
  expect(settlements).toBe(1)
  expect(result.snapshot).toMatchObject({ status: 'completed', modelRequests: 1, repairs: 0, result: { kind: multiline ? 'capability-gap' : 'failure' } })
  if (multiline) expect(result.snapshot.result?.message).toBe(message)
  expect(result.snapshot.candidate).toBeUndefined()
  expect(result.sources).toHaveLength(0)
  expect(result.answers).toHaveLength(1)
  expect(result.answers[0]).toMatchObject({ sequence: 1, textBytes: Buffer.byteLength(answer), sha256: createHash('sha256').update(answer).digest('hex'), truncated: large })
  expect(result.answers[0].text).toBe(large ? '缺'.repeat(Math.floor(65_536 / 3)) : answer)
  expect(Buffer.byteLength(result.answers[0].text)).toBeLessThanOrEqual(65_536)
  for (const secret of [reasoning, signature, modelKey]) expect(JSON.stringify(result)).not.toContain(secret)
})
