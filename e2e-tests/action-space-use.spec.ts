import { expect, test, type Page } from '@playwright/test'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import type { GameState } from '../shared/contract/types'
import { joinRoomClients, publicRoomState, roomDriver, roomSnapshot } from './room-command-driver'

async function load(driver: ReturnType<typeof roomDriver>, configure: (state: GameState) => void) {
  const fixture = createWorkSession({ seed: 42, configure: state => {
    state.round = 8
    for (const player of state.players) {
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      for (const key of Object.keys(player.resources)) Reflect.set(player.resources, key, 0)
    }
    configure(state)
  } })
  try {
    await driver.command(0, { type: 'loadGame', state: fixture.withCtx(() => serializeState(fixture.state, {})) })
  } finally { fixture.dispose() }
}

async function agree(pages: [Page, Page]) {
  const current = await roomSnapshot(pages[0])
  expect(publicRoomState(await roomSnapshot(pages[1]))).toEqual(publicRoomState(current))
  return current
}

test('the actual space-before reward pays for the renovation in both room clients', async ({ browser, request }) => {
  const pages: [Page, Page] = [await browser.newPage(), await browser.newPage()]
  try {
    await joinRoomClients(pages, request)
    const driver = roomDriver(pages)
    await load(driver, state => {
      state.roundActionOrder[4] = 'house-redevelopment'
      const player = state.players[0]!
      player.occupationPlayed = ['A124_Knapper']
      player.houseType = 'clay'
      Object.assign(player.resources, { stone: 1, reed: 1 })
    })
    await driver.ui(0, () => pages[0].locator('[data-action-id="house-redevelopment"] button').first().click())
    const current = await agree(pages)
    expect(current.state.players[0]!.houseType).toBe('stone')
    expect(current.state.players[0]!.resources).toMatchObject({ stone: 0, reed: 0 })
    const gain = current.state.events.find(event => event.type === 'resource.moved' && event.sourceCardId === 'A124_Knapper')!
    const payment = current.state.events.find(event => event.type === 'resource.paid' && event.paymentFor === 'renovation')!
    expect(gain.seq).toBeLessThan(payment.seq)
    expect(current.state.log.filter(entry => entry.key === 'log.cardTriggered' && entry.params?.cardId === 'A124_Knapper')).toHaveLength(1)
    await driver.reload()
    expect(publicRoomState(await agree(pages))).toEqual(publicRoomState(current))
  } finally { await Promise.all(pages.map(page => page.close())) }
})

test('space-immediate precedes rule-after and the pending reward survives a room reload once', async ({ browser, request }) => {
  const pages: [Page, Page] = [await browser.newPage(), await browser.newPage()]
  try {
    await joinRoomClients(pages, request)
    const driver = roomDriver(pages)
    await load(driver, state => {
      const player = state.players[0]!
      player.minorPlayed = ['C058_Woodcraft', 'A048_ShavingHorse']
      player.resources.wood = 3
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    })
    await driver.ui(0, () => pages[0].locator('[data-action-id="forest"] button').first().click())
    let current = await agree(pages)
    expect(current.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'A048_ShavingHorse', request: { kind: 'choice' } })
    expect(current.state.players[0]!.resources).toMatchObject({ wood: 6, food: 0 })
    const pending = { public: publicRoomState(current), interaction: current.interaction }
    await driver.reload()
    current = await agree(pages)
    expect(publicRoomState(current)).toEqual(pending.public)
    expect(current.interaction).toEqual(pending.interaction)
    if (current.interaction.stateId !== 'wait' || current.interaction.request.kind !== 'choice') throw new Error('Expected Shaving Horse choice')
    const accept = current.interaction.request.options.find(option => option.value !== '__skip__' && !option.disabled)!
    await driver.ui(0, () => pages[0].locator(`.interaction-bar [data-choice-value="${accept.value}"]`).click())
    current = await agree(pages)
    expect(current.state.players[0]!.resources).toMatchObject({ wood: 5, food: 3 })
    expect(current.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === 'A048_ShavingHorse')).toHaveLength(1)
    expect(current.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === 'C058_Woodcraft')).toEqual([])
    expect(current.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    const finished = publicRoomState(current)
    await driver.reload()
    expect(publicRoomState(await agree(pages))).toEqual(finished)
  } finally { await Promise.all(pages.map(page => page.close())) }
})
