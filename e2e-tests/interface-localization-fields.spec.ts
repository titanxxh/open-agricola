import { expect, test, type APIResponse, type Page, type APIRequestContext } from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL, finishHotseatOpening, getJson, postJson } from './fixtures'

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

test('WebSocket default names remain localized through development joins and reload', async ({ page, browser }) => {
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await page.goto(`${FRONTEND_URL}/?page=game&transport=ws&room=dev2&player=p1&devMode=1`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.game-layout')).toBeVisible()
  const initialRoomId = new URL(page.url()).searchParams.get('room')
  await page.locator('.seed-input input').fill('42')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect.poll(() => new URL(page.url()).searchParams.get('room')).not.toBe(initialRoomId)
  const guestContext = await browser.newContext()
  try {
    await guestContext.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    const guest = await guestContext.newPage()
    await guest.goto(`${FRONTEND_URL}/?page=game&transport=ws&room=dev2&player=p2&devMode=1`, { waitUntil: 'domcontentloaded' })
    for (const connected of [page, guest]) {
      const game = connected.locator('.game-layout')
      await expect(game).toBeVisible()
      await expect(game).toContainText('Player 1')
      await expect(game).toContainText('Player 2')
    }
    await expect(guest.locator('.waiting-turn')).toHaveText('Waiting for Player 1 to act')
    await expect(guest.locator('.waiting-turn')).toHaveCSS('background-color', 'rgb(255, 0, 0)')
    await expect(guest.locator('.waiting-turn')).toHaveCSS('color', 'rgb(255, 255, 255)')
    await guest.reload({ waitUntil: 'domcontentloaded' })
    await expect(guest.locator('.waiting-turn')).toHaveText('Waiting for Player 1 to act')
  } finally {
    await guestContext.close()
  }
})

for (const displayName of ['录制玩家', 'PlayerF', 'Player 6']) {
  test(`authenticated six-player hotseat preserves ${displayName} and localizes generated names`, async ({ page, request }) => {
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    await signIn(page, request, displayName)
    await page.goto(`${FRONTEND_URL}/?page=lobby`)
    await page.getByRole('button', { name: 'Local Hotseat', exact: true }).click()
    await page.getByRole('button', { name: '6 Players', exact: true }).click()
    for (const name of ['Enable Parent Cards expansion', 'Enable Through the Seasons expansion', 'Enable Farmers of the Moor expansion', 'Allow an incomplete Farmers of the Moor minor improvement pool']) {
      await page.getByRole('checkbox', { name, exact: true }).check()
    }
    await page.getByRole('button', { name: 'Start Hotseat Game', exact: true }).click()
    const handoff = page.getByRole('dialog', { name: 'Hotseat handoff' })
    for (let index = 0; index < 6; index++) {
      await expect(handoff).toBeVisible()
      await expect(handoff).toContainText(index === 0 ? displayName : `Player ${index + 1}`)
      await handoff.getByRole('button', { name: /continue$|，开始$/ }).click()
      const selection = page.locator('.parent-selection-overlay')
      await expect(selection).toBeVisible()
      await selection.locator('[data-section="mother"] .parent-choice-card').first().click()
      await selection.locator('[data-section="father"] .parent-choice-card').first().click()
      await selection.getByRole('button', { name: 'Confirm parents', exact: true }).click()
    }
    await finishHotseatOpening(page)
    const tabs = page.locator('.player-tabs__tab')
    await expect(tabs).toHaveCount(6)
    await expect(tabs.first()).toContainText(displayName)
    for (let index = 1; index < 6; index++) await expect(tabs.nth(index)).toContainText(`Player ${index + 1}`)
    await page.locator('.game-layout__right').getByRole('button', { name: 'Scoring Pad', exact: true }).click()
    await expect(page.locator('.scoring-pad .scoring-player-name').last()).toHaveText('Player 6')
    await page.locator('.scoring-pad').getByRole('button', { name: 'Close', exact: true }).click()
    await page.locator('.action-card-holder[data-action-id="forest"]').click()
    await page.getByRole('button', { name: 'Confirm switch', exact: true }).click()
    await expect(handoff).toContainText('Player 2')
  })
}

for (const { label, desc, expected } of [
  { label: 'complete locale', desc: ['建造房间时，费用减少 2 木材。'], expected: 'English locale description.' },
  { label: 'partial locale', desc: [], expected: 'When you build a room, the cost is reduced by 2 wood.' },
]) {
  test(`workshop ${label} preview and actual sandbox preserve visible card text and localized default names`, async ({ page, request }, testInfo) => {
    const invalidCardArtRequests: string[] = []
    page.on('request', observed => {
      const path = new URL(observed.url()).pathname
      if (/\/assets\/(?:revised|moor|player56)\/(?:[^/]+\/)*(?:O\d+|CUSTOM_[^/]+)\.(?:png|webp|jpe?g|svg)$/i.test(path)) {
        invalidCardArtRequests.push(observed.url())
      }
    })
    await page.addInitScript(() => {
      localStorage.setItem('open-agricola-locale-v2', 'en')
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
          rules: ['Source supplemental ruling.'],
          locales: { zh: { name: '中世纪木槌', desc,
            rules: label === 'complete locale' ? ['中文补充规则。'] : [], prerequisite: '1 张职业' },
          en: { name: 'Medieval Mallet', desc: label === 'complete locale' ? ['English locale description.'] : [],
            prerequisite: '1 occupation', rules: label === 'complete locale' ? ['English supplemental ruling.'] : [] } },
        },
      },
    })
    expect(created.ok(), await created.text()).toBe(true)
    const card = await created.json()
    await page.goto(`${FRONTEND_URL}/?page=workshop&view=editor&card=${card.id}`)
    const preview = page.locator('.aicw-preview-pane .player-card')
    await expect(preview.locator('.card-title')).toHaveText('Medieval Mallet')
    await expect(preview.locator('.card-desc')).toContainText(label === 'complete locale' ? 'English locale description.' : expected)
    await expect(preview).toContainText('1 occupation')
    await expect(preview.locator('.card-rules')).toContainText(
      label === 'complete locale' ? 'English supplemental ruling.' : 'Source supplemental ruling.',
    )
    if (label === 'complete locale') await expect(preview).not.toContainText('When you build a room')
    await expect(preview.locator('.card-icon')).toHaveCSS('background-image', 'none')
    expect(invalidCardArtRequests).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('workshop-without-card-art.png'), fullPage: false })
    await page.locator('.aicw-stage-rail button').filter({ hasText: 'Localization' }).click()
    await page.getByRole('button', { name: label === 'complete locale' ? 'Review localization' : 'Start localization', exact: true }).click()
    const localization = page.getByRole('dialog', { name: 'Localization', exact: true })
    await localization.locator('#localization-target-name').fill('编辑后的中世纪木槌')
    await localization.locator('#localization-target-description').fill('人工编辑的中文描述。')
    await localization.getByRole('button', { name: 'Save', exact: true }).click()
    await page.locator('.aicw-stage-rail button').filter({ hasText: 'Card details' }).click()
    await expect.poll(async () => {
      const response = await request.get(`${BACKEND_URL}/api/workshop/cards/${card.id}/workspace`, {
        headers: { Cookie: `oa_session=${cookie}` },
      })
      return (await response.json()).workspace.draft.cardJson.locales
    }).toMatchObject({
      zh: { name: '编辑后的中世纪木槌', rules: label === 'complete locale' ? ['中文补充规则。'] : [] },
      en: { rules: label === 'complete locale' ? ['English supplemental ruling.'] : [] },
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(preview.locator('.card-title')).toHaveText('Medieval Mallet')
    await expect(preview.locator('.card-rules')).toContainText(
      label === 'complete locale' ? 'English supplemental ruling.' : 'Source supplemental ruling.',
    )
    await page.goto(`${FRONTEND_URL}/?page=workshop&view=sandbox`)
    await page.locator('.ws-sandbox').getByRole('button', { name: 'Start Sandbox', exact: true }).click()
    const game = page.frameLocator('.sandbox-embed-frame')
    await expect(game.locator('.game-layout')).toBeVisible({ timeout: 30_000 })
    await expect(game.locator('.player-tabs__tab').first()).toContainText('Player 1')
    await expect(game.locator('.player-tabs__tab').nth(1)).toContainText('Player 2')
    await expect(game.getByRole('button', { name: 'Set Round Number', exact: true })).toBeVisible()
    await expect(game.locator('.dev-panel')).toContainText('Only changes the round number. Workers stay placed; accumulated resources and harvests are not advanced.')
    expect(invalidCardArtRequests).toEqual([])
  })
}

