import AxeBuilder from '@axe-core/playwright'
import Database from 'better-sqlite3'
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'

type Locale = 'zh' | 'en'
type Viewport = 'desktop' | 'mobile'
type Variant = {
  locale: Locale
  viewport: Viewport
  size: { width: number; height: number }
}
type Account = {
  cookie: string
}
type Draft = {
  cardId: string
  cardType: 'minor' | 'occupation'
  name: string
  description: string
  cardJson: Record<string, unknown>
  effectCode: string | null
  compiledCode?: string | null
  codeManifest?: Record<string, unknown> | null
  artUrl: string | null
  generation: Record<string, unknown>
}
type Workspace = {
  id: string
  authorId: string
  revision: number
  status: string
  draft: Draft
  publishedVersionId: string | null
  sandboxPassVersionId: string | null
  sandboxPassedAt: number | null
}
type ScenarioContext = {
  page: Page
  request: APIRequestContext
  account: Account
  variant: Variant
}

const variants: Variant[] = [
  { locale: 'zh', viewport: 'desktop', size: { width: 1440, height: 1000 } },
  { locale: 'zh', viewport: 'mobile', size: { width: 390, height: 844 } },
  { locale: 'en', viewport: 'desktop', size: { width: 1440, height: 1000 } },
  { locale: 'en', viewport: 'mobile', size: { width: 390, height: 844 } },
]

const text = (locale: Locale, zh: string, en: string) => locale === 'zh' ? zh : en
const imagePng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const imageData = `data:image/png;base64,${imagePng}`
let sequence = 0

