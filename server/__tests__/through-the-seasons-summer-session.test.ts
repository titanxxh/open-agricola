import { describe, expect, it } from 'vitest'
import { registerActionHook, unregisterActionHook } from '../../shared/actions/hooks'
import { registerAdHocAction } from '../../shared/actions/helpers/ad-hoc-action-registry'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { emptyResources } from '../../shared/session/state-bootstrap'
import { serializeSessionSnapshot, rehydrateState } from '../../shared/session/serialization'
import { getAllTilePositions } from '../../shared/domain/farm'
import '../../shared/cards/A/A097_Freshman'
import '../../shared/cards/B/B077_LoamPit'
import '../../shared/cards/C/C037_DwellingMound'

type SeasonId = 'winter' | 'spring' | 'summer' | 'autumn'
type SeasonsState = {
  enableThroughTheSeasons?: boolean
  throughTheSeasons?: {
    startSeason: SeasonId
    currentSeason: SeasonId
  } | null
}

const summerActionId = 'season-summer-farmers-market'

const seasonsOf = (session: GameSession) => session.state as typeof session.state & SeasonsState

const setupSummer = () => {
  const session = new GameSession(352, undefined, {
    playerCount: 2,
    enableThroughTheSeasons: true,
  } as never)
  const state = seasonsOf(session)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.throughTheSeasons = { startSeason: 'summer', currentSeason: 'summer' }
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  const player = state.players[0]!
  setActiveWorkerCount(player, 2)
  setWorkersAtHome(state, player, 2)
  session.loadState(state)
  return session
}

const availableIds = (session: GameSession, playerIndex = 0) =>
  session.getAvailableActions(playerIndex).map((action) => action.spaceId)

const fillFarmyardWithFields = (session: GameSession) => {
  session.state.players[0]!.fields = Array.from({ length: 3 }).flatMap((_, row) =>
    Array.from({ length: 5 }).map((__, col) => ({ row, col, stacks: [] })),
  )
}

const chooseByLabel = (
  session: GameSession,
  resp: SessionResponse,
  labelKey: string,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected choice prompt')
  const option = resp.interaction.request.options?.find((entry) => entry.labelKey === labelKey)
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex, option!.value)
}

