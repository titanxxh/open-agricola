import { expect, test } from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL, getJson, postJson } from './fixtures'

const sandboxUrl = `${FRONTEND_URL}/?page=game&player=p1&embedded=1&devMode=1`

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'zh'))
})

test('dev lobby creates a hotseat room and preserves identity after reload', async ({ page }) => {
  await page.goto(`${FRONTEND_URL}/?player=p1&devMode=1`)
  await page.getByRole('button', { name: '本地热座', exact: true }).click()
  await page.getByRole('button', { name: '开始热座对局', exact: true }).click()
  const handoff = page.getByRole('dialog', { name: 'Hotseat handoff' })
  await expect(handoff).toBeVisible({ timeout: 15000 })
  // The dev account supplies this name explicitly; preserve it like a real numeric account name.
  await expect(handoff).toContainText('请把设备交给 Player 1。')
  const url = new URL(page.url())
  expect(url.searchParams.get('player')).toBe('p1')
  expect(url.searchParams.get('devMode')).toBe('1')
  expect(url.searchParams.get('hotseat')).toBe('1')
  expect(url.searchParams.get('room')).toBeTruthy()
  await handoff.getByRole('button').click()
  await expect(page.locator('.game-layout')).toBeVisible()
  await page.reload()
  await expect(handoff).toBeVisible({ timeout: 15000 })
  await expect(handoff).toContainText('请把设备交给 Player 1。')
  await handoff.getByRole('button').click()
  await expect(page.locator('.game-layout')).toBeVisible()
  await page.locator('.action-card-holder[data-action-id="forest"]').click()
  await page.getByRole('button', { name: '确认切换', exact: true }).click()
  await expect(handoff).toBeVisible({ timeout: 15000 })
  await expect(handoff).not.toContainText(/(?:Player|player)(?: [1-6]|[A-F])/)
  await expect(handoff).toContainText('玩家 2')
})

for (const [stage, prompt] of [
  ['standard', '选择 1 张职业和 1 张小改良'],
  ['occupation', '选择 1 张职业'],
  ['farmersOfTheMoorMinor', '选择 1 张沼泽农夫小改良'],
  ['publishedMinor', '选择 1 张小改良'],
] as const) {
  test(`Chinese draft renders the ${stage} stage and translated card faces`, async ({ page, request }) => {
    await postJson(request, `${BACKEND_URL}/api/game/new`, { seed: 931, maxPlayers: 2 })
    const { state } = await getJson(request, `${BACKEND_URL}/api/game/state`)
    state.phase = 'draft'
    state.draft = {
      mode: 'simultaneous', stage, round: 1, totalRounds: 7, poolSize: 7,
      seatOrder: ['p1', 'p2'],
      pools: {
        p1: { occ: ['A092_AdoptiveParents', 'C095_BasketWeaver', 'B089_Groom'], minor: ['D018_SteamPlow', 'E080_RockGarden', 'A042_ForestLakeHut', 'A051_DriftNetBoat'] },
        p2: { occ: ['A106_SlurrySpreader'], minor: ['A001_Shelter'] },
      },
      kept: { p1: { occ: [], minor: [] }, p2: { occ: [], minor: [] } },
      pendingPicks: { p1: { occ: null, minor: null }, p2: { occ: null, minor: null } },
    }
    if (stage === 'farmersOfTheMoorMinor') {
      state.draft.pools.p1.minor = ['M015_PeatBurnOff', 'M047_BogForest', 'M065_FireBrigade']
    }
    expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
    await page.goto(sandboxUrl)
    const dialog = page.getByRole('dialog', { name: '卡牌轮抽' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('轮抽 — 第 1 / 7 轮')
    await expect(dialog).toContainText(prompt)
    await expect(dialog.getByRole('button', { name: '确认选择' })).toBeVisible()
    await expect(dialog).not.toContainText(/Draft|Pick|Occupations|Minor improvements|Already kept/)
    const faces = dialog.locator('.player-card-inner')
    for (const face of await faces.all()) {
      await expect(face.locator('.card-title')).toHaveText(/[\u4e00-\u9fff]/)
      await expect(face.locator('.card-desc')).not.toContainText(/[A-Za-z]/)
    }
    if (stage === 'standard') {
      await expect(dialog).toContainText('养父母')
      await dialog.locator('[data-id="A092_AdoptiveParents"]').click()
      await dialog.locator('[data-id="D018_SteamPlow"]').click()
      await dialog.getByRole('button', { name: '确认选择' }).click()
      await expect(dialog).toContainText('等待其他玩家（1/2）…')
    }
  })
}

test('spring interaction and breeding log use Chinese season/action names without debug events', async ({ page, request }) => {
  await postJson(request, `${BACKEND_URL}/api/game/new`, { seed: 9, maxPlayers: 2, enableThroughTheSeasons: true })
  const { state } = await getJson(request, `${BACKEND_URL}/api/game/state`)
  state.phase = 'playing'
  state.currentPlayerIndex = 0
  state.throughTheSeasons = { startSeason: 'spring', currentSeason: 'spring' }
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const first = state.players[0]
  first.resources.grain = 1
  first.resources.sheep = 2
  first.fields = [{ row: 0, col: 0, stacks: [] }]
  first.pastures = [{ id: 'pen', size: 2, tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }], stables: 0, animalType: 'sheep', animalCount: 2 }]
  first.fenceSegments = ['H-0-1', 'H-0-2', 'H-1-1', 'H-1-2', 'V-0-1', 'V-0-3'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: first.id } }))
  expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
  await page.goto(sandboxUrl)
  await expect(page.locator('.seasons-board__token')).toHaveText('春')
  await page.locator('.seasons-board__space-button[data-season="spring"]').click()
  await expect(page.locator('.interaction-bar')).toContainText('由 春季 触发')
  await page.getByRole('button', { name: '繁殖', exact: true }).click()
  await expect(page.locator('.action-log')).toContainText('春季 触发 (繁殖)')
  await expect(page.locator('.action-log')).not.toContainText(/through-the-seasons:|farm\.animalBred|actor=|seq=|\(breed\)/)
})