const unique = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${(sequence++).toString(36)}`

const sourceFor = (cardId: string, name: string, invalid = false) => `
const CARD_ID = '${cardId}'
const CARD_DEF = {
  cardType: 'minor',
  meta: {
    id: '${cardId}',
    name: '${name}',
    desc: ['Acceptance test card'],
    cost: {},
    vp: 0,
  },
}
const CARD_IMPL = ${invalid ? "{ onPlay() { eval('invalid') } }" : '{}'}
`.trim()

const cookieValue = (response: APIResponse, cookieName: string) => {
  const header = response.headersArray().find(({ name, value }) =>
    name.toLowerCase() === 'set-cookie' && value.startsWith(`${cookieName}=`),
  )
  if (!header) throw new Error(`missing ${cookieName} cookie`)
  return header.value.split(';')[0]!.slice(cookieName.length + 1)
}

const createAccount = async (
  request: APIRequestContext,
  page?: Page,
): Promise<Account> => {
  const suffix = unique('workspace')
  const username = `ws_${suffix}`.slice(0, 30)
  const password = 'workspace-pass-562'
  const oauth = await request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, {
    data: {
      providerUserId: `github-${suffix}`,
      providerLogin: username,
      email: `${username}@example.com`,
      displayName: username,
    },
  })
  expect(oauth.ok(), await oauth.text()).toBe(true)
  const onboarding = cookieValue(oauth, 'oa_onboarding')
  const complete = await request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
    data: { username, displayName: username, password, confirmPassword: password },
    headers: { Cookie: `oa_onboarding=${onboarding}` },
  })
  const completeText = await complete.text()
  expect(complete.ok(), completeText).toBe(true)
  const cookie = cookieValue(complete, 'oa_session')
  if (page) {
    await page.context().addCookies([{
      name: 'oa_session',
      value: cookie,
      url: FRONTEND_URL,
    }])
  }
  return { cookie }
}

const api = (
  request: APIRequestContext,
  account: Account | null,
  path: string,
  options: {
    method?: string
    data?: unknown
    headers?: Record<string, string>
  } = {},
) => request.fetch(`${BACKEND_URL}${path}`, {
  method: options.method ?? 'GET',
  ...(options.data === undefined ? {} : { data: options.data }),
  headers: {
    Cookie: account ? `oa_session=${account.cookie}` : '',
    ...options.headers,
  },
})

const responseJson = async <T>(
  response: APIResponse,
  expectedStatus?: number,
): Promise<T> => {
  const body = await response.text()
  if (expectedStatus === undefined) {
    expect(response.ok(), `${response.status()} ${body}`).toBe(true)
  } else {
    expect(response.status(), body).toBe(expectedStatus)
  }
  return JSON.parse(body) as T
}

const baseCardJson = (
  cardId: string,
  name: string,
  locales?: Record<string, unknown>,
): Record<string, unknown> => ({
  id: cardId,
  name,
  card_type: 'minor',
  deck: 'CUSTOM',
  number: 0,
  desc: [],
  cost: {},
  vp: 0,
  modifiers: [],
  implemented: true,
  _draft: {},
  ...(locales ? { locales } : {}),
})

const createDraft = async (
  request: APIRequestContext,
  account: Account,
  options: {
    cardId?: string
    name?: string
    artUrl?: string | null
    locales?: Record<string, unknown>
  } = {},
): Promise<Workspace> => {
  const cardId = options.cardId ?? `CUSTOM_${unique('Workspace')}`
  const name = options.name ?? unique('Workspace card')
  const created = await responseJson<{ id: string }>(await api(
    request,
    account,
    '/api/workshop/cards',
    {
      method: 'POST',
      data: {
        card_id: cardId,
        card_type: 'minor',
        name,
        description: '',
        card_json: baseCardJson(cardId, name, options.locales),
        art_url: options.artUrl ?? null,
        status: 'draft',
      },
    },
  ))
  return loadWorkspace(request, account, created.id)
}

const loadWorkspace = async (
  request: APIRequestContext,
  account: Account,
  id: string,
): Promise<Workspace> => {
  const payload = await responseJson<{ workspace: Workspace }>(
    await api(request, account, `/api/workshop/cards/${id}/workspace`),
  )
  return payload.workspace
}

const checkpoint = async (
  request: APIRequestContext,
  account: Account,
  workspace: Workspace,
  draft: Draft,
): Promise<Workspace> => {
  const payload = await responseJson<{ workspace: Workspace }>(await api(
    request,
    account,
    `/api/workshop/cards/${workspace.id}/draft`,
    { method: 'PUT', data: { baseRevision: workspace.revision, draft } },
  ))
  return payload.workspace
}

const adoptArt = async (
  request: APIRequestContext,
  account: Account,
  workspace: Workspace,
  prompt: string,
  resultUrl = imageData,
) => responseJson<{ workspace: Workspace; versionId: string }>(await api(
  request,
  account,
  `/api/workshop/cards/${workspace.id}/adopt`,
  {
    method: 'POST',
    data: {
      baseRevision: workspace.revision,
      candidate: {
        id: unique('art'),
        kind: 'art',
        prompt,
        resultUrl,
        provider: 'fake-image',
        model: 'deterministic-v1',
        referenceImages: ['reference://fixture'],
        createdAt: Date.now(),
      },
    },
  },
))

const adoptAbility = async (
  request: APIRequestContext,
  account: Account,
  workspace: Workspace,
  prompt: string,
  sourceCode = sourceFor(workspace.draft.cardId, workspace.draft.name),
) => responseJson<{ workspace: Workspace; versionId: string }>(await api(
  request,
  account,
  `/api/workshop/cards/${workspace.id}/adopt`,
  {
    method: 'POST',
    data: {
      baseRevision: workspace.revision,
      candidate: {
        id: unique('ability'),
        kind: 'ability',
        prompt,
        sourceCode,
        provider: 'fake-chat',
        model: 'deterministic-v1',
        validation: { valid: true, errors: [] },
        createdAt: Date.now(),
      },
    },
  },
))

const setupPage = async (
  page: Page,
  variant: Variant,
  options: { llm?: boolean } = {},
) => {
  await page.setViewportSize(variant.size)
  await page.addInitScript(({ locale, llm }) => {
    localStorage.setItem('open-agricola-locale-v2', locale)
    if (llm) {
      localStorage.setItem('open-agricola-llm-config-art', JSON.stringify({
        provider: 'gemini',
        apiKey: 'e2e-fake-key',
        model: 'gemini-3.1-flash-image-preview',
      }))
      localStorage.setItem('open-agricola-llm-config', JSON.stringify({
        provider: 'openrouter',
        apiKey: 'e2e-fake-key',
        model: 'qwen/qwen3.6-plus:free',
      }))
    }
  }, { locale: variant.locale, llm: options.llm === true })
}

const openEditor = async (page: Page, cardId?: string) => {
  const card = cardId ? `&card=${encodeURIComponent(cardId)}` : ''
  await page.goto(`${FRONTEND_URL}/?page=workshop&view=editor${card}`)
  await expect(page.locator('.aicw-shell')).toBeVisible({ timeout: 30_000 })
  if (cardId) await expect(page.locator('.aicw-loading')).toBeHidden({ timeout: 30_000 })
}

const stage = async (page: Page, locale: Locale, zh: string, en: string) => {
  const button = page.locator('.aicw-stage-rail button').filter({
    hasText: text(locale, zh, en),
  })
  await button.click()
  await expect(button).toHaveAttribute('aria-current', 'step')
}

const saveLabel = (locale: Locale) => text(locale, '已同步', 'Synced')

const expectSaved = async (page: Page, locale: Locale) => {
  await expect(page.locator('.aicw-save-state')).toContainText(saveLabel(locale), {
    timeout: 30_000,
  })
}

const expectAccessibleWorkspace = async (page: Page) => {
  await expect(page.locator('.aicw-shell')).toBeVisible()
  const activeStage = page.locator('.aicw-stage-rail button[aria-current="step"]')
  await activeStage.focus()
  await expect(activeStage).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(activeStage).toHaveAttribute('aria-current', 'step')
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    shell: (() => {
      const shell = document.querySelector('.aicw-shell')
      return shell ? shell.scrollWidth - shell.clientWidth : 0
    })(),
    text: document.body.innerText,
  }))
  expect(overflow.document).toBeLessThanOrEqual(1)
  expect(overflow.shell).toBeLessThanOrEqual(1)
  expect(overflow.text).not.toMatch(/\bplatform\.[A-Za-z0-9_.]+\b/)
  const scan = await new AxeBuilder({ page }).include('.aicw-shell').analyze()
  expect(
    scan.violations.filter(violation =>
      violation.impact === 'serious' || violation.impact === 'critical'),
  ).toEqual([])
}

const versions = async (
  request: APIRequestContext,
  account: Account,
  cardId: string,
) => responseJson<{ versions: Array<{
  id: string
  version_number: number
  card_json: Record<string, unknown>
}> }>(await api(request, account, `/api/workshop/cards/${cardId}/versions`))

const withDatabase = <T>(read: (database: Database.Database) => T): T => {
  const path = process.env.DB_PATH ?? 'data/open-agricola.db'
  const database = new Database(path, { readonly: true })
  try {
    return read(database)
  } finally {
    database.close()
  }
}

const fakeImageService = async (page: Page) => {
  await page.route('https://generativelanguage.googleapis.com/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [{
          content: {
            parts: [{ inlineData: { data: imagePng, mimeType: 'image/png' } }],
          },
        }],
      }),
    }),
  )
}

const fakeChatService = async (
  page: Page,
  response: (call: number) => string,
) => {
  let calls = 0
  await page.route('https://openrouter.ai/**/chat/completions', route => {
    const content = response(calls++)
    const body = content
      ? `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`
      : 'data: [DONE]\n\n'
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body,
    })
  })
}

const scenarioNewDraft = async ({
  page,
  request,
  account,
  variant,
}: ScenarioContext) => {
  const duplicateOwner = await createAccount(request)
  const duplicateId = `CUSTOM_${unique('Duplicate')}`
  await createDraft(request, duplicateOwner, { cardId: duplicateId, name: 'Duplicate owner' })
  await openEditor(page)

  const name = page.getByLabel(text(variant.locale, '英文卡牌名', 'Card name'))
  const cardId = page.getByLabel(text(variant.locale, '卡牌 ID', 'Card ID'))
  const save = page.locator('.aicw-header-actions').getByRole('button', {
    name: text(variant.locale, '保存草稿', 'Save draft'),
  })

  await save.click()
  await expect(name).toBeFocused()
  await expect(name).toHaveAttribute('aria-invalid', 'true')
  expect((await responseJson<{ cards: unknown[] }>(
    await api(request, account, '/api/workshop/cards?scope=mine'),
  )).cards).toHaveLength(0)

  await name.fill('Acceptance card')
  await cardId.fill('INVALID')
  await expect(page.locator('.aicw-metadata .form-error')).toBeVisible()
  await expect(cardId).toHaveAttribute('aria-invalid', 'true')
  await save.click()
  await expect(cardId).toBeFocused()

  await cardId.fill(duplicateId)
  await save.click()
  await expect(page.locator('.ai-error')).toBeVisible()
  await expect(page.locator('.ai-error')).toBeFocused()

  const uniqueId = `CUSTOM_${unique('Created')}`
  await cardId.fill(uniqueId)
  await save.click()
  await expectSaved(page, variant.locale)

  const mine = await responseJson<{ cards: Array<{ card_id: string }> }>(
    await api(request, account, '/api/workshop/cards?scope=mine'),
  )
  expect(mine.cards.map(card => card.card_id)).toEqual([uniqueId])
  expect(withDatabase(database => database.prepare(
    'SELECT COUNT(*) AS count FROM workshop_cards WHERE card_id = ?',
  ).get(uniqueId) as { count: number }).count).toBe(1)
  await expectAccessibleWorkspace(page)
}

const scenarioArtCandidates = async ({
  page,
  request,
  account,
  variant,
}: ScenarioContext) => {
  await fakeImageService(page)
  const workspace = await createDraft(request, account)
  await openEditor(page, workspace.id)
  await stage(page, variant.locale, '卡面图', 'Card art')

  const prompt = unique('private art prompt')
  await page.getByLabel(text(variant.locale, '画面主题', 'Image subject')).fill(
    text(variant.locale, '河谷木匠', 'A valley carpenter'),
  )
  const promptInput = page.getByLabel(text(variant.locale, '生成提示词', 'Generation prompt'))
  await promptInput.fill(prompt)
  const referenceButton = page.locator('.ai-ref-thumb').first()
  const referenceId = await referenceButton.locator('img').getAttribute('src')
  expect(referenceId).toBeTruthy()
  await referenceButton.click()
  const generate = page.getByRole('button', {
    name: text(variant.locale, '生成图片候选', 'Generate art candidate'),
  })
  const candidateSection = page.locator('.aicw-candidate-section')
  let thirdLabels: string[] = []
  for (let index = 1; index <= 4; index++) {
    const checkpointResponse = page.waitForResponse(response =>
      response.url().endsWith(`/api/workshop/cards/${workspace.id}/draft`)
      && response.request().method() === 'PUT',
    )
    await generate.click()
    expect((await checkpointResponse).ok()).toBe(true)
    await expect(candidateSection).toContainText(`${Math.min(index, 3)} / 3`, {
      timeout: 30_000,
    })
    await expectSaved(page, variant.locale)
    if (index === 3) {
      thirdLabels = await page.locator('.aicw-art-candidates button').evaluateAll(buttons =>
        buttons.map(button => button.getAttribute('aria-label') ?? ''),
      )
    }
  }
  const fourthLabels = await page.locator('.aicw-art-candidates button').evaluateAll(buttons =>
    buttons.map(button => button.getAttribute('aria-label') ?? ''),
  )
  expect(fourthLabels).toHaveLength(3)
  expect(fourthLabels).not.toContain(thirdLabels[0])
  expect((await loadWorkspace(request, account, workspace.id)).draft.artUrl).toBeNull()

  await stage(page, variant.locale, '基础信息', 'Card details')
  await page.getByLabel(text(variant.locale, '英文卡牌名', 'Card name')).fill('Changed after generation')
  await stage(page, variant.locale, '卡面图', 'Card art')
  await expect(page.locator('.aicw-candidate-state').last()).toContainText(
    text(variant.locale, '基于旧草稿生成', 'Generated from an older draft'),
  )
  await page.locator('.aicw-art-candidates button').first().click()
  await page.getByRole('button', {
    name: text(variant.locale, '丢弃候选', 'Discard'),
  }).click()
  await expect(candidateSection).toContainText('2 / 3')

  await page.locator('.aicw-art-candidates button').last().click()
  await page.locator('.aicw-art-review details').click()
  await expect(page.locator('.aicw-art-review details')).toContainText(prompt)
  await expect(page.locator('.aicw-art-review details')).toContainText('gemini')
  await expect(page.locator('.aicw-art-review details')).toContainText(referenceId!)
  page.once('dialog', dialog => dialog.accept())
  const adopt = page.getByRole('button', {
    name: text(variant.locale, '采用为当前卡面', 'Adopt as current art'),
  })
  await adopt.focus()
  await page.keyboard.press('Enter')
  await expect(candidateSection).toBeHidden()
  await expect(page.locator('.aicw-heading')).toBeFocused()
  await expect(page.locator('.aicw-current-asset')).toBeVisible()

  const saved = await loadWorkspace(request, account, workspace.id)
  expect(saved.draft.artUrl).toBeTruthy()
  expect(JSON.stringify(saved.draft.generation)).toContain(prompt)
  expect((await versions(request, account, workspace.id)).versions).toHaveLength(1)
  await expectAccessibleWorkspace(page)
}

const scenarioAbilityCandidates = async ({
  page,
  request,
  account,
  variant,
}: ScenarioContext) => {
  const workspace = await createDraft(request, account)
  const generatedId = `CUSTOM_${unique('GeneratedAbility')}`
  const generatedName = unique('Generated ability card')
  const validSource = `
