import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import type { GameState } from '../shared/contract/types'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import { emptyResources } from '../shared/session/state-bootstrap'
import { joinRoomClients, publicRoomState, roomDriver, roomSnapshot } from './room-command-driver'

async function openRoom(browser: Browser, request: APIRequestContext, locale: 'en', configure: (state: GameState) => void, enableMoor = false) {
  const pages: [Page, Page] = [await browser.newPage(), await browser.newPage()]
  try {
    await joinRoomClients(pages, request, locale)
    const driver = roomDriver(pages)
    await driver.reload()
    const fixture = createWorkSession({ seed: 1373, options: {
      enableThroughTheSeasons: true, enableFarmersOfTheMoor: enableMoor,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    }, configure })
    try {
      await driver.command(0, { type: 'loadGame', state: fixture.withCtx(() => serializeState(fixture.state, {})) })
    } finally { fixture.dispose() }
    return { pages, driver }
  } catch (error) {
    await Promise.all(pages.map(page => page.close()))
    throw error
  }
}

async function chooseByLabel(pages: [Page, Page], driver: ReturnType<typeof roomDriver>, labelKey: string) {
  const current = await roomSnapshot(pages[0])
  if (current.interaction.stateId !== 'wait' || current.interaction.request.kind !== 'choice') {
    throw new Error(`Expected choice for ${labelKey}: ${JSON.stringify(current.interaction)}`)
  }
  const option = current.interaction.request.options.find(option => option.labelKey === labelKey && !option.disabled)
  if (!option) throw new Error(`Missing ${labelKey}`)
  await driver.command(current.interaction.playerIndex, { type: 'choice', value: option.value })
}