test('completed fathers and the infirmary restriction have Chinese labels', async ({ page, request }) => {
  await postJson(request, `${BACKEND_URL}/api/game/new`, { seed: 931, maxPlayers: 2, enableParentCards: true, enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true })
  const { state } = await getJson(request, `${BACKEND_URL}/api/game/state`)
  state.phase = 'playing'
  state.parentSelection = null
  state.players[0].parentCards = { mother: 'PR01', father: 'PS01' }
  state.players[0].cardStates.PS01 = { counters: { fatherCompletedTier: 1 }, infobox: 'Completed' }
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const sickPlayer = state.players[1]
  const sickWorkers = sickPlayer.workers.filter((worker: { isActive: boolean }) => worker.isActive)
  sickPlayer.sickWorkerIds = sickWorkers.map((worker: { id: string }) => worker.id)
  const infirmary = state.actionSpaces.find((space: { id: string }) => space.id === 'moor-infirmary')
  infirmary.takenBy = sickWorkers.map((worker: { id: string; isActive: boolean }) => {
    worker.isActive = false
    return { playerId: sickPlayer.id, workerId: worker.id }
  })
  expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
  await page.goto(sandboxUrl)
  await expect(page.locator('.parent-card-infobox')).toHaveText('已完成')
  const infirmaryCard = page.locator('[data-action-id="moor-infirmary"]')
  const restriction = infirmaryCard.getByText('仅限病人', { exact: true })
  await expect(restriction).toBeVisible()
  await expect(infirmaryCard.locator('.action-farmer-stack')).toHaveCount(2)
  const textBox = await restriction.boundingBox()
  const workerBox = await infirmaryCard.locator('.action-farmer-stack').first().boundingBox()
  expect(textBox).not.toBeNull()
  expect(workerBox).not.toBeNull()
  expect(textBox!.y + textBox!.height).toBeLessThanOrEqual(workerBox!.y)
  await expect(page.locator('.game-layout')).not.toContainText(/Completed|Sick workers only/)
})

test('winter payments fly to supply with negative amounts and a localized source', async ({ page, request }) => {
  await postJson(request, `${BACKEND_URL}/api/game/new`, { seed: 931, maxPlayers: 2, enableThroughTheSeasons: true })
  const { state } = await getJson(request, `${BACKEND_URL}/api/game/state`)
  state.phase = 'playing'
  state.currentPlayerIndex = 0
  state.throughTheSeasons = { startSeason: 'winter', currentSeason: 'winter' }
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  state.players[0].resources.food = 6
  state.players[0].resources.wood = 2
  expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
  await page.goto(sandboxUrl)
  await expect(page.locator('.game-layout')).toBeVisible()
  // Record transient animation text from the actual DOM before the chips expire.
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      const counts = [...document.querySelectorAll('.public-event-resource-animation[data-to-kind="supply"] .resource-chip-count')]
        .map(node => node.textContent)
      if (counts.length) document.documentElement.dataset.paymentAmounts = counts.join(',')
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
  await page.locator('.seasons-board__space-button[data-season="winter"]').click()
  await expect.poll(() => page.locator('html').getAttribute('data-payment-amounts')).toContain('−2')
  await expect.poll(() => page.locator('html').getAttribute('data-payment-amounts')).toContain('−6')
  await expect(page.locator('.action-log')).toContainText('冬季')
  await expect(page.locator('.action-log')).toContainText('支付资源')
  await expect(page.locator('.action-log')).not.toContainText(/through-the-seasons:|\(pay\)/)
})