const CARD_ID = '${generatedId}'
const CARD_DEF = {
  cardType: 'minor',
  meta: {
    id: CARD_ID,
    name: '${generatedName}',
    desc: ['Generated ability description'],
    cost: { wood: 2 },
    vp: 2,
    locales: {
      zh: {
        name: '生成的能力卡',
        desc: ['生成的能力说明'],
      },
    },
  },
}
const CARD_IMPL = {}
`.trim()
  const invalidSource = sourceFor(workspace.draft.cardId, workspace.draft.name, true)
  await fakeChatService(page, call =>
    `\`\`\`typescript\n${call === 0 ? invalidSource : validSource}\n\`\`\``,
  )
  await openEditor(page, workspace.id)
  await stage(page, variant.locale, '卡牌能力', 'Card ability')

  const input = page.getByPlaceholder(
    text(variant.locale, '描述你想要的卡牌效果…', 'Describe the card effect…'),
  )
  const generate = page.getByRole('button', {
    name: text(variant.locale, '生成能力候选', 'Generate ability candidate'),
  })
  await input.fill('Generate an invalid effect')
  await generate.click()
  await expect(page.locator('.aicw-candidate-section')).toContainText('1 / 3', {
    timeout: 30_000,
  })
  await expect(page.getByRole('button', {
    name: text(variant.locale, '采用为当前源码', 'Adopt as current source'),
  })).toBeDisabled()

  await page.getByRole('button', { name: text(variant.locale, '重发', 'Resend') }).click()
  await expect(page.locator('.aicw-candidate-section')).toContainText('2 / 3', {
    timeout: 30_000,
  })
  for (const requestText of ['Generate third candidate', 'Generate fourth candidate']) {
    await input.fill(requestText)
    await generate.click()
    await expect(page.locator('.aicw-candidate-section')).toContainText('3 / 3', {
      timeout: 30_000,
    })
  }
  await expect(page.locator('.aicw-ability-tabs button')).toHaveCount(3)
  await expect(page.locator('.aicw-current-code')).toBeHidden()

  const editor = page.getByLabel(
    text(variant.locale, '能力候选源码', 'Ability candidate source'),
  )
  await editor.fill(`${validSource}\n`)
  const adopt = page.getByRole('button', {
    name: text(variant.locale, '采用为当前源码', 'Adopt as current source'),
  })
  await expect(adopt).toBeDisabled()
  await page.getByRole('button', {
    name: text(variant.locale, '运行静态验证', 'Run static validation'),
  }).click()
  await expect(adopt).toBeEnabled({ timeout: 30_000 })
  const draftPattern = `**/api/workshop/cards/${workspace.id}/draft`
  let checkpointAttempts = 0
  await page.route(draftPattern, route => {
    checkpointAttempts += 1
    return route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'old source must not block adoption' }),
    })
  })
  await adopt.click()
  await expect(page.locator('.aicw-candidate-section')).toBeHidden()
  await expect(page.locator('.aicw-current-code')).toContainText('CARD_IMPL')
  expect(checkpointAttempts).toBe(0)
  await page.unroute(draftPattern)

  await page.getByRole('button', {
    name: text(variant.locale, '导入手动编辑器', 'Open in manual editor'),
  }).click()
  await expect(editor).toHaveValue(`${validSource}\n`)

  const saved = await loadWorkspace(request, account, workspace.id)
  expect(saved.draft.effectCode).toContain('CARD_IMPL')
  expect(saved.draft).toMatchObject({
    cardId: generatedId,
    cardType: 'minor',
    name: generatedName,
    cardJson: {
      id: generatedId,
      name: generatedName,
      card_type: 'minor',
      desc: ['Generated ability description'],
      cost: { wood: 2 },
      vp: 2,
      locales: {
        zh: {
          name: '生成的能力卡',
          desc: ['生成的能力说明'],
        },
      },
    },
  })
  expect(JSON.stringify(saved.draft.generation)).toContain('openrouter')
  expect((await versions(request, account, workspace.id)).versions).toHaveLength(1)
  await expectAccessibleWorkspace(page)
}

