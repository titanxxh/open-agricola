import { expect, test, type APIResponse, type Page, type APIRequestContext } from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL, getJson, postJson } from './fixtures'

const cookieValue = (response: APIResponse, name: string): string => {
  const header = response.headersArray().find((header) =>
    header.name.toLowerCase() === 'set-cookie' && header.value.startsWith(`${name}=`),
  )
  if (!header) throw new Error(`Missing ${name} cookie`)
  return header.value.split(';')[0]!.slice(name.length + 1)
}

const signIn = async (page: Page, request: APIRequestContext, displayName = '录制玩家') => {
  const username = `issue936_${Date.now()}`
  const password = 'issue936-test-password'
  const oauth = await request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, {
    data: { providerUserId: username, providerLogin: username, email: `${username}@example.com`, displayName },
  })
  expect(oauth.ok()).toBe(true)
  const complete = await request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
    data: { username, displayName, password, confirmPassword: password },
    headers: { Cookie: `oa_onboarding=${cookieValue(oauth, 'oa_onboarding')}` },
  })
  expect(complete.ok(), await complete.text()).toBe(true)
  const cookie = cookieValue(complete, 'oa_session')
  await page.context().addCookies([{ name: 'oa_session', value: cookie, url: FRONTEND_URL }])
  return cookie
}

for (const displayName of ['录制玩家', 'PlayerF']) {
  test(`authenticated six-player hotseat preserves ${displayName} and localizes generated names`, async ({ page, request }) => {
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'zh'))
    await signIn(page, request, displayName)
    await page.goto(`${FRONTEND_URL}/?page=lobby`)
    await page.getByRole('button', { name: '本地热座', exact: true }).click()
    await page.getByRole('button', { name: '6 人', exact: true }).click()
    for (const name of ['启用父母卡扩展', '启用四季扩展', '启用沼泽农夫扩展', '允许沼泽农夫小改良池不完整']) {
      await page.getByRole('checkbox', { name, exact: true }).check()
    }
    await page.getByRole('button', { name: '开始热座对局', exact: true }).click()
    const handoff = page.getByRole('dialog', { name: 'Hotseat handoff' })
    for (let index = 0; index < 6; index++) {
      await expect(handoff).toBeVisible()
      await expect(handoff).toContainText(index === 0 ? displayName : `玩家 ${index + 1}`)
      if (index > 0) await expect(handoff).not.toContainText(/(?:Player|player)(?: [1-6]|[A-F])/)
      await handoff.getByRole('button').click()
      const selection = page.locator('.parent-selection-overlay')
      await expect(selection).toBeVisible()
      await selection.locator('[data-section="mother"] .parent-choice-card').first().click()
      await selection.locator('[data-section="father"] .parent-choice-card').first().click()
      await selection.getByRole('button', { name: '确认父母卡', exact: true }).click()
    }
    await expect(handoff).toBeVisible()
    await handoff.getByRole('button').click()
    const tabs = page.locator('.player-tabs__tab')
    await expect(tabs).toHaveCount(6)
    await expect(tabs.first()).toContainText(displayName)
    for (let index = 1; index < 6; index++) await expect(tabs.nth(index)).toContainText(`玩家 ${index + 1}`)
    if (displayName === '录制玩家') await expect(page.locator('.game-layout')).not.toContainText(/(?:Player|player)(?: [1-6]|[A-F])/)
    await page.getByRole('button', { name: '计分板', exact: true }).click()
    await expect(page.locator('.scoring-pad .scoring-player-name').last()).toHaveText('玩家 6')
    await page.locator('.scoring-pad').getByRole('button', { name: '关闭', exact: true }).click()
    await page.locator('.action-card-holder[data-action-id="forest"]').click()
    await page.getByRole('button', { name: '确认切换', exact: true }).click()
    await expect(handoff).toContainText('玩家 2')
  })
}

