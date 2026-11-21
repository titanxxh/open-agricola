// @covers client/contexts/
import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { BACKEND_URL, FRONTEND_URL, getJson, postJson } from './fixtures'

test('discovers a new JSON-only language and downloads just that language', async ({ page, request }) => {
  const list = await (await request.get(`${FRONTEND_URL}/i18n/manifest.json`)).json()
  const english = list.languages.find((language: { id: string }) => language.id === 'en')
  const read = async (file: string) => (await request.get(`${FRONTEND_URL}/i18n/${file}`)).json()
  const part = (stem: string, base: { messages: Record<string, string> }, messages: Record<string, string>) => {
    const raw = JSON.stringify({ ...base, locale: 'fr', messages: { ...base.messages, ...messages } })
    const sha256 = createHash('sha256').update(raw).digest('hex')
    return { raw, file: `${stem}.${sha256.slice(0, 16)}.json`, sha256 }
  }
  const core = part('fr', await read(english.core.file), { 'ui.languageSelectLabel': 'Choisir la langue' })
  const cards = part('fr-cards', await read(english.cards.file), { 'cardFaces.C112_Thresher.name': 'Batteur' })
  await page.route('**/i18n/manifest.json', route => route.fulfill({ json: {
    ...list, languages: [...list.languages, {
      id: 'fr', name: 'Français', core: { file: core.file, sha256: core.sha256 }, cards: { file: cards.file, sha256: cards.sha256 },
      sourceSha256: core.sha256,
    }],
  } }))
  for (const { file, raw } of [core, cards]) {
    await page.route(`**/i18n/${file}`, route => route.fulfill({ body: raw, contentType: 'application/json' }))
  }
  const downloads: string[] = []
  page.on('request', request => {
    if (/\/i18n\/(?!manifest)[^/]+\.json$/.test(request.url())) downloads.push(request.url())
  })
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'fr'))
  await postJson(request, `${BACKEND_URL}/api/game/new`, { seed: 7, maxPlayers: 2 })
  const { state } = await getJson(request, `${BACKEND_URL}/api/game/state`)
  state.phase = 'playing'
  state.currentPlayerIndex = 0
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  state.players[0].occupationPlayed = ['C112_Thresher']
  await postJson(request, `${BACKEND_URL}/api/game/load`, { state })
  await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
  await expect(page.locator('[data-id="C112_Thresher"] .card-title').first()).toHaveText('Batteur')
  const switcher = page.getByRole('button', { name: 'Choisir la langue' })
  await expect(switcher).toContainText('Français')
  expect(downloads.sort()).toEqual([`${FRONTEND_URL}/i18n/${core.file}`, `${FRONTEND_URL}/i18n/${cards.file}`].sort())
})

for (const locale of ['en'] as const) {
  test(`${locale} shows the Thresher face, resource icons and before-action source`, async ({ page, request }) => {
    await page.addInitScript((value) => localStorage.setItem('open-agricola-locale-v2', value), locale)
    await postJson(request, `${BACKEND_URL}/api/game/new`, { seed: 7, maxPlayers: 2 })
    const { state } = await getJson(request, `${BACKEND_URL}/api/game/state`)
    state.phase = 'playing'
    state.currentPlayerIndex = 0
    state.round = 8
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    state.players[0].occupationPlayed = ['C112_Thresher']
    Object.assign(state.players[0].resources, { food: 1, grain: 0 })
    expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
    await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
    const name = 'Thresher'
    const card = page.locator('[data-id="C112_Thresher"]').first()
    await expect(card.locator('.card-title')).toHaveText(name)
    await expect(card.locator('.card-desc')).toContainText('Farmland')
    await expect(card.locator('.card-desc .res-icon-food')).toHaveCount(1)
    await expect(card.locator('.card-desc .res-icon-grain')).toHaveCount(1)
    await page.locator('.action-card-holder[data-action-id="farmland"]').click()
    await expect(page.locator('.interaction-bar').getByRole('button', {
      name: 'Do not use Thresher', exact: true,
    })).toBeVisible()
    await expect(page.locator('.interaction-bar')).toContainText('Triggered by Thresher')
    await expect(page.locator('.interaction-bar')).not.toContainText('脱粒机')
    await page.screenshot({ path: `output/playwright/bga-thresher-${locale}.png` })
  })

  test(`${locale} uses one Hammer Crusher name in its face, prompt, trigger, and log`, async ({ page, request }) => {
    await page.addInitScript((value) => localStorage.setItem('open-agricola-locale-v2', value), locale)
    await postJson(request, `${BACKEND_URL}/api/game/new`, { seed: 7, maxPlayers: 2 })
    const { state } = await getJson(request, `${BACKEND_URL}/api/game/state`)
    state.phase = 'playing'
    state.currentPlayerIndex = 0
    // House Redevelopment is revealed in rounds 5–7, so it is clickable by round 8.
    state.round = 8
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    const actor = state.players[0]
    actor.houseType = 'clay'
    actor.rooms = 2
    actor.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
    Object.assign(actor.resources, { clay: 3, reed: 1, stone: 2 })
    actor.minorPlayed = ['D014_HammerCrusher']
    expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
    await page.goto(`${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`)
    const name = 'Hammer Crusher'
    await expect(page.locator('[data-id="D014_HammerCrusher"] .card-title').first()).toHaveText(name)
    await page.locator('.action-card-holder[data-action-id="house-redevelopment"]').click()
    await expect(page.locator('.interaction-bar')).toContainText('Hammer Crusher: Build rooms?')
    await expect(page.locator('.interaction-bar')).toContainText('Triggered by Hammer Crusher')
    await page.getByRole('button', { name: 'Skip', exact: true }).click()
    await expect(page.locator('.action-log')).toContainText(name)
    await expect(page.locator('.game-layout')).not.toContainText(/碎锤|\{card:/)
  })

  test(`${locale} localizes the workshop sandbox Moor settings`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('open-agricola-locale-v2', value), locale)
    await page.goto(`${FRONTEND_URL}/?page=workshop&player=p1&devMode=1`)
    await expect(page.getByTestId('workshop-root')).toBeVisible()
    await page.getByRole('button', { name: 'Adjust config', exact: true }).click()
    const modal = page.locator('.ws-reset-modal')
    await expect(modal.getByRole('checkbox', { name: 'Through the Seasons', exact: true })).toBeVisible()
    await modal.getByRole('checkbox', { name: 'Farmers of the Moor', exact: true }).check()
    await expect(modal.getByRole('checkbox', { name: 'Allow incomplete Farmers of the Moor minor pool', exact: true })).toBeVisible()

  })
}