const scenarioReopen = async ({
  page,
  request,
  account,
  variant,
}: ScenarioContext) => {
  const artPrompt = unique('exact private art prompt')
  const abilityPrompt = unique('exact private ability prompt')
  let workspace = await createDraft(request, account)
  workspace = (await adoptArt(request, account, workspace, artPrompt)).workspace
  const ability = await adoptAbility(request, account, workspace, abilityPrompt)
  workspace = ability.workspace
  const englishName = unique('Acceptance card')
  workspace = await checkpoint(request, account, workspace, {
    ...workspace.draft,
    cardJson: {
      ...workspace.draft.cardJson,
      locales: {
        zh: { name: '验收卡', desc: ['验收说明'] },
        en: { name: englishName, desc: ['Acceptance description'] },
      },
      _draft: { prerequisite: '2 occupations', costInput: '1 wood' },
    },
  })

  await openEditor(page, workspace.id)
  await stage(page, variant.locale, '基础信息', 'Card details')
  await page.getByLabel(text(variant.locale, '前置条件', 'Prerequisite')).fill('3 occupations')
  await stage(page, variant.locale, '卡面图', 'Card art')
  await expect(page.getByLabel(
    text(variant.locale, '生成提示词', 'Generation prompt'),
  )).toHaveValue(artPrompt)
  await stage(page, variant.locale, '卡牌能力', 'Card ability')
  await expect(page.locator('.aicw-current-code')).toContainText(
    sourceFor(workspace.draft.cardId, workspace.draft.name),
  )
  await stage(page, variant.locale, '本地化', 'Localization')
  const localizationButton = page.getByRole('button', {
    name: text(variant.locale, '检查本地化', 'Review localization'),
  })
  await localizationButton.focus()
  await page.keyboard.press('Enter')
  const localizationDialog = page.getByRole('dialog', {
    name: text(variant.locale, '本地化', 'Localization'),
  })
  await expect(localizationDialog).toBeVisible()
  await expect(localizationDialog.getByRole('button', {
    name: text(variant.locale, '关闭', 'Close'),
  })).toBeFocused()
  const localizedName = unique('Edited translation')
  const localizedDescription = unique('Edited description')
  await localizationDialog.locator('#localization-target-name').fill(localizedName)
  await localizationDialog.locator('#localization-target-description').fill(localizedDescription)
  const saveLocalization = localizationDialog.getByRole('button', {
    name: text(variant.locale, '保存', 'Save'),
  })
  await saveLocalization.focus()
  await page.keyboard.press('Enter')
  await expect(localizationDialog).toBeHidden()
  await expect(localizationButton).toBeFocused()
  const localizationCheckpoint = page.waitForResponse(response =>
    response.url().endsWith(`/api/workshop/cards/${workspace.id}/draft`)
    && response.request().method() === 'PUT',
  )
  await stage(page, variant.locale, '基础信息', 'Card details')
  expect((await localizationCheckpoint).ok()).toBe(true)
  await expectSaved(page, variant.locale)
  await page.getByLabel(text(variant.locale, '费用', 'Cost')).fill('2 wood')
  const closeCheckpoint = page.waitForResponse(response =>
    response.url().endsWith(`/api/workshop/cards/${workspace.id}/draft`)
    && response.request().method() === 'PUT',
  )
  await page.locator('.aicw-header-actions').getByRole('button', {
    name: text(variant.locale, '关闭', 'Close'),
  }).click()
  expect((await closeCheckpoint).ok()).toBe(true)
  const savedWorkspace = await loadWorkspace(request, account, workspace.id)
  const savedRevision = savedWorkspace.revision
  expect(savedWorkspace.draft.cardJson.locales).toMatchObject({
    zh: {
      name: localizedName,
      desc: [localizedDescription],
    },
  })
  expect(savedWorkspace.draft.cardJson.cost).toEqual({ wood: 2 })

  await openEditor(page, workspace.id)
  await stage(page, variant.locale, '卡面图', 'Card art')
  await expect(page.getByLabel(
    text(variant.locale, '生成提示词', 'Generation prompt'),
  )).toHaveValue(artPrompt)
  await stage(page, variant.locale, '卡牌能力', 'Card ability')
  await expect(page.locator('.aicw-current-code')).toContainText('CARD_IMPL')
  await expect(page.locator('.ai-chat-hint')).toBeVisible()
  expect((await loadWorkspace(request, account, workspace.id)).revision).toBe(savedRevision)
  expect(withDatabase(database => {
    const row = database.prepare(
      'SELECT draft_revision, draft_generation_json FROM workshop_cards WHERE id = ?',
    ).get(workspace.id) as { draft_revision: number; draft_generation_json: string }
    return {
      revision: row.draft_revision,
      generation: row.draft_generation_json,
    }
  })).toEqual(expect.objectContaining({
    revision: savedRevision,
    generation: expect.stringContaining(abilityPrompt),
  }))
  await expectAccessibleWorkspace(page)
}