for (const locale of ['en'] as const) {
  for (const pigBreeder of [false, true]) {
    test(`${pigBreeder ? 'Pig Breeder' : 'spring'} logs actual newborns in ${locale}`, async ({ browser, request }) => {
      const animal = pigBreeder ? 'boar' : 'sheep'
      const { pages, driver } = await openRoom(browser, request, locale, state => {
        state.round = pigBreeder ? 12 : 1
        state.enableThroughTheSeasons = !pigBreeder
        state.throughTheSeasons = pigBreeder ? null : { startSeason: 'spring', currentSeason: 'spring' }
        const owner = state.players[0]!
        owner.occupationPlayed = pigBreeder ? ['A165_PigBreeder'] : []
        owner.resources[animal] = 2
        owner.pastures = [{ id: 'birth-pen', tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }], animalType: animal, animalCount: 2 }]
        owner.fenceSegments = ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2'].map(edge => ({
          edge, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id },
        }))
        for (const player of state.players) {
          player.resources.food = 60
          if (pigBreeder) state.actionSpaces[0]!.takenBy.push(...player.workers.filter(worker => worker.isActive).map(worker => ({ playerId: player.id, workerId: worker.id })))
        }
      })
      try {
        await driver.command(0, pigBreeder ? { type: 'roundEnd' } : { type: 'action', spaceId: 'season-spring-animal-and-fruit' })
        for (let step = 0; step < 8; step++) {
          const current = await roomSnapshot(pages[0])
          if (current.interaction.stateId !== 'wait' || current.interaction.request.kind === 'confirm-next-player') break
          const pending = current.interaction.request
          if (pending.kind === 'animal-reorg') {
            await driver.command(current.interaction.playerIndex, { type: 'choice', value: 'confirm', payload: {
              zones: pending.zones.map(zone => ({
                id: zone.id, zoneType: zone.zoneType, animalType: zone.id === 'birth-pen' ? animal : null,
                animalCount: zone.id === 'birth-pen' ? 3 : 0,
              })),
            } })
          } else if (pending.kind === 'choice' || pending.kind === 'select-trigger') {
            const option = pending.options.find(option => !option.disabled && !option.value.startsWith('__'))
            if (!option) throw new Error('Missing breeding choice')
            await driver.command(current.interaction.playerIndex, { type: 'choice', value: option.value })
          } else {
            throw new Error(`Unexpected breeding interaction: ${JSON.stringify(pending)}`)
          }
        }
        const current = await roomSnapshot(pages[0])
        expect(current.state.players[0]!.resources[animal]).toBe(3)
        expect(current.state.events.filter(event => event.type === 'farm.animalBred')).toMatchObject([{ animals: { [animal]: 1 } }])
        for (const page of pages) {
          const row = page.locator('.action-log__text').filter({ hasText: /breeds/ })
          await expect(row).toHaveCount(1)
          await expect(row.locator(`[data-resource="${animal}"][data-amount="1"]`)).toHaveCount(1)
          await expect(row).toContainText(pigBreeder ? 'Pig Breeder' : 'Spring')
        }
        await driver.reload()
        expect(publicRoomState(await roomSnapshot(pages[1]))).toEqual(publicRoomState(current))
      } finally { await Promise.all(pages.map(page => page.close())) }
    })
  }

  test(`summer heating logs the actual waived requirement in ${locale}`, async ({ browser, request }) => {
    const { pages, driver } = await openRoom(browser, request, locale, state => {
      state.round = 4
      state.throughTheSeasons = { startSeason: 'summer', currentSeason: 'summer' }
      for (const player of state.players) {
        player.resources.food = 20
        player.resources.fuel = 0
        player.resources.wood = 0
        state.actionSpaces[0]!.takenBy.push(...player.workers.filter(worker => worker.isActive).map(worker => ({ playerId: player.id, workerId: worker.id })))
      }
    }, true)
    try {
      await driver.command(0, { type: 'roundEnd' })
      for (let step = 0; step < 6; step++) {
        const pending = await roomSnapshot(pages[0])
        if (pending.state.round === 5) break
        if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'feed') {
          throw new Error(`Expected feeding only: ${JSON.stringify(pending.interaction)}`)
        }
        await driver.command(pending.interaction.playerIndex, { type: 'choice', value: 'confirm', payload: { selections: [] } })
      }
      const current = await roomSnapshot(pages[0])
      expect(current.state.round).toBe(5)
      expect(current.state.events.filter(event => event.type === 'harvest.heated')).toMatchObject([
        { required: 0, fuelUsed: 0, woodToFuel: 0, sickWorkerIds: [] },
        { required: 0, fuelUsed: 0, woodToFuel: 0, sickWorkerIds: [] },
      ])
      for (const page of pages) {
        const row = page.locator('.action-log__text').filter({ hasText: /Summer.*waives/ })
        await expect(row).toHaveCount(2)
        for (const heating of await row.all()) {
          await expect(heating).toContainText('waives 2 fuel requirement (normally 2)')
        }
      }
      await driver.reload()
      expect(publicRoomState(await roomSnapshot(pages[1]))).toEqual(publicRoomState(current))
    } finally { await Promise.all(pages.map(page => page.close())) }
  })

  test(`summer free stable keeps its grant source after pending reload in ${locale}`, async ({ browser, request }) => {
    const { pages, driver } = await openRoom(browser, request, locale, state => {
      state.throughTheSeasons = { startSeason: 'summer', currentSeason: 'summer' }
      Object.assign(state.players[0]!.resources, { wood: 5, reed: 2 })
    })
    try {
      await driver.ui(0, () => pages[0].locator('[data-action-id="farm-expansion"] button').first().click())
      await chooseByLabel(pages, driver, 'actions.construct.name')
      await driver.command(0, { type: 'commitSelection', playerIndex: 0, payload: { rooms: [{ row: 1, col: 1 }] } })
      await driver.reload()
      const pending = await roomSnapshot(pages[0])
      if (pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice') {
        await chooseByLabel(pages, driver, 'actions.stables.name')
      }
      await driver.command(0, { type: 'commitSelection', playerIndex: 0, payload: { stables: [{ row: 0, col: 0 }] } })
      const current = await roomSnapshot(pages[0])
      expect(current.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
      expect(current.state.players[0]!.roomTiles).toHaveLength(3)
      expect(current.state.players[0]!.stableTiles).toEqual([{ row: 0, col: 0 }])
      for (const page of pages) {
        const row = page.locator('.action-log__text').filter({ hasText: /Summer/i })
        await expect(row).toHaveCount(1)
        await expect(row).toContainText('1')
      }
      expect(publicRoomState(await roomSnapshot(pages[1]))).toEqual(publicRoomState(current))
    } finally { await Promise.all(pages.map(page => page.close())) }
  })

  test(`winter zero-net accumulation remains explained in ${locale}`, async ({ browser, request }) => {
    const { pages, driver } = await openRoom(browser, request, locale, state => {
      state.round = 10
      state.throughTheSeasons = { startSeason: 'autumn', currentSeason: 'autumn' }
      for (const space of state.actionSpaces) space.resources = { ...emptyResources }
      for (const player of state.players) {
        player.resources.food = 20
        state.actionSpaces[0]!.takenBy.push(...player.workers.filter(worker => worker.isActive).map(worker => ({ playerId: player.id, workerId: worker.id })))
      }
    })
    try {
      await driver.command(0, { type: 'roundEnd' })
      const current = await roomSnapshot(pages[0])
      expect(current.state.round).toBe(11)
      const reed = current.state.events.filter(event => event.type === 'action.accumulated' && event.spaceId === 'reed-bank')
      expect(reed).toHaveLength(1)
      expect(reed[0]).toMatchObject({ resources: {} })
      const target = 'Reed Bank'
      for (const page of pages) {
        const row = page.locator('.action-log__text').filter({ hasText: target })
        await expect(row).toHaveCount(1)
        await expect(row).toContainText('Winter')
        await expect(row).toContainText('0')
        await expect(row).toContainText('1')
      }
      await driver.reload()
      expect(publicRoomState(await roomSnapshot(pages[1]))).toEqual(publicRoomState(current))
    } finally { await Promise.all(pages.map(page => page.close())) }
  })

  for (const free of [false, true]) {
    test(`spring fence payment ${free ? 0 : 5} explains construction and two saved wood in ${locale}`, async ({ browser, request }, testInfo) => {
      const { pages, driver } = await openRoom(browser, request, locale, state => {
        state.round = 3
        state.roundActionOrder[0] = 'fencing'
        state.throughTheSeasons = { startSeason: 'spring', currentSeason: 'spring' }
        state.players[0]!.resources.wood = 10
        if (free) state.players[0]!.occupationPlayed = ['A088_HedgeKeeper']
      })
      try {
        await driver.ui(0, () => pages[0].locator('[data-action-id="fencing"] button').first().click())
        await driver.command(0, { type: 'commitSelection', playerIndex: 0, payload: {
          edges: free ? ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
            : ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-1', 'V-0-2'], } })
        const current = await roomSnapshot(pages[0])
        expect(current.state.players[0]!.resources.wood).toBe(free ? 10 : 5)
        expect(current.state.players[0]!.fenceSegments).toHaveLength(free ? 4 : 7)
        expect(publicRoomState(await roomSnapshot(pages[1]))).toEqual(publicRoomState(current))
        const explanation = /Spring/i
        for (const page of pages) {
          const row = page.locator('.action-log__text').filter({ hasText: explanation })
          await expect(row).toHaveCount(1)
          await expect(row).toContainText(`Build ${free ? 4 : 7} fence(s)`)
          await expect(row).toContainText(new RegExp(`Pays.*${free ? 0 : 5}`))
          await expect(row.locator('[data-resource="wood"][data-amount="2"]')).toHaveCount(1)
          await expect(row.locator('[data-resource="wood"][data-amount="5"]')).toHaveCount(free ? 0 : 1)
        }
        const screenshot = `output/playwright/seasonal-ws-fence-${locale}${free ? '-free' : ''}.png`
        await pages[0].locator('.action-log').screenshot({ path: screenshot })
        await testInfo.attach(`spring-fence-${locale}${free ? '-free' : ''}`, { path: screenshot, contentType: 'image/png' })
        await driver.reload()
        expect(publicRoomState(await roomSnapshot(pages[0]))).toEqual(publicRoomState(current))
      } finally { await Promise.all(pages.map(page => page.close())) }
    })
  }

  test(`winter plow logs the actual food surcharge in ${locale}`, async ({ browser, request }) => {
    const { pages, driver } = await openRoom(browser, request, locale, state => {
      state.throughTheSeasons = { startSeason: 'winter', currentSeason: 'winter' }
      state.players[0]!.resources.food = 1
    })
    try {
      await driver.ui(0, () => pages[0].locator('[data-action-id="farmland"] button').first().click())
      await driver.command(0, { type: 'commitSelection', playerIndex: 0, payload: { tile: { row: 0, col: 0 } } })
      const current = await roomSnapshot(pages[0])
      expect(current.state.players[0]!.resources.food).toBe(0)
      expect(current.state.players[0]!.fields).toHaveLength(1)
      const explanation = /Winter/i
      for (const page of pages) {
        const row = page.locator('.action-log__text').filter({ hasText: explanation })
        await expect(row).toHaveCount(1)
        await expect(row).toContainText('1')
      }
      expect(publicRoomState(await roomSnapshot(pages[1]))).toEqual(publicRoomState(current))
    } finally { await Promise.all(pages.map(page => page.close())) }
  })

  test(`autumn major purchase retains its selected discount in ${locale}`, async ({ browser, request }) => {
    const { pages, driver } = await openRoom(browser, request, locale, state => {
      state.round = 4
      state.roundActionOrder[0] = 'major-improvement'
      state.throughTheSeasons = { startSeason: 'autumn', currentSeason: 'autumn' }
      state.players[0]!.resources.clay = 2
    })
    try {
      await driver.ui(0, () => pages[0].locator('[data-action-id="major-improvement"] button').first().click())
      await driver.command(0, { type: 'choice', value: 'Major_Fireplace1' })
      let current = await roomSnapshot(pages[0])
      if (current.interaction.stateId === 'wait' && current.interaction.request.kind === 'choice' &&
        current.interaction.request.options.some(option => option.value.startsWith('pay:'))) {
        const payment = current.interaction.request.options.find(option => option.value.startsWith('pay:') && !option.disabled)!
        await driver.command(0, { type: 'choice', value: payment.value })
        current = await roomSnapshot(pages[0])
      }
      expect(current.state.players[0]!.resources.clay).toBe(1)
      expect(current.state.players[0]!.improvements).toContain('Major_Fireplace1')
      for (const page of pages) {
        const row = page.locator('.action-log__text').filter({ hasText: /Autumn/i })
        await expect(row).toHaveCount(1)
        await expect(row).toContainText('1')
      }
      expect(publicRoomState(await roomSnapshot(pages[1]))).toEqual(publicRoomState(current))
    } finally { await Promise.all(pages.map(page => page.close())) }
  })

  test(`summer grant logs explain the actual gain to both WS clients in ${locale}`, async ({ browser, request }) => {
    const { pages, driver } = await openRoom(browser, request, locale, state => {
      state.throughTheSeasons = { startSeason: 'summer', currentSeason: 'summer' }
      state.players[0]!.resources.grain = 0
    })
    try {
      await driver.ui(0, () => pages[0].locator('[data-action-id="day-laborer"] button').first().click())
      const current = await roomSnapshot(pages[0])
      expect(current.state.players[0]!.resources.grain).toBe(1)
      expect(publicRoomState(await roomSnapshot(pages[1]))).toEqual(publicRoomState(current))
      const explanation = /Summer/
      for (const page of pages) {
        await expect(page.locator('.action-log__text').filter({ hasText: explanation })).toHaveCount(1)
      }
      await driver.reload()
      expect(publicRoomState(await roomSnapshot(pages[0]))).toEqual(publicRoomState(current))
      await driver.command(0, { type: 'undoAction' })
      for (const page of pages) {
        await expect(page.locator('.action-log__text--canceled').filter({ hasText: explanation })).toHaveCount(1)
      }
      await driver.ui(0, () => pages[0].locator('[data-action-id="day-laborer"] button').first().click())
      for (const page of pages) {
        await expect(page.locator('.action-log__text:not(.action-log__text--canceled)').filter({ hasText: explanation })).toHaveCount(1)
      }
      expect((await roomSnapshot(pages[0])).state.players[0]!.resources.grain).toBe(1)
    } finally { await Promise.all(pages.map(page => page.close())) }
  })
}
