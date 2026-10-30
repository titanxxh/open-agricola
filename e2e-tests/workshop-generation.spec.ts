import { createHash } from 'node:crypto'
import { expect, type Route } from '@playwright/test'
import { test } from './server-fixtures'
import { FRONTEND_URL } from './fixtures'
import { createLocalUserForTests, createSession } from '../server/auth'

const modelUrl = 'https://api.deepseek.com/v1/chat/completions'
const referenceCommit = 'e'.repeat(40)
const referencePath = 'docs/CUSTOM_CARD_SANDBOX.md'
const referenceBody = 'Sandbox example: use gainLeaf(CARD_ID, { food: 1 }).\n'
const blob = createHash('sha1').update(`blob ${Buffer.byteLength(referenceBody)}\0`).update(referenceBody).digest('hex')
const modelKey = 'browser-only-llm-credential-canary'
const tool = (name: string, args: unknown, id = name, index = 0) => ({ index, id, type: 'function', function: { name, arguments: JSON.stringify(args) } })
const artifacts = (source: string, tests: string) => [tool('write_artifacts', { source, tests }), tool('run_tests', {}, 'run_tests', 1)]
const foodTests = (cardId: string, amount: number) => `test('onBuy food', () => {
  const session = createSession();
  const state = session.getState().state;
  state.players[0].minorHand = ['${cardId}'];
  state.players[0].resources = { ...helpers.emptyResources, wood: 2 };
  state.currentPlayerIndex = 0;
  let response = session.takeAction(0, 'meeting-place');
  expect(response.ok, response.error).to.equal(true);
  expect(response.interaction.request.kind).to.equal('choice');
  const improvement = response.interaction.request.options.find(option => option.labelKey === 'actions.improvement.name');
  expect(improvement, 'Meeting Place offers an improvement').to.exist;
  response = session.resolveChoice(0, improvement.value);
  expect(response.ok, response.error).to.equal(true);
  expect(response.state.players[0].minorPlayed).to.include('${cardId}');
  expect(response.state.players[0].resources.wood).to.equal(0);
  expect(response.state.players[0].resources.food).to.equal(${amount});
});`
async function respond(route: Route, delta: Record<string, unknown>, tools = false) {
  await route.fulfill({ contentType: 'text/event-stream', headers: { 'Access-Control-Allow-Origin': '*' }, body: [
    { id: 'synthetic-response', model: 'synthetic-selected-revision', choices: [{ index: 0, delta: { role: 'assistant', ...delta }, finish_reason: tools ? 'tool_calls' : 'stop' }] },
    { choices: [], usage: { prompt_tokens: 20, completion_tokens: 40 } },
  ].map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n' })
}

for (const { width, height } of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) test(`editor candidate recovery and explicit adoption (en, ${width}px)`, async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width, height })
  await page.addInitScript(() => { if (window === top) localStorage.setItem('open-agricola-locale-v2', 'en') })
  const user = await createLocalUserForTests(`editor_${width}_${Date.now().toString(36)}`, 'editor-test-password')
  const cookie = await createSession(user.id)
  if (!cookie) throw new Error('No local test session')
  await page.context().addCookies([{ name: 'oa_session', value: cookie, url: FRONTEND_URL }])
  await page.route('**/api/workshop/references/**', route => route.fulfill({ json: route.request().url().endsWith('/main') ? { object: { sha: referenceCommit } } : { truncated: false, tree: [] } }))
  await page.goto(FRONTEND_URL)
  const cardId = `CUSTOM_Editor_${width}_${Date.now()}`
  const name = 'Editor Tool Test'
  const id = await page.evaluate(async ({ cardId, name, modelKey }) => {
    // A model outside the former exact-tuple admission list uses the same transport.
    localStorage.setItem('open-agricola-llm-config', JSON.stringify({ provider: 'deepseek', apiKey: modelKey, model: 'deepseek-v4-pro' }))
    const response = await fetch('/api/workshop/cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ card_id: cardId, card_type: 'minor', name, description: '', card_json: { id: cardId, card_type: 'minor', name, cost: { wood: 2 }, desc: [] }, status: 'draft' }) })
    const data = await response.json()
    if (!response.ok || !data.id) throw new Error(JSON.stringify(data))
    return String(data.id)
  }, { cardId, name, modelKey })
  const source = (amount: number, bad = false) => `const CARD_ID = '${cardId}'; const CARD_DEF = { cardType: 'minor', meta: { id: CARD_ID, name: '${name}', cost: { wood: 2 }, desc: ['Gain ${amount} food.'] } }; const CARD_IMPL = { effect: { onBuy: () => ${bad ? `({ type: 'seq', items: [gainLeaf(CARD_ID, { food: ${amount} })] })` : `gainLeaf(CARD_ID, { food: ${amount} })`} } };`
  const inputs: Array<{ source: string | null; tests: string | null; card: unknown }> = []
  let posts = 0
  await page.route(modelUrl, async route => {
    const body = route.request().postDataJSON()
    posts += 1
    expect(body.tool_choice).toBe('auto')
    expect(body.tools).toHaveLength(4)
    if (body.messages.at(-1).role === 'tool') return respond(route, { content: 'Review the written source and test report.' })
    const input = JSON.parse(body.messages[1].content)
    inputs.push(input)
    const amount = inputs.length === 3 ? 9 : inputs.length
    return respond(route, { tool_calls: artifacts(source(amount, amount === 9), foodTests(cardId, amount)) }, true)
  })
  const enter = async () => {
    await page.goto(`${FRONTEND_URL}/?page=workshop&view=editor&card=${id}`)
    await page.getByRole('button', { name: /Card ability\s*Conversation/ }).click()
  }
  await enter()
  const input = page.getByPlaceholder('Describe the card effect…')
  const generate = page.getByRole('button', { name: 'Generate ability candidate' })
  const editor = page.getByLabel('Ability candidate source')
  const ut = page.getByRole('textbox', { name: 'UT', exact: true })
  const validate = page.getByRole('button', { name: 'Validate Code', exact: true })
  const adopt = page.getByRole('button', { name: 'Adopt as current source' })
  await input.fill('Gain 1 food when played')
  await generate.click()
  await expect(adopt).toBeEnabled()
  await expect(editor).toHaveValue(source(1))
  await expect(ut).toHaveValue(foodTests(cardId, 1))
  await expect(page.locator('.aicw-ut-report')).toContainText('1')
  await page.locator('.aicw-ability-review').screenshot({ path: testInfo.outputPath(`candidate-ut-passed-${width}.png`) })
  await expect(page.locator('.aicw-current-code')).toHaveCount(0)
  await input.fill('Change the food reward to 2')
  await generate.click()
  await expect(editor).toHaveValue(source(2))
  await expect(adopt).toBeEnabled()
  expect(inputs[1]).toMatchObject({ source: source(1), tests: foodTests(cardId, 1), card: { id: cardId, name, type: 'minor', definition: { cost: { wood: 2 } } } })
  await page.locator('.aicw-stage-rail button').filter({ hasText: 'Card details' }).click()
  await page.locator('#ai-cost-input').fill('3 wood')
  await page.locator('.aicw-stage-rail button').filter({ hasText: 'Card ability' }).click()
  await expect(page.locator('.aicw-save-state')).toContainText('Synced')
  const pendingDevice = await browser.newContext()
  await pendingDevice.addCookies([{ name: 'oa_session', value: cookie, url: FRONTEND_URL }])
  const pendingPage = await pendingDevice.newPage()
  await pendingPage.addInitScript(() => { if (window === top) localStorage.setItem('open-agricola-locale-v2', 'en') })
  await pendingPage.goto(`${FRONTEND_URL}/?page=workshop&view=editor&card=${id}`)
  await pendingPage.locator('.aicw-stage-rail button').filter({ hasText: 'Card ability' }).click()
  await expect(pendingPage.locator('.aicw-candidate-state')).toContainText('Generated from an older draft')
  await Promise.all([
    pendingPage.waitForEvent('dialog').then(async dialog => { expect(dialog.message()).toContain('older draft'); await dialog.dismiss() }),
    pendingPage.getByRole('button', { name: 'Adopt as current source' }).click(),
  ])
  const afterDecline = await pendingPage.evaluate(async id => (await (await fetch(`/api/workshop/cards/${id}/workspace`)).json()).workspace, id)
  expect(afterDecline.draft.cardJson.cost).toEqual({ wood: 3 })
  expect(afterDecline.draft.effectCode).toBeNull()
  await pendingDevice.close()
  await page.locator('.aicw-stage-rail button').filter({ hasText: 'Card details' }).click()
  await page.getByLabel('Card name').fill('Changed draft identity')
  await page.locator('.aicw-stage-rail button').filter({ hasText: 'Card ability' }).click()
  await validate.click()
  await expect(adopt).toBeDisabled()
  await expect(page.locator('.aicw-validation-errors')).toContainText('id, card type and name must match')
  await expect(page.locator('.aicw-save-state')).toContainText('Synced')
  await enter()
  await expect(editor).toHaveValue(source(2))
  await expect(ut).toHaveValue(foodTests(cardId, 2))
  await expect(adopt).toBeDisabled()
  await page.locator('.aicw-stage-rail button').filter({ hasText: 'Card details' }).click()
  await page.getByLabel('Card name').fill(name)
  await page.locator('.aicw-stage-rail button').filter({ hasText: 'Card ability' }).click()
  await validate.click()
  await expect(adopt).toBeEnabled()
  await editor.fill(source(2).replace(name, 'Manually changed identity'))
  await validate.click()
  await expect(page.locator('.aicw-validation-errors')).toContainText('id, card type and name must match')
  await expect(adopt).toBeDisabled()
  await editor.fill(source(2))
  await ut.fill(foodTests(cardId, 3))
  await validate.click()
  await expect(page.locator('.aicw-ut-report')).toContainText('onBuy food')
  await expect(page.locator('.aicw-ut-report')).toContainText('expected 2 to equal 3')
  await expect(adopt).toBeDisabled()
  await ut.fill(foodTests(cardId, 2))
  await validate.click()
  await expect(adopt).toBeEnabled()
  await input.fill('A failed complete source')
  await generate.click()
  await expect(page.locator('.aicw-generation-progress')).toContainText('Attempt finished')
  await expect(editor).toHaveValue(source(9, true))
  await expect(adopt).toBeDisabled()
  expect(posts).toBe(6)
  await expect(page.locator('.aicw-save-state')).toContainText('Synced')
  await page.reload()
  await page.getByRole('button', { name: /Card ability\s*Conversation/ }).click()
  await expect(editor).toHaveValue(source(9, true))
  await expect(ut).toHaveValue(foodTests(cardId, 9))
  await expect(adopt).toBeDisabled()
  expect(posts).toBe(6)
  await page.locator('.aicw-ability-tabs button').nth(1).click()
  await expect(editor).toHaveValue(source(2))
  await expect(adopt).toBeEnabled()
  await Promise.all([page.waitForEvent('dialog').then(dialog => dialog.accept()), adopt.click()])
  await expect(page.locator('.aicw-current-code code')).toHaveText(source(2))
  const persisted = await page.evaluate(async id => (await (await fetch(`/api/workshop/cards/${id}/workspace`)).json()).workspace, id)
  expect(persisted.draft.effectCode).toBe(source(2))
  expect(persisted.draft.generation.ability.adopted.testing).toMatchObject({ code: foodTests(cardId, 2), lastRun: { outcome: { kind: 'passed', count: 1 } } })
  for (const field of ['provenance', 'provider', 'model']) expect(persisted.draft.generation.ability.adopted).not.toHaveProperty(field)
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
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'An incomplete response' } }] })}\n\n` })
  })
  await input.fill('An interrupted response')
  await generate.click()
  await expect(page.locator('.aicw-generation-progress')).toContainText('Paused')
  await expect(page.locator('.aicw-save-state')).toContainText('Synced')
  await page.reload()
  await page.getByRole('button', { name: /Card ability\s*Conversation/ }).click()
  await expect(page.locator('.aicw-generation-result')).toContainText('Previous attempt interrupted')
  await expect(page.locator('.aicw-current-code code')).toHaveText(source(2))
  expect(interruptedCalls).toBe(1)
  await expect(page.getByRole('button', { name: 'Retry this step' })).toHaveCount(0)
  const other = await browser.newContext()
  await other.addCookies([{ name: 'oa_session', value: cookie, url: FRONTEND_URL }])
  const otherPage = await other.newPage()
  await otherPage.addInitScript(() => { if (window === top) localStorage.setItem('open-agricola-locale-v2', 'en') })
  await otherPage.goto(`${FRONTEND_URL}/?page=workshop&view=editor&card=${id}`)
  await otherPage.getByRole('button', { name: /Card ability/ }).click()
  await expect(otherPage.locator('.aicw-current-code code')).toHaveText(source(2))
  await expect(otherPage.locator('.aicw-ability-tabs button')).toHaveCount(0)
  await expect(otherPage.locator('.ai-message')).toHaveCount(0)
  await other.close()
})

test('four browser tools preserve protocol through UT repair and explicit allowance continuation', async ({ page }) => {
  test.setTimeout(90_000)
  const user = await createLocalUserForTests(`loop_${Date.now().toString(36)}`, 'loop-test-password')
  const cookie = await createSession(user.id)
  if (!cookie) throw new Error('Could not create the local acceptance session')
  await page.context().addCookies([{ name: 'oa_session', value: cookie, url: FRONTEND_URL }])
  const destinations: Array<{ url: string; containsModelKey: boolean }> = []
  page.on('request', req => destinations.push({ url: req.url(), containsModelKey: JSON.stringify(req.headers()).includes(modelKey) || (req.postData() ?? '').includes(modelKey) }))
  await page.route('**/api/workshop/references/**', route => route.fulfill({ json: route.request().url().endsWith('/main')
    ? { object: { sha: referenceCommit } }
    : { truncated: false, tree: [{ path: referencePath, type: 'blob', sha: blob, size: Buffer.byteLength(referenceBody) }] } }))
  await page.route('https://raw.githubusercontent.com/**', route => route.fulfill({ body: referenceBody, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' } }))
  const cardId = `CUSTOM_BrowserLoop_${Date.now()}`
  const source = (amount: number) => `const CARD_ID = '${cardId}'; const CARD_DEF = { cardType: 'minor', meta: { id: CARD_ID, name: 'Browser Loop', cost: { wood: 2 }, desc: ['Gain ${amount} food.'] } }; const CARD_IMPL = { effect: { onBuy: () => gainLeaf(CARD_ID, { food: ${amount} }) } };`
  let posts = 0
  let preservedProtocol = true
  await page.route(modelUrl, async route => {
    const body = route.request().postDataJSON()
    posts += 1
    expect(body.tool_choice).toBe('auto')
    expect(body.tools.map((entry: { function: { name: string } }) => entry.function.name)).toEqual(['search_references', 'read_reference', 'write_artifacts', 'run_tests'])
    const prior = body.messages.findLastIndex((entry: { role: string }) => entry.role === 'assistant')
    if (prior >= 0) {
      const assistant = body.messages[prior]
      const replies = body.messages.slice(prior + 1)
      preservedProtocol &&= assistant.reasoning_content === 'private-reasoning-canary'
        && assistant.extra_content.google.thought_signature === 'private-signature-canary'
        && replies.length === assistant.tool_calls.length
        && replies.every((entry: { role: string; tool_call_id: string }, index: number) => entry.role === 'tool' && entry.tool_call_id === assistant.tool_calls[index].id)
    }
    if (posts === 3) expect(JSON.parse(body.messages.at(-1).content)).toMatchObject({ validation: { valid: true }, outcome: { kind: 'failed', failures: [{ name: 'onBuy food', error: expect.stringContaining('expected 1 to equal 2') }] } })
    if (posts === 4) expect(JSON.parse(body.messages.at(-1).content)).toMatchObject({ validation: { valid: true }, outcome: { kind: 'passed', count: 1 } })
    if (posts === 9) return respond(route, { content: '' })
    const calls = posts === 2 ? artifacts(source(1), foodTests(cardId, 2)) : posts === 3 ? artifacts(source(2), foodTests(cardId, 2))
      : [tool('read_reference', { path: referencePath, startLine: 1, lineCount: 10 }, `reference-${posts}`)]
    return respond(route, { reasoning_content: 'private-reasoning-canary', extra_content: { google: { thought_signature: 'private-signature-canary' } }, tool_calls: calls }, true)
  })
  await page.goto(FRONTEND_URL)
  const evidence = await page.evaluate(async ({ cardId, modelKey }) => {
    const root = '/client/services/llm/generation/'
    const [{ GenerationAttempt }, { buildGenerationRequest }, { createBrowserGenerationPorts }] = await Promise.all([
      import(root + 'attempt.ts'), import(root + 'request.ts'), import(root + 'browser.ts'),
    ])
    const request = buildGenerationRequest({ workspaceId: 'browser-probe', baseRevision: 1,
      draft: { cardId, cardType: 'minor', name: 'Browser Loop', description: '', cardJson: {}, effectCode: null, artUrl: null, generation: {} },
      intent: { kind: 'generate', message: 'Cost 2 wood; gain 2 food when played.' },
    })
    const attempt = new GenerationAttempt(request, createBrowserGenerationPorts({ provider: 'deepseek', model: 'deepseek-flash', apiKey: modelKey }, (path: string, init?: RequestInit) => fetch(path, { ...init, credentials: 'include' })))
    const paused = await attempt.start()
    const withoutConsent = await attempt.resume()
    const completed = await attempt.resume({ extendAllowance: true })
    return { paused, withoutConsent, completed }
  }, { cardId, modelKey })
  expect(posts).toBe(9)
  expect(preservedProtocol).toBe(true)
  expect(evidence.paused).toMatchObject({ status: 'paused', needsAllowance: true, modelRequests: 8, candidate: { sourceCode: source(2), testing: { lastRun: { outcome: { kind: 'passed', count: 1 } } } } })
  expect(evidence.withoutConsent).toMatchObject({ status: 'paused', modelRequests: 8 })
  expect(evidence.completed).toMatchObject({ status: 'completed', referenceCommit, modelRequests: 9, referenceCalls: 6,
    candidate: { sourceCode: source(2), cardJson: { id: cardId, cost: { wood: 2 } }, validation: { valid: true }, testing: { code: foodTests(cardId, 2), lastRun: { outcome: { kind: 'passed', count: 1 } } } }, result: { kind: 'candidate', message: '' },
  })
  for (const secret of ['private-reasoning-canary', 'private-signature-canary', modelKey]) expect(JSON.stringify(evidence)).not.toContain(secret)
  expect(destinations.filter(item => item.containsModelKey).map(item => item.url)).toEqual(Array(9).fill(modelUrl))
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

for (const mode of ['text', 'large', 'structured-text', 'empty']) test(`acceptance captures ordinary visible answers without artifacts or opaque fields (${mode})`, async ({ page }) => {
  const large = mode === 'large'
  const user = await createLocalUserForTests(`answer_${mode.slice(0, 3)}_${Date.now().toString(36)}`, 'answer-test-password')
  const cookie = await createSession(user.id)
  if (!cookie) throw new Error('No answer evidence test session')
  await page.context().addCookies([{ name: 'oa_session', value: cookie, url: FRONTEND_URL }])
  await page.route('**/api/workshop/references/**', route => route.fulfill({ json: route.request().url().endsWith('/main') ? { object: { sha: referenceCommit } } : { truncated: false, tree: [] } }))
  const answer = mode === 'empty' ? '' : mode === 'structured-text' ? '{"kind":"capability-gap","message":"Missing field placement.\nKeep the cost and crop."}'
    : large ? '缺'.repeat(30_000) : 'Which round should this card trigger in?'
  const reasoning = 'private-answer-reasoning-canary'
  const signature = 'private-answer-signature-canary'
  let posts = 0
  let settlements = 0
  await page.exposeFunction('acceptanceReserve', () => 'synthetic-answer-reservation')
  await page.exposeFunction('acceptanceSettle', () => { settlements += 1 })
  await page.route(modelUrl, async route => {
    posts += 1
    await respond(route, { content: answer, reasoning_content: reasoning, extra_content: { google: { thought_signature: signature } } })
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
      config: { provider: 'deepseek', model: 'deepseek-flash', apiKey: modelKey }, sandboxContractId: contract.id,
    })
  }, { modelKey })
  expect(posts).toBe(1)
  expect(settlements).toBe(1)
  expect(result.snapshot).toMatchObject({ status: 'completed', modelRequests: 1, result: { kind: 'answer', message: answer } })
  expect(result.snapshot.candidate).toBeUndefined()
  expect(result.sources).toHaveLength(0)
  expect(result.answers).toHaveLength(1)
  expect(result.answers[0]).toMatchObject({ sequence: 1, textBytes: Buffer.byteLength(answer), sha256: createHash('sha256').update(answer).digest('hex'), truncated: large })
  expect(result.answers[0].text).toBe(large ? '缺'.repeat(Math.floor(65_536 / 3)) : answer)
  expect(Buffer.byteLength(result.answers[0].text)).toBeLessThanOrEqual(65_536)
  for (const secret of [reasoning, signature, modelKey]) expect(JSON.stringify(result)).not.toContain(secret)
})