const scenarioLocalRecovery = async ({
  page,
  request,
  account,
  variant,
}: ScenarioContext) => {
  const workspace = await createDraft(request, account)
  await openEditor(page, workspace.id)
  let saveMode: 'offline' | 'error' | 'online' = 'offline'
  await page.route(`**/api/workshop/cards/${workspace.id}/draft`, route => {
    if (saveMode === 'offline') return route.abort('internetdisconnected')
    if (saveMode === 'error') {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'deterministic save failure' }),
      })
    }
    return route.continue()
  })

  const recoveredName = unique('Recovered')
  await page.getByLabel(text(variant.locale, '英文卡牌名', 'Card name')).fill(recoveredName)
  await stage(page, variant.locale, '卡面图', 'Card art')
  await expect(page.locator('.aicw-stage-rail button[aria-current="step"]')).toContainText(
    text(variant.locale, '卡面图', 'Card art'),
  )
  await expect(page.locator('.aicw-save-state')).toContainText(
    text(variant.locale, '离线', 'Offline'),
  )
  const recoveryKey = `open-agricola-workshop-draft:${workspace.id}`
  expect(await page.evaluate(key => localStorage.getItem(key), recoveryKey)).toContain(recoveredName)
  expect((await loadWorkspace(request, account, workspace.id)).draft.name).toBe(workspace.draft.name)

  await page.reload()
  await expect(page.locator('.aicw-shell')).toBeVisible()
  await expect(page.getByLabel(
    text(variant.locale, '英文卡牌名', 'Card name'),
  )).toHaveValue(recoveredName)
  saveMode = 'error'
  await page.locator('.aicw-header-actions').getByRole('button', {
    name: text(variant.locale, '保存草稿', 'Save draft'),
  }).click()
  await expect(page.locator('.aicw-recovery')).toContainText('deterministic save failure')

  saveMode = 'online'
  await page.getByRole('button', {
    name: text(variant.locale, '重试保存', 'Retry save'),
  }).click()
  await expectSaved(page, variant.locale)
  const saved = await loadWorkspace(request, account, workspace.id)
  expect(saved.revision).toBe(workspace.revision + 1)
  expect(saved.draft.name).toBe(recoveredName)
  expect(await page.evaluate(key => localStorage.getItem(key), recoveryKey)).toBeNull()
  await expectAccessibleWorkspace(page)
}

const scenarioConflict = async ({
  page,
  request,
  account,
  variant,
}: ScenarioContext) => {
  let workspace = await createDraft(request, account)
  await openEditor(page, workspace.id)
  const nameInput = page.getByLabel(text(variant.locale, '英文卡牌名', 'Card name'))

  const serverName = unique('Server')
  workspace = await checkpoint(request, account, workspace, {
    ...workspace.draft,
    name: serverName,
    cardJson: { ...workspace.draft.cardJson, name: serverName },
  })
  await nameInput.fill(unique('Local discarded'))
  await page.locator('.aicw-stage-rail button').filter({
    hasText: text(variant.locale, '卡面图', 'Card art'),
  }).click()
  await expect(page.locator('.aicw-conflict')).toBeVisible()
  await expect(page.locator('.aicw-stage-rail button[aria-current="step"]')).toContainText(
    text(variant.locale, '基础信息', 'Card details'),
  )
  await page.getByRole('button', {
    name: text(variant.locale, '使用服务器草稿', 'Use server draft'),
  }).click()
  await expect(page.locator('.aicw-heading')).toBeFocused()
  await stage(page, variant.locale, '基础信息', 'Card details')
  await expect(nameInput).toHaveValue(serverName)

  const localName = unique('Local kept')
  await nameInput.fill(localName)
  const otherName = unique('Other tab')
  workspace = await checkpoint(request, account, workspace, {
    ...workspace.draft,
    name: otherName,
    cardJson: { ...workspace.draft.cardJson, name: otherName },
  })
  await page.locator('.aicw-stage-rail button').filter({
    hasText: text(variant.locale, '卡面图', 'Card art'),
  }).click()
  await expect(page.locator('.aicw-conflict')).toBeVisible()
  let confirmed = false
  page.once('dialog', dialog => {
    confirmed = true
    void dialog.accept()
  })
  await page.getByRole('button', {
    name: text(variant.locale, '保留本机草稿', 'Keep local draft'),
  }).click()
  await expect.poll(() => confirmed).toBe(true)
  await expect(page.locator('.aicw-heading')).toBeFocused()
  await expectSaved(page, variant.locale)
  const resolved = await loadWorkspace(request, account, workspace.id)
  expect(resolved.revision).toBe(workspace.revision + 1)
  expect(resolved.draft.name).toBe(localName)
  await expectAccessibleWorkspace(page)
}