for (const translated of [
  { rules: ['只有补充规则译文。'], prerequisite: '' },
  { rules: [], prerequisite: '1 张职业' },
]) {
  test(`manual localization preserves an independent translated field: ${JSON.stringify(translated)}`, async ({ page, request }) => {
    await page.addInitScript(() => {
      localStorage.setItem('open-agricola-locale-v2', 'en')
      localStorage.removeItem('open-agricola-llm-config')
    })
    const cookie = await signIn(page, request)
    const cardId = `CUSTOM_IndependentLocale_${Date.now()}`
    const created = await request.post(`${BACKEND_URL}/api/workshop/cards`, {
      headers: { Cookie: `oa_session=${cookie}` },
      data: { card_id: cardId, card_type: 'minor', name: 'Independent locale', description: '', status: 'draft',
        card_json: { id: cardId, name: 'Independent locale', card_type: 'minor', deck: 'CUSTOM', number: 0,
          desc: ['Source description.'], rules: ['Source ruling.'], cost: {},
          locales: { zh: { name: '', desc: [], ...translated } } } },
    })
    expect(created.ok(), await created.text()).toBe(true)
    const card = await created.json()
    await page.goto(`${FRONTEND_URL}/?page=workshop&view=editor&card=${card.id}`, { waitUntil: 'domcontentloaded' })
    await page.locator('.aicw-stage-rail button').filter({ hasText: 'Localization' }).click()
    await page.getByRole('button', { name: 'Start localization', exact: true }).click()
    await page.getByRole('dialog', { name: 'Localization', exact: true }).getByRole('button', { name: 'Save', exact: true }).click()
    await page.locator('.aicw-stage-rail button').filter({ hasText: 'Card details' }).click()
    await expect.poll(async () => {
      const response = await request.get(`${BACKEND_URL}/api/workshop/cards/${card.id}/workspace`, {
        headers: { Cookie: `oa_session=${cookie}` },
      })
      return (await response.json()).workspace.draft.cardJson.locales.zh
    }).toMatchObject({ name: '', desc: [], rules: translated.rules })
    await page.reload({ waitUntil: 'domcontentloaded' })
    const preview = page.locator('.aicw-preview-pane .player-card')
    await expect(preview.locator('.card-desc')).toContainText('Source description.')
    await page.locator('.aicw-stage-rail button').filter({ hasText: 'Localization' }).click()
    await page.getByRole('button', { name: 'Start localization', exact: true }).click()
    await expect(page.locator('#localization-target-prerequisite')).toHaveValue(translated.prerequisite)
  })
}