const auditClone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const auditSummer = () => {
  const session = setupSummer()
  for (const player of session.state.players) player.resources = { ...emptyResources, food: 50 }
  return session
}
const auditRestore = (session: GameSession) => {
  const restored = new GameSession(352, undefined, { playerCount: 2 })
  const response = restored.loadState(rehydrateState(auditClone(serializeSessionSnapshot(session.state, session))))
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toEqual(session.getState().interaction)
  return restored
}
const auditStop = (session: GameSession) => {
  let response = session.getState()
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
    const done = response.interaction.request.options.find((option) => option.value === '__done__' || option.value === '__skip__')
    expect(done, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, done!.value)
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

describe('Seasons batch 3 summer audit', () => {
  it.each([0, 1, 2])('Farmers Market with %i grain and no plow space sells exactly one grain or rejects entry', (grain) => {
    let session = auditSummer()
    const player = session.state.players[0]!
    player.resources.grain = grain
    player.fields = getAllTilePositions().filter((tile) => !player.roomTiles.some((room) => room.row === tile.row && room.col === tile.col)).map((tile) => ({ ...tile, stacks: [] }))
    player.fields[0]!.stacks = [{ kind: 'grain', remaining: 3 }]
    const before = auditClone(session.state)
    const response = session.takeAction(0, summerActionId)
    expect(response.ok).toBe(grain > 0)
    if (grain === 0) { expect(auditClone(session.state)).toEqual(before); return }
    auditStop(session)
    expect(session.state.players[0]!.resources).toEqual({ ...before.players[0]!.resources, grain: grain - 1, food: 54 })
    expect(session.state.players[0]!.fields).toEqual(before.players[0]!.fields)
    expect(session.state.players[1]).toEqual(before.players[1])
    expect(session.state.events.filter((event) => event.type === 'resource.paid')).toEqual([expect.objectContaining({ resources: { grain: 1 } })])
    session = auditRestore(session)
    const completed = auditClone(session.state)
    expect(session.takeAction(0, summerActionId).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(completed)
  })

  it.each(['plow', 'sell', 'plow-sell', 'sell-plow'] as const)('Farmers Market %s chooses both orders without selling twice', (order) => {
    let session = auditSummer()
    session.state.players[0]!.resources.grain = 2
    const other = auditClone(session.state.players[1])
    expect(session.takeAction(0, summerActionId).ok).toBe(true)
    session = auditRestore(session)
    for (const action of order.split('-')) {
      const response = session.getState()
      const label = action === 'plow' ? 'actions.plow.name' : 'actions.season-summer-farmers-market.option-sell-grain'
      const option = response.interaction.request.options.find((entry) => entry.labelKey === label)
      expect(option).toBeDefined()
      const before = auditClone(session.state)
      expect(session.resolveChoice(1, option!.value).ok).toBe(false)
      expect(session.resolveChoice(0, 'invalid-season-branch').ok).toBe(false)
      expect(auditClone(session.state)).toEqual(before)
      const chosen = session.resolveChoice(0, option!.value)
      expect(chosen.ok, chosen.error).toBe(true)
      if (action === 'plow') {
        const waiting = auditClone(session.state)
        expect(session.commitSelectionChoice(0, { tile: session.state.players[0]!.roomTiles[0]! }).ok).toBe(false)
        expect(auditClone(session.state)).toEqual(waiting)
        expect(session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } }).ok).toBe(true)
      }
      session = auditRestore(session)
    }
    auditStop(session)
    expect(session.state.players[0]!.resources.grain).toBe(order.includes('sell') ? 1 : 2)
    expect(session.state.players[0]!.resources.food).toBe(order.includes('sell') ? 54 : 50)
    expect(session.state.players[0]!.fields).toHaveLength(order.includes('plow') ? 1 : 0)
    expect(session.state.players[1]).toEqual(other)
    expect(session.state.events.filter((event) => event.type === 'resource.paid')).toHaveLength(order.includes('sell') ? 1 : 0)
  })

  it.each([
    { oven: 'Major_Fireplace1', grain: 2, food: 4 },
    { oven: 'Major_ClayOven', grain: 1, food: 5 },
    { oven: 'Major_StoneOven', grain: 2, food: 8 },
  ].flatMap((entry) => ['bake', 'plow-bake', 'bake-plow'].map((order) => ({ ...entry, order }))))(
    'Farmers Market $order with $oven uses its printed rate and cannot also sell', ({ oven, grain, food, order }) => {
      const session = auditSummer()
      session.state.players[0]!.resources.grain = 3
      session.state.players[0]!.improvements = [oven]
      session.state.availableMajorImprovements = session.state.availableMajorImprovements.filter((id) => id !== oven)
      expect(session.takeAction(0, summerActionId).ok).toBe(true)
      for (const action of order.split('-')) {
        const response = session.getState()
        if (action === 'plow') {
          expect(chooseByLabel(session, response, 'actions.plow.name').ok).toBe(true)
          expect(session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } }).ok).toBe(true)
        } else {
          let chosen = chooseByLabel(session, response, 'actions.season-summer-farmers-market.option-bread-or-sell')
          chosen = chooseByLabel(session, chosen, 'actions.bake-bread.name')
          expect(chosen.ok, chosen.error).toBe(true)
          const before = auditClone(session.state)
          expect(session.resolveChoice(1, `bulk:${oven}=${grain}`).ok).toBe(false)
          expect(session.resolveChoice(0, `bulk:${oven}=99`).ok).toBe(false)
          if (oven !== 'Major_Fireplace1') expect(session.resolveChoice(0, `bulk:${oven}=${grain + 1}`).ok).toBe(false)
          expect(auditClone(session.state)).toEqual(before)
          expect(session.resolveChoice(0, `bulk:${oven}=${grain}`).ok).toBe(true)
        }
      }
      const prompt = session.getState()
      if (prompt.interaction.stateId === 'wait' && prompt.interaction.request.kind === 'choice') {
        expect(prompt.interaction.request.options.some((option) => option.labelKey.includes('sell'))).toBe(false)
      }
      auditStop(session)
      expect(session.state.players[0]!.resources.grain).toBe(3 - grain)
      expect(session.state.players[0]!.resources.food).toBe(50 + food)
      expect(session.state.players[0]!.fields).toHaveLength(order.includes('plow') ? 1 : 0)
      expect(session.state.players[1]!.resources).toEqual({ ...emptyResources, food: 50 })
    },
  )

  it.each(['Major_Fireplace1', 'Major_ClayOven', 'Major_StoneOven'].flatMap((oven) => [false, true].map((plowed) => ({ oven, plowed }))))(
    'restoring $oven bake choice after plow=$plowed waits without exchanging resources', ({ oven, plowed }) => {
      const session = auditSummer()
      session.state.players[0]!.resources.grain = 3
      session.state.players[0]!.improvements = [oven]
      session.state.players[0]!.playedCards = [`major:${oven}`]
      session.state.availableMajorImprovements = session.state.availableMajorImprovements.filter((id) => id !== oven)
      let response = session.takeAction(0, summerActionId)
      if (plowed) {
        expect(chooseByLabel(session, response, 'actions.plow.name').ok).toBe(true)
        response = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
        expect(response.ok, response.error).toBe(true)
      }
      response = chooseByLabel(session, response, 'actions.season-summer-farmers-market.option-bread-or-sell')
      response = chooseByLabel(session, response, 'actions.bake-bread.name')
      expect(response.interaction.promptKey).toBe('ui.interactionBakeBreadChoice')
      const before = auditClone(session.state)
      let restored = auditRestore(session)
      restored = auditRestore(restored)
      expect(auditClone(restored.state.players.map((player) => ({ ...player, farmTerrain: player.farmTerrain ?? [] })))).toEqual(
        before.players.map((player) => ({ ...player, farmTerrain: player.farmTerrain ?? [] })),
      )
      expect(restored.state.events).toEqual(before.events)
      expect(restored.state.log).toEqual(before.log)
      const waiting = auditClone(restored.state)
      const count = oven === 'Major_ClayOven' ? 1 : 2
      expect(restored.resolveChoice(1, `bulk:${oven}=${count}`).ok).toBe(false)
      expect(restored.resolveChoice(0, `bulk:${oven}=99`).ok).toBe(false)
      expect(auditClone(restored.state)).toEqual(waiting)
      const baked = restored.resolveChoice(0, `bulk:${oven}=${count}`)
      expect(baked.ok, baked.error).toBe(true)
      auditStop(restored)
      expect(restored.state.players[0]!.resources).toEqual({
        ...before.players[0]!.resources,
        grain: 3 - count,
        food: oven === 'Major_ClayOven' ? 55 : oven === 'Major_Fireplace1' ? 54 : 58,
      })
      expect(restored.state.players[0]!.fields).toEqual(before.players[0]!.fields)
      expect(restored.state.players[1]).toEqual(before.players[1])
      expect(restored.state.events.filter((event) => event.type === 'resource.exchanged')).toHaveLength(1)
      restored = auditRestore(restored)
      const completed = auditClone(restored.state)
      expect(restored.resolveChoice(0, `bulk:${oven}=${count}`).ok).toBe(false)
      expect(auditClone(restored.state)).toEqual(completed)
    },
  )

  it('summer building the last open farmyard room has no place for a free stable', () => {
    const session = auditSummer()
    const player = session.state.players[0]!
    const room = { row: 1, col: 1 }
    player.fields = getAllTilePositions().filter((tile) => !player.roomTiles.some((entry) => entry.row === tile.row && entry.col === tile.col) && !(tile.row === room.row && tile.col === room.col)).map((tile) => ({ ...tile, stacks: [] }))
    Object.assign(player.resources, { wood: 5, reed: 2 })
    let response = session.takeAction(0, 'farm-expansion')
    if (response.interaction.request.kind === 'choice') response = chooseByLabel(session, response, 'actions.construct.name')
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, { rooms: [room] })
    expect(response.ok, response.error).toBe(true)
    auditStop(session)
    expect(session.state.players[0]!.rooms).toBe(3)
    expect(session.state.players[0]!.stableTiles).toHaveLength(0)
    expect(session.state.players[0]!.resources.wood).toBe(0)
    expect(session.state.players[0]!.resources.reed).toBe(0)
  })

  it('summer ordinary stable construction does not award another free stable', () => {
    const session = auditSummer()
    session.state.players[0]!.resources.wood = 2
    let response = session.takeAction(0, 'farm-expansion')
    if (response.interaction.request.kind === 'choice') response = chooseByLabel(session, response, 'actions.stables.name')
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 0 }] })
    expect(response.ok, response.error).toBe(true)
    auditStop(session)
    expect(session.state.players[0]!.stableTiles).toHaveLength(1)
    expect(session.state.players[0]!.resources.wood).toBe(0)
  })

  it.each(['house-redevelopment', 'farm-redevelopment'])('summer %s renovates without awarding a free stable', (action) => {
    let session = auditSummer()
    session.state.round = 14
    Object.assign(session.state.players[0]!.resources, { clay: 2, reed: 1 })
    const other = auditClone(session.state.players[1])
    const response = session.takeAction(0, action)
    expect(response.ok, response.error).toBe(true)
    let done = auditStop(session)
    if (done.interaction.request.kind === 'confirm-next-player') done = session.resolveChoice(done.interaction.playerIndex, 'confirm')
    expect(done.ok, done.error).toBe(true)
    expect(done.interaction.stateId).toBe('idle')
    expect(done.state.phase).toBe('playing')
    expect(done.state.roundPhase).toBe('work')
    expect(done.state.players[0]!.rooms).toBe(2)
    expect(done.state.players[0]!.houseType).toBe('clay')
    expect(done.state.players[0]!.stableTiles).toEqual([])
    expect(done.state.players[0]!.resources).toEqual({ ...emptyResources, food: 50 })
    expect(done.state.players[1]).toEqual(other)
    expect(done.state.actionSpaces.find((space) => space.id === action)!.takenBy).toHaveLength(1)
    expect(done.state.log.length).toBeGreaterThan(1)
    session = auditRestore(session)
    for (const viewer of ['p1', 'p2', null]) {
      const publicState = session.buildSyncPayload(session.getState(), viewer).state
      expect(publicState.players[0]!.stableTiles).toEqual([])
      expect(publicState.players[0]!.houseType).toBe('clay')
    }
  })

  it.each(['winter', 'spring', 'summer', 'autumn'] as const)('Day Laborer in %s gets the extra grain only in summer', (season) => {
    let session = auditSummer()
    session.state.throughTheSeasons!.currentSeason = season
    const response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toEqual({ ...emptyResources, food: 52, grain: season === 'summer' ? 1 : 0 })
    session = auditRestore(session)
    expect(session.getState().state.players[0]!.resources.grain).toBe(season === 'summer' ? 1 : 0)
    session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))
    expect(session.loadState(session.state).ok).toBe(true)
    expect(session.performRoundEnd().ok).toBe(true)
    const before = session.state.players[0]!.resources.grain
    expect(session.takeAction(0, 'day-laborer').ok).toBe(true)
    expect(session.state.players[0]!.resources.grain).toBe(before + (season === 'spring' ? 1 : 0))
  })

  it.each([1, 2].flatMap((rooms) => ['accept', 'skip', 'last-one', 'none-left'].map((mode) => ({ rooms, mode }))))(
    'summer builds $rooms rooms with $mode free stables and preserves supply after restore', ({ rooms, mode }) => {
      let session = auditSummer()
      const player = session.state.players[0]!
      Object.assign(player.resources, { wood: rooms * 5, reed: rooms * 2 })
      const built = mode === 'last-one' ? 3 : mode === 'none-left' ? 4 : 0
      player.stableTiles = Array.from({ length: built }, (_, col) => ({ row: 0, col }))
      let response = session.takeAction(0, 'farm-expansion')
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.request.kind === 'choice') expect(chooseByLabel(session, response, 'actions.construct.name').ok).toBe(true)
      const roomTiles = [{ row: 1, col: 1 }, { row: 2, col: 1 }].slice(0, rooms)
      response = session.commitSelectionChoice(0, { rooms: roomTiles })
      expect(response.ok, response.error).toBe(true)
      session = auditRestore(session)
      if (mode === 'skip') expect(session.resolveChoice(0, '__skip__').ok).toBe(true)
      else if (mode !== 'none-left') {
        response = chooseByLabel(session, session.getState(), 'actions.stables.name')
        expect(response.ok, response.error).toBe(true)
        session = auditRestore(session)
        const waiting = auditClone(session.state)
        expect(session.commitSelectionChoice(0, { stables: [roomTiles[0]!] }).ok).toBe(false)
        expect(auditClone(session.state)).toEqual(waiting)
        const farm = session.getState().interaction.request.farm
        const stables = farm.selectableTiles.slice(0, Math.min(rooms, 4 - built))
        expect(session.commitSelectionChoice(1, { stables }).ok).toBe(false)
        expect(auditClone(session.state)).toEqual(waiting)
        response = session.commitSelectionChoice(0, { stables })
        expect(response.ok, response.error).toBe(true)
      }
      auditStop(session)
      expect(session.state.players[0]!.rooms).toBe(2 + rooms)
      expect(session.state.players[0]!.stableTiles).toHaveLength(built + (mode === 'skip' || mode === 'none-left' ? 0 : Math.min(rooms, 4 - built)))
      expect(session.state.players[0]!.resources).toEqual({ ...emptyResources, food: 50 })
      expect(session.state.players[1]!.resources).toEqual({ ...emptyResources, food: 50 })
      expect(session.state.actionSpaces.find((space) => space.id === 'farm-expansion')!.takenBy).toHaveLength(1)
      expect(session.state.log.length).toBeGreaterThan(1)
    },
  )
})