const scenarioVersionRestore = async ({
  page,
  request,
  account,
  variant,
}: ScenarioContext) => {
  let workspace = await createDraft(request, account)
  const originalName = workspace.draft.name
  const adopted = await adoptArt(request, account, workspace, unique('version prompt'))
  workspace = adopted.workspace
  const editedName = unique('Edited after version')
  workspace = await checkpoint(request, account, workspace, {
    ...workspace.draft,
    name: editedName,
    cardJson: { ...workspace.draft.cardJson, name: editedName },
  })
  const revisionBeforeRestore = workspace.revision

  await openEditor(page, workspace.id)
  await stage(page, variant.locale, '验证与交付', 'Validate & hand off')
  await expect(page.locator('.aicw-version-history ol > li')).toHaveCount(1)
  await page.getByRole('button', {
    name: text(variant.locale, '恢复版本 1', 'Restore version 1'),
  }).click()
  await expect(page.locator('.aicw-heading h2')).toHaveText(originalName)
  await expect(page.locator('.aicw-version-history ol > li')).toHaveCount(1)
  const restored = await loadWorkspace(request, account, workspace.id)
  expect(restored.revision).toBe(revisionBeforeRestore + 1)

  await page.getByRole('button', {
    name: text(variant.locale, '撤销恢复', 'Undo restore'),
  }).click()
  await expect(page.locator('.aicw-heading h2')).toHaveText(editedName)
  await expect(page.locator('.aicw-version-history ol > li')).toHaveCount(1)
  const undone = await loadWorkspace(request, account, workspace.id)
  expect(undone.revision).toBe(revisionBeforeRestore + 2)
  expect(withDatabase(database => (database.prepare(
    'SELECT COUNT(*) AS count FROM workshop_card_versions WHERE card_id = ?',
  ).get(workspace.id) as { count: number }).count)).toBe(1)
  await expectAccessibleWorkspace(page)
}

const scenarioHandoff = async ({
  page,
  request,
  account,
  variant,
}: ScenarioContext) => {
  const locales = { zh: { name: '交接卡', desc: ['交接说明'] } }
  let workspace = await createDraft(request, account, {
    artUrl: imageData,
    locales,
  })
  const invalidValidation = await responseJson<{ valid: boolean }>(await api(
    request,
    account,
    '/api/workshop/cards/validate-code',
    {
      method: 'POST',
      data: { source: sourceFor(workspace.draft.cardId, workspace.draft.name, true) },
    },
  ))
  expect(invalidValidation.valid).toBe(false)
  const validValidation = await responseJson<{ valid: boolean }>(await api(
    request,
    account,
    '/api/workshop/cards/validate-code',
    {
      method: 'POST',
      data: { source: sourceFor(workspace.draft.cardId, workspace.draft.name) },
    },
  ))
  expect(validValidation.valid).toBe(true)
  const adopted = await adoptAbility(
    request,
    account,
    workspace,
    unique('handoff ability prompt'),
  )
  workspace = adopted.workspace
  const published = await responseJson<{ workspace: Workspace; versionId: string }>(
    await api(request, account, `/api/workshop/cards/${workspace.id}/publish`, {
      method: 'POST',
      data: { baseRevision: workspace.revision },
    }),
  )
  workspace = published.workspace

  await responseJson(await api(
    request,
    account,
    `/api/workshop/cards/${workspace.id}/sandbox-pass`,
    {
      method: 'POST',
      data: {
        versionId: published.versionId,
        authorConfirmed: true,
        runtimeErrors: ['deterministic runtime failure'],
      },
    },
  ), 400)

  await openEditor(page, workspace.id)
  await stage(page, variant.locale, '验证与交付', 'Validate & hand off')
  let sandboxLaunchMode: 'failure' | 'warning' | 'real' = 'failure'
  await page.route('**/api/game/new-sandbox', route => {
    if (sandboxLaunchMode === 'failure') {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'deterministic sandbox failure' }),
      })
    }
    if (sandboxLaunchMode === 'warning') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          cardWarnings: ['deterministic sandbox warning'],
          customCardVersionsLoaded: [{
            cardId: workspace.id,
            versionId: published.versionId,
          }],
        }),
      })
    }
    return route.continue()
  })
  const launch = page.getByRole('button', {
    name: text(
      variant.locale,
      '发布当前版本并启动沙盒',
      'Publish current version and start sandbox',
    ),
  })
  page.once('dialog', dialog => dialog.accept())
  await launch.click()
  await expect(page.getByRole('checkbox', {
    name: text(
      variant.locale,
      '我确认这个固定版本在沙盒中没有运行错误',
      'I confirm this pinned version has no sandbox runtime errors',
    ),
  })).toBeHidden()

  sandboxLaunchMode = 'warning'
  await launch.click()
  const sandboxConfirmation = page.getByRole('checkbox', {
    name: text(
      variant.locale,
      '我确认这个固定版本在沙盒中没有运行错误',
      'I confirm this pinned version has no sandbox runtime errors',
    ),
  })
  await expect(sandboxConfirmation).toBeDisabled()
  await stage(page, variant.locale, '卡牌能力', 'Card ability')
  await stage(page, variant.locale, '验证与交付', 'Validate & hand off')
  await expect(sandboxConfirmation).toBeDisabled()

  sandboxLaunchMode = 'real'
  const sandboxResponse = page.waitForResponse(response =>
    response.url().endsWith('/api/game/new-sandbox') && response.ok(),
  )
  await launch.click()
  const sandbox = await (await sandboxResponse).json() as {
    customCardVersionsLoaded: Array<{ cardId: string; versionId: string }>
  }
  expect(sandbox.customCardVersionsLoaded).toEqual([{
    cardId: workspace.id,
    versionId: published.versionId,
  }])
  await expect(sandboxConfirmation).toBeEnabled()
  await sandboxConfirmation.check()
  await page.getByRole('button', {
    name: text(variant.locale, '确认沙盒通过', 'Confirm sandbox pass'),
  }).click()
  await expect(page.locator('.aicw-version-gate')).toContainText(
    text(variant.locale, '已满足社区 PR 交接门槛', 'Community PR gate satisfied'),
  )
  await page.unroute('**/api/game/new-sandbox')
  workspace = await loadWorkspace(request, account, workspace.id)
  const readiness = await responseJson<{ readiness: { ready: boolean } }>(
    await api(request, account, `/api/workshop/cards/${workspace.id}/workspace`),
  )
  expect(readiness.readiness.ready).toBe(true)
  await responseJson(await api(
    request,
    null,
    `/api/workshop/cards/${workspace.id}/submit-review`,
    { method: 'POST', data: {} },
  ), 401)
  await responseJson(await api(
    request,
    account,
    `/api/workshop/cards/${workspace.id}/submit-review`,
    {
      method: 'POST',
      data: {},
      headers: { 'x-workshop-pr-mock-result': 'rate-limited' },
    },
  ), 429)
  await responseJson(await api(
    request,
    account,
    `/api/workshop/cards/${workspace.id}/submit-review`,
    {
      method: 'POST',
      data: {},
      headers: { 'x-workshop-pr-mock-result': 'remote-error' },
    },
  ), 503)
  const proposed = await responseJson<{ prUrl: string; prNumber: number }>(
    await api(request, account, `/api/workshop/cards/${workspace.id}/submit-review`, {
      method: 'POST',
      data: {},
    }),
  )
  expect(proposed).toMatchObject({ prUrl: '/mock-workshop-pr/1', prNumber: 1 })

  await expect(page.locator('.aicw-version-gate')).toContainText(
    text(variant.locale, '已满足社区 PR 交接门槛', 'Community PR gate satisfied'),
  )

  const changedName = unique('Changed after pass')
  workspace = await checkpoint(request, account, workspace, {
    ...workspace.draft,
    name: changedName,
    cardJson: { ...workspace.draft.cardJson, name: changedName },
  })
  const staleReadiness = await responseJson<{ readiness: { ready: boolean } }>(
    await api(request, account, `/api/workshop/cards/${workspace.id}/workspace`),
  )
  expect(staleReadiness.readiness.ready).toBe(false)
  await responseJson(await api(
    request,
    account,
    `/api/workshop/cards/${workspace.id}/submit-review`,
    { method: 'POST', data: {} },
  ), 400)
  await page.reload()
  await page.getByRole('button', {
    name: text(variant.locale, '使用服务器草稿', 'Use server draft'),
  }).click()
  await stage(page, variant.locale, '验证与交付', 'Validate & hand off')
  await expect(page.locator('.aicw-version-gate')).toContainText(
    text(variant.locale, '尚未确认', 'Not confirmed'),
  )
  await expectAccessibleWorkspace(page)
}