for (const { label, desc, expected } of [
  { label: 'complete locale', desc: ['建造房间时，费用减少 2 木材。'], expected: '建造房间时，费用减少 2 木材。' },
  { label: 'partial locale', desc: [], expected: 'When you build a room, the cost is reduced by 2 wood.' },
]) {
  test(`workshop ${label} preview and actual sandbox preserve visible card text and localized default names`, async ({ page, request }) => {
    await page.addInitScript(() => {
      localStorage.setItem('open-agricola-locale-v2', 'zh')
      const url = new URL(location.href)
      if (url.searchParams.get('localSandbox') === '1') {
        // Match production auth: keep the signed-in account instead of the
        // development-only p1 shortcut, which would change the stash owner.
        url.searchParams.delete('player')
        history.replaceState(null, '', url)
      }
    })
    const cookie = await signIn(page, request)
    const cardId = `CUSTOM_Issue936_${Date.now()}`
    const created = await request.post(`${BACKEND_URL}/api/workshop/cards`, {
      headers: { Cookie: `oa_session=${cookie}` },
      data: {
        card_id: cardId, card_type: 'minor', name: 'Medieval Mallet', description: '', status: 'draft',
        card_json: {
          id: cardId, name: 'Medieval Mallet', card_type: 'minor', deck: 'CUSTOM', number: 0,
          desc: ['When you build a room, the cost is reduced by 2 wood.'], cost: {}, vp: 0,
          locales: { zh: { name: '中世纪木槌', desc, prerequisite: '1 张职业' } },
        },
      },
    })
    expect(created.ok(), await created.text()).toBe(true)
    const card = await created.json()
    await page.goto(`${FRONTEND_URL}/?page=workshop&view=editor&card=${card.id}`)
    const preview = page.locator('.aicw-preview-pane .player-card')
    await expect(preview.locator('.card-title')).toHaveText('中世纪木槌')
    await expect(preview.locator('.card-desc')).toContainText(expected)
    await expect(preview).toContainText('1 张职业')
    if (label === 'complete locale') await expect(preview).not.toContainText('When you build a room')
    await page.goto(`${FRONTEND_URL}/?page=workshop&view=sandbox`)
    await page.locator('.ws-sandbox').getByRole('button', { name: '开始沙盒测试', exact: true }).click()
    const game = page.frameLocator('.sandbox-embed-frame')
    await expect(game.locator('.game-layout')).toBeVisible()
    await expect(game.locator('.player-tabs__tab').first()).toContainText('玩家 1')
    await expect(game.locator('.player-tabs__tab').nth(1)).toContainText('玩家 2')
    await expect(game.locator('.game-layout')).not.toContainText(/(?:Player|player)(?: [1-6]|[A-F])/)
    await expect(game.getByRole('button', { name: '设置回合号', exact: true })).toBeVisible()
    await expect(game.locator('.dev-panel')).toContainText('仅修改回合号，不收回工人、不补充累积资源、不执行收获。')
  })
}

for (const locale of ['zh', 'en'] as const) {
  test(`${locale} localizes action templates and tooltips and describes round editing accurately`, async ({ page, request }) => {
    await page.addInitScript((value) => localStorage.setItem('open-agricola-locale-v2', value), locale)
    await postJson(request, `${BACKEND_URL}/api/game/new`, { seed: 936, maxPlayers: 6 })
    await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
    const panel = page.locator('.dev-panel')
    await panel.locator('.dev-field', { hasText: locale === 'zh' ? '目标回合' : 'Target Round' })
      .getByRole('spinbutton').fill('14')
    await panel.getByRole('button', { name: locale === 'zh' ? '设置回合号' : 'Set Round Number', exact: true }).click()
    await expect.poll(async () => (await getJson(request, `${BACKEND_URL}/api/game/state`)).state.round).toBe(14)
    const supply = page.locator('.action-card-holder[data-action-id="farm-supplies-6"]')
    await expect(supply).toContainText(locale === 'zh' ? '支付' : 'Pay')
    await expect(supply).toContainText(locale === 'zh' ? '和／或' : 'and/or')
    const improvement = page.locator('.action-card-holder[data-action-id="improvement-6"]')
    await expect(improvement).toContainText(locale === 'zh' ? '第 1–4 回合' : 'R1-4')
    await expect(improvement).toContainText(locale === 'zh' ? '第 5 回合起' : 'R5+')
    await page.locator('.action-card-holder[data-action-id="farm-redevelopment"]').hover()
    const tooltip = page.locator('.round-action-tooltip')
    await expect(tooltip).toContainText(locale === 'zh' ? '翻修' : 'Renovation')
    await expect(tooltip).toContainText(locale === 'zh' ? '建造栅栏' : 'Build fences')
    await expect(tooltip).toContainText(locale === 'zh' ? '必须先翻修，才能建造栅栏。' : 'You can only build fences if you renovate first.')
    if (locale === 'zh') await expect(tooltip).not.toContainText(/Renovation|Build fences|You can|actionBoard\./)
    await page.screenshot({ path: `output/playwright/issue936-action-board-${locale}.png` })
  })
}