describe('Through the Seasons Summer rules', () => {
  it('offers Farmer\'s Market plowing plus a bake-or-sell branch', () => {
    const session = setupSummer()
    const player = session.state.players[0]!
    player.resources.grain = 1
    player.improvements = ['Major_Fireplace1']

    let resp = session.takeAction(0, summerActionId)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Farmer\'s Market choice')
    expect(resp.interaction.request.options?.map((option) => option.labelKey)).toEqual(
      expect.arrayContaining([
        'actions.plow.name',
        'actions.season-summer-farmers-market.option-bread-or-sell',
      ]),
    )

    resp = chooseByLabel(
      session,
      resp,
      'actions.season-summer-farmers-market.option-bread-or-sell',
    )

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected bake-or-sell choice')
    expect(resp.interaction.request.options?.map((option) => option.labelKey)).toEqual(
      expect.arrayContaining([
        'actions.bake-bread.name',
        'actions.season-summer-farmers-market.option-sell-grain',
      ]),
    )
  })

  it('keeps Farmer\'s Market unavailable when none of its branches can happen', () => {
    const session = setupSummer()
    fillFarmyardWithFields(session)
    session.state.players[0]!.resources.grain = 0

    expect(availableIds(session)).not.toContain(summerActionId)
    expect(session.takeAction(0, summerActionId)).toMatchObject({
      ok: false,
      error: 'space unavailable',
    })
  })

  it('can plow then sell grain and hides selling when grain is unaffordable', () => {
    const session = setupSummer()
    const player = session.state.players[0]!
    player.resources.grain = 1
    const foodBefore = player.resources.food

    let resp = chooseByLabel(
      session,
      session.takeAction(0, summerActionId),
      'actions.plow.name',
    )

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected plow prompt')
    expect(resp.interaction.request.farm.farmType).toBe('plow')
    const tile = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { tile })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.fields).toContainEqual({ ...tile, stacks: [] })
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected remaining Farmer\'s Market choice')
    expect(resp.interaction.request.options?.some((option) => option.labelKey === 'ui.interactionFlowDone')).toBe(true)

    resp = chooseByLabel(
      session,
      resp,
      'actions.season-summer-farmers-market.option-sell-grain',
    )

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + 4)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        resources: { grain: 1 },
      }),
      expect.objectContaining({
        type: 'resource.moved',
        resources: { food: 4 },
      }),
    ]))

    const noGrain = setupSummer()
    noGrain.state.players[0]!.resources.grain = 0
    const noGrainResp = noGrain.takeAction(0, summerActionId)
    expect(noGrainResp.ok).toBe(true)
    expect(noGrainResp.interaction.stateId).toBe('wait')
    if (noGrainResp.interaction.stateId !== 'wait') throw new Error('expected Farmer\'s Market choice')
    expect(noGrainResp.interaction.request.options?.map((option) => option.labelKey)).not.toContain(
      'actions.season-summer-farmers-market.option-sell-grain',
    )
    expect(noGrainResp.interaction.request.options?.map((option) => option.labelKey)).not.toContain(
      'actions.season-summer-farmers-market.option-bread-or-sell',
    )
  })

  it('hides Summer plowing when compute-cost hooks make plowing unaffordable', () => {
    const session = setupSummer()
    const player = session.state.players[0]!
    player.minorPlayed.push('C037_DwellingMound')
    player.resources.food = 0
    player.resources.grain = 0

    expect(availableIds(session)).not.toContain(summerActionId)
    expect(session.takeAction(0, summerActionId)).toMatchObject({
      ok: false,
      error: 'space unavailable',
    })
  })

  it('uses hook-dispatched bake doability when building the Farmer\'s Market bread branch', () => {
    const session = setupSummer()
    const player = session.state.players[0]!
    fillFarmyardWithFields(session)
    player.occupationPlayed.push('A097_Freshman')
    player.occupationHand = ['A114_SeasonalWorker']
    player.resources.grain = 0

    expect(availableIds(session)).toContain(summerActionId)
    let resp = session.takeAction(0, summerActionId)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Farmer\'s Market choice')
    expect(resp.interaction.request.options?.map((option) => option.labelKey)).toContain('ui.interactionFreshmanOccupation')

    resp = chooseByLabel(session, resp, 'ui.interactionFreshmanOccupation')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.state.players[0]!.occupationPlayed).toContain('A114_SeasonalWorker')
    expect(resp.interaction.promptKey).toBe('ui.interactionSelectTrigger')
  })

  it('resolves replacement doability and execution through the complete ad-hoc resolver', () => {
    let doable = false
    const id = 'card_architecture_summer_replacement'
    registerAdHocAction({
      id, nameKey: 'actions.gain.name', descriptionKey: 'actions.gain.description', roundAvailable: 1, gainPerRound: {},
      canBeExecutedByPlayer: () => doable,
      execute: ({ player }) => { player.resources.food += 1; return { type: 'ok' } },
    })
    const session = setupSummer()
    registerActionHook({ id, actions: ['bake-bread'], phases: ['computeReplace'], handler: () => ({ actionId: id }) })
    try {
      fillFarmyardWithFields(session)
      const player = session.state.players[0]!
      player.resources.grain = 0
      expect(availableIds(session)).not.toContain(summerActionId)
      doable = true
      expect(availableIds(session)).toContain(summerActionId)
      const food = player.resources.food
      const response = session.takeAction(0, summerActionId)
      expect(response.ok).toBe(true)
      expect(response.state.players[0]!.resources.food).toBe(food + 1)
      expect(response.interaction).toEqual(session.getState().interaction)
    } finally { unregisterActionHook(id); session.dispose() }
  })

  it('adds one grain to Day Laborer in Summer', () => {
    const session = setupSummer()
    const player = session.state.players[0]!
    const grainBefore = player.resources.grain
    const foodBefore = player.resources.food

    const resp = session.takeAction(0, 'day-laborer')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + 2)
    expect(resp.state.players[0]!.resources.grain).toBe(grainBefore + 1)
  })

  it('adds Summer Day Laborer grain only once when card gain leaves run under the space', () => {
    const session = setupSummer()
    const player = session.state.players[0]!
    player.minorPlayed.push('B077_LoamPit')
    const grainBefore = player.resources.grain
    const foodBefore = player.resources.food
    const clayBefore = player.resources.clay

    const resp = session.takeAction(0, 'day-laborer')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + 2)
    expect(resp.state.players[0]!.resources.clay).toBe(clayBefore + 3)
    expect(resp.state.players[0]!.resources.grain).toBe(grainBefore + 1)
  })

  it('does not let a persisted Day Laborer token suppress a new Summer placement', () => {
    const session = setupSummer()
    const player = session.state.players[0]!
    player.cardStates['through-the-seasons:summer-day-laborer'] = {
      extraData: { usedActionToken: 1 },
    }
    const grainBefore = player.resources.grain

    const resp = session.takeAction(0, 'day-laborer')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(grainBefore + 1)
  })

  it('offers one free ordinary stable per room built in Summer', () => {
    const session = setupSummer()
    const player = session.state.players[0]!
    Object.assign(player.resources, { wood: 10, reed: 4 })
    player.minorPlayed.push('B085_FarmHand')

    let resp = session.takeAction(0, 'farm-expansion')
    resp = chooseByLabel(session, resp, 'actions.construct.name')

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected room prompt')
    expect(resp.interaction.request.farm.farmType).toBe('room')
    const rooms = resp.interaction.request.farm.selectableTiles.slice(0, 2)
    expect(rooms).toHaveLength(2)
    resp = session.commitSelectionChoice(0, { rooms })

    resp = chooseByLabel(session, resp, 'actions.stables.name')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected stable prompt')
    expect(resp.interaction.request.farm.farmType).toBe('stable')
    expect(resp.interaction.request.farm.maxSelections).toBe(2)
    expect('farmHandPositions' in resp.interaction.request.farm).toBe(false)
    const stables = resp.interaction.request.farm.selectableTiles.slice(0, 2)
    expect(stables).toHaveLength(2)
    resp = session.commitSelectionChoice(0, { stables })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.rooms).toBe(4)
    expect(resp.state.players[0]!.stableTiles).toEqual(expect.arrayContaining(stables))
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.reed).toBe(0)
  })

  it('lets the player skip Summer free stables after building rooms', () => {
    const session = setupSummer()
    const player = session.state.players[0]!
    Object.assign(player.resources, { wood: 5, reed: 2 })

    let resp = session.takeAction(0, 'farm-expansion')
    resp = chooseByLabel(session, resp, 'actions.construct.name')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected room prompt')
    const room = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { rooms: [room] })

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected optional stable prompt')
    expect(resp.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)
    resp = session.resolveChoice(0, '__skip__')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.rooms).toBe(3)
    expect(resp.state.players[0]!.stableTiles).toHaveLength(0)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.reed).toBe(0)
  })
})