const scenarioPrivacy = async ({
  page,
  request,
  account,
  variant,
}: ScenarioContext) => {
  const privatePrompt = unique('secret prompt')
  const privateAbilityPrompt = unique('secret ability')
  const privateModel = unique('secret-model')
  const locales = { zh: { name: '隐私卡', desc: ['公开说明'] } }
  let workspace = await createDraft(request, account, {
    artUrl: imageData,
    locales,
  })
  const art = await responseJson<{ workspace: Workspace }>(await api(
    request,
    account,
    `/api/workshop/cards/${workspace.id}/adopt`,
    {
      method: 'POST',
      data: {
        baseRevision: workspace.revision,
        candidate: {
          id: unique('privacy-art'),
          kind: 'art',
          prompt: privatePrompt,
          resultUrl: imageData,
          provider: 'private-provider',
          model: privateModel,
          createdAt: Date.now(),
        },
      },
    },
  ))
  workspace = art.workspace
  workspace = (await adoptAbility(
    request,
    account,
    workspace,
    privateAbilityPrompt,
  )).workspace
  workspace = (await responseJson<{ workspace: Workspace }>(await api(
    request,
    account,
    `/api/workshop/cards/${workspace.id}/publish`,
    { method: 'POST', data: { baseRevision: workspace.revision } },
  ))).workspace

  const ownerPayload = await responseJson<{ workspace: Workspace }>(
    await api(request, account, `/api/workshop/cards/${workspace.id}/workspace`),
  )
  expect(JSON.stringify(ownerPayload)).toContain(privatePrompt)
  expect(JSON.stringify(ownerPayload)).toContain(privateModel)
  const other = await createAccount(request)
  await responseJson(
    await api(request, other, `/api/workshop/cards/${workspace.id}/workspace`),
    403,
  )
  await responseJson(
    await api(request, other, `/api/workshop/cards/${workspace.id}/versions`),
    403,
  )
  await responseJson(
    await api(request, null, `/api/workshop/cards/${workspace.id}/workspace`),
    401,
  )
  const publicDetail = await responseJson<Record<string, unknown>>(
    await api(request, null, `/api/workshop/cards/${workspace.id}`),
  )
  const publicText = JSON.stringify(publicDetail)
  expect(publicText).not.toContain(privatePrompt)
  expect(publicText).not.toContain(privateAbilityPrompt)
  expect(publicText).not.toContain(privateModel)
  expect(publicText).not.toContain('e2e-fake-key')
  const publicList = await responseJson<Record<string, unknown>>(
    await api(request, null, `/api/workshop/cards?search=${encodeURIComponent(workspace.draft.cardId)}`),
  )
  expect(JSON.stringify(publicList)).not.toContain(privatePrompt)
  expect(withDatabase(database => {
    const generation = (database.prepare(
      'SELECT draft_generation_json FROM workshop_cards WHERE id = ?',
    ).get(workspace.id) as { draft_generation_json: string }).draft_generation_json
    return {
      hasPrompt: generation.includes(privatePrompt),
      hasModel: generation.includes(privateModel),
      hasKey: generation.includes('e2e-fake-key'),
    }
  })).toEqual({ hasPrompt: true, hasModel: true, hasKey: false })

  await openEditor(page, workspace.id)
  await stage(page, variant.locale, '卡面图', 'Card art')
  await expect(page.getByLabel(
    text(variant.locale, '生成提示词', 'Generation prompt'),
  )).toHaveValue(privatePrompt)
  await expectAccessibleWorkspace(page)
}