for (const locale of ['en'] as const) {
  test(`${locale} localizes action templates and tooltips and describes round editing accurately`, async ({ page, request }) => {
    await page.addInitScript((value) => localStorage.setItem('open-agricola-locale-v2', value), locale)
    await postJson(request, `${BACKEND_URL}/api/game/new`, { seed: 936, maxPlayers: 6, enableSnakeOpening: true })
    await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
    await page.locator('.header-snake-pill').hover()
    const opening = page.locator('.header-snake-popover')
    await expect(opening).toContainText('Player 1 → Player 2')

    const panel = page.locator('.dev-panel')
    await panel.locator('.dev-field', { hasText: 'Target Round' })
      .getByRole('spinbutton').fill('14')
    await panel.getByRole('button', { name: 'Set Round Number', exact: true }).click()
    await expect.poll(async () => (await getJson(request, `${BACKEND_URL}/api/game/state`)).state.round).toBe(14)
    const supply = page.locator('.action-card-holder[data-action-id="farm-supplies-6"]')
    await expect(supply.locator('[data-flow-operator="or"]')).toHaveCount(1)
    await expect(supply.locator('[data-resource-mode="payment"] [data-resource="food"][data-amount="1"]')).toHaveCount(2)
    await expect(supply.getByRole('img', { name: '1 Grain', exact: true })).toBeVisible()
    await supply.hover()
    const tooltip = page.locator('.round-action-tooltip')
    await expect(tooltip.locator('.tooltip-text')).toContainText('Choose one or more')
    const improvement = page.locator('.action-card-holder[data-action-id="improvement-6"]')
    await expect(improvement.locator('.action-desc .res-icon-minor')).toHaveCount(2)
    await expect(improvement.locator('.action-desc .res-icon-major')).toHaveCount(1)
    await improvement.hover()
    await expect(tooltip.locator('.tooltip-text [data-round-start="1"][data-round-end="4"]')).toContainText('minor')
    await expect(tooltip.locator('.tooltip-text [data-round-start="5"]')).toContainText('major / minor')
    await page.locator('.action-card-holder[data-action-id="farm-redevelopment"]').hover()
    await expect(tooltip).toContainText('Renovate House')
    const sequence = tooltip.locator('.tooltip-text [data-flow-operator="sequence"]').first()
    const steps = sequence.locator(':scope > .interaction-description-part')
    await expect(steps).toHaveCount(2)
    await expect(steps.nth(0)).toContainText('Renovate House')
    await expect(steps.nth(1)).toContainText('Fencing')

    await page.screenshot({ path: `output/playwright/issue936-action-board-${locale}.png` })
  })
}