const scenarioErrors = async ({
  page,
  request,
  account,
  variant,
}: ScenarioContext) => {
  const workspace = await createDraft(request, account)
  let releaseWorkspaceLoad: (() => void) | undefined
  const workspaceLoadBlocked = new Promise<void>(resolve => {
    releaseWorkspaceLoad = resolve
  })
  await page.route(`**/api/workshop/cards/${workspace.id}/workspace`, async route => {
    await workspaceLoadBlocked
    await route.continue()
  })
  await page.goto(
    `${FRONTEND_URL}/?page=workshop&view=editor&card=${encodeURIComponent(workspace.id)}`,
  )
  await expect(page.locator('.aicw-loading')).toBeVisible()
  releaseWorkspaceLoad?.()
  await expect(page.locator('.aicw-loading')).toBeHidden({ timeout: 30_000 })

  await fakeChatService(page, call =>
    call === 0
      ? ''
      : `\`\`\`typescript\n${sourceFor(workspace.draft.cardId, workspace.draft.name)}\n\`\`\``,
  )
  await stage(page, variant.locale, '卡牌能力', 'Card ability')
  const input = page.getByPlaceholder(
    text(variant.locale, '描述你想要的卡牌效果…', 'Describe the card effect…'),
  )
  await input.fill('Return no result')
  await page.getByRole('button', {
    name: text(variant.locale, '生成能力候选', 'Generate ability candidate'),
  }).click()
  await expect(page.locator('.aicw-panel-error')).toBeVisible()
  await expect(page.locator('.aicw-panel-error')).toBeFocused()

  let validationFailed = true
  await page.route('**/api/workshop/cards/validate-code', route => {
    if (validationFailed) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'deterministic validator failure' }),
      })
    }
    return route.continue()
  })
  await page.getByRole('button', { name: text(variant.locale, '重发', 'Resend') }).click()
  await expect(page.locator('.aicw-candidate-section')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.aicw-validation-errors')).toContainText(
    'deterministic validator failure',
  )
  validationFailed = false
  await page.getByRole('button', {
    name: text(variant.locale, '运行静态验证', 'Run static validation'),
  }).click()
  await expect(page.getByRole('button', {
    name: text(variant.locale, '采用为当前源码', 'Adopt as current source'),
  })).toBeEnabled({ timeout: 30_000 })

  let saveFailed = true
  await page.route(`**/api/workshop/cards/${workspace.id}/draft`, route => {
    if (saveFailed) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'deterministic checkpoint failure' }),
      })
    }
    return route.continue()
  })
  await stage(page, variant.locale, '基础信息', 'Card details')
  const retainedName = unique('Retained')
  await page.getByLabel(text(variant.locale, '英文卡牌名', 'Card name')).fill(retainedName)
  await stage(page, variant.locale, '验证与交付', 'Validate & hand off')
  await expect(page.locator('.aicw-recovery')).toContainText('deterministic checkpoint failure')
  await expect(page.locator('.aicw-recovery')).toBeFocused()
  await stage(page, variant.locale, '基础信息', 'Card details')
  await expect(page.getByLabel(
    text(variant.locale, '英文卡牌名', 'Card name'),
  )).toHaveValue(retainedName)
  saveFailed = false
  await page.getByRole('button', {
    name: text(variant.locale, '重试保存', 'Retry save'),
  }).click()
  await expectSaved(page, variant.locale)

  let versionsFailed = true
  await page.route(`**/api/workshop/cards/${workspace.id}/versions`, route => {
    if (versionsFailed) {
      versionsFailed = false
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'deterministic versions failure' }),
      })
    }
    return route.continue()
  })
  await stage(page, variant.locale, '验证与交付', 'Validate & hand off')
  await expect(page.locator('.aicw-version-message.is-error')).toContainText(
    'deterministic versions failure',
  )
  await page.locator('.aicw-version-message').getByRole('button', {
    name: text(variant.locale, '重试', 'Retry'),
  }).click()
  await expect(page.locator('.aicw-version-message')).toContainText(
    text(
      variant.locale,
      '采用候选或发布后，版本会出现在这里。',
      'Versions appear here after adopting a candidate or publishing.',
    ),
  )
  await expectAccessibleWorkspace(page)
}

const scenarios: Array<{
  title: string
  run: (context: ScenarioContext) => Promise<void>
  llm?: boolean
}> = [
  { title: '01 new draft and empty state', run: scenarioNewDraft },
  { title: '02 art candidate generation and adoption', run: scenarioArtCandidates, llm: true },
  { title: '03 ability candidates validation and adoption', run: scenarioAbilityCandidates, llm: true },
  { title: '04 metadata localization save and reopen', run: scenarioReopen, llm: true },
  { title: '05 offline failure and local recovery', run: scenarioLocalRecovery },
  { title: '06 revision conflict choices', run: scenarioConflict },
  { title: '07 immutable versions restore and undo', run: scenarioVersionRestore },
  { title: '08 validation sandbox and PR handoff', run: scenarioHandoff },
  { title: '09 author privacy and public projection', run: scenarioPrivacy, llm: true },
  { title: '10 loading errors and retry', run: scenarioErrors, llm: true },
]

test.describe('AI card workspace acceptance matrix', () => {
  for (const scenario of scenarios) {
    for (const variant of variants) {
      test(`${scenario.title} [${variant.locale}/${variant.viewport}]`, async ({
        page,
        request,
      }) => {
        await setupPage(page, variant, { llm: scenario.llm })
        const account = await createAccount(request, page)
        const pageErrors: string[] = []
        page.on('pageerror', error => pageErrors.push(error.message))
        await scenario.run({ page, request, account, variant })
        expect(pageErrors).toEqual([])
      })
    }
  }
})
