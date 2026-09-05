import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { CardEffect } from '../../shared/cards/card-effects'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'

import '../../shared/cards/D/D098_Transactor'
import '../../shared/cards/D/D146_Porter'
import '../../shared/cards/B/B162_ForestClearer'

const CARD_ID = 'D098_Transactor'
const FOLLOW_UP_CARD = 'TEST_D098FollowUp'

const setupFinalHarvest = (withBuildingResources = true) => {
  const session = new GameSession(98, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 0)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.occupationPlayed = []
    player.minorPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources.food = 20
  })
  state.players[0]!.occupationPlayed = [CARD_ID]
  for (const space of state.actionSpaces) {
    space.resources.wood = 0
    space.resources.clay = 0
    space.resources.reed = 0
    space.resources.stone = 0
  }
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  const clayPit = state.actionSpaces.find((space) => space.id === 'clay-pit')!
  const reedBank = state.actionSpaces.find((space) => space.id === 'reed-bank')!
  const quarry = state.actionSpaces.find((space) => space.id === 'western-quarry')!
  const fishing = state.actionSpaces.find((space) => space.id === 'fishing')!
  if (withBuildingResources) {
    forest.resources.wood = 2
    clayPit.resources.clay = 3
    reedBank.resources.reed = 1
    quarry.resources.stone = 4
  }
  fishing.resources.food = 5
  session.loadState(state)
  return session
}

const expectChoice = (response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(response.interaction.playerIndex).toBe(0)
  expect(response.interaction.sourceCard).toBe(CARD_ID)
  expect(response.interaction.promptKey).toBe('ui.cards.D098_Transactor.prompt')
  expect(response.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)
  return response.interaction.request.options!.find((option) => option.value !== '__skip__')!
}

const spaceResources = (response: SessionResponse, spaceId: string) =>
  response.state.actionSpaces.find((space) => space.id === spaceId)!.resources

describe('D098 Transactor final-harvest choice', () => {
  it('keeps the board unchanged while pending and drains only building resources when accepted', () => {
    const session = setupFinalHarvest()
    const beforeEventCount = session.state.events.length

    const offered = session.performRoundEnd()
    const accept = expectChoice(offered)
    expect(offered.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0, stone: 0 })
    expect(spaceResources(offered, 'forest')).toMatchObject({ wood: 2 })
    expect(spaceResources(offered, 'fishing')).toMatchObject({ food: 5 })

    const resolved = session.resolveChoice(0, accept.value)

    expect(resolved.state.players[0]!.resources).toMatchObject({ wood: 2, clay: 3, reed: 1, stone: 4 })
    expect(spaceResources(resolved, 'forest')).toMatchObject({ wood: 0 })
    expect(spaceResources(resolved, 'clay-pit')).toMatchObject({ clay: 0 })
    expect(spaceResources(resolved, 'reed-bank')).toMatchObject({ reed: 0 })
    expect(spaceResources(resolved, 'western-quarry')).toMatchObject({ stone: 0 })
    expect(spaceResources(resolved, 'fishing')).toMatchObject({ food: 5 })
    expect(resolved.state.players[0]!.stats.resourcesFromBoard).toMatchObject({
      wood: 2, clay: 3, reed: 1, stone: 4,
    })
    const moved = resolved.state.events.slice(beforeEventCount).filter((event) =>
      event.type === 'resource.moved' && event.sourceCardId === CARD_ID,
    )
    expect(moved).toHaveLength(4)
    expect(new Set(moved.map((event) => event.id.split(':').slice(0, -1).join(':'))).size).toBe(1)
  })

  it('leaves all resources unchanged when declined', () => {
    const session = setupFinalHarvest()
    const offered = session.performRoundEnd()
    expectChoice(offered)

    const declined = session.resolveChoice(0, '__skip__')

    expect(declined.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0, stone: 0 })
    expect(spaceResources(declined, 'forest')).toMatchObject({ wood: 2 })
    expect(spaceResources(declined, 'clay-pit')).toMatchObject({ clay: 3 })
    expect(spaceResources(declined, 'reed-bank')).toMatchObject({ reed: 1 })
    expect(spaceResources(declined, 'western-quarry')).toMatchObject({ stone: 4 })
  })

  it('does not offer an empty choice outside round fourteen or without eligible resources', () => {
    const early = setupFinalHarvest()
    early.state.round = 13
    early.loadState(early.state)
    const earlyResponse = early.performRoundEnd()
    expect(earlyResponse.interaction.stateId === 'wait' ? earlyResponse.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)

    const empty = setupFinalHarvest(false)
    const emptyResponse = empty.performRoundEnd()
    expect(emptyResponse.interaction.stateId === 'wait' ? emptyResponse.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })

  it('restores a pending choice and rejects a repeated command after accepting', () => {
    const session = setupFinalHarvest()
    const offered = session.performRoundEnd()
    const accept = expectChoice(offered)
    const snapshot = serializeSessionSnapshot(session.state, session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))

    const resolved = restored.resolveChoice(0, accept.value)
    expect(resolved.state.players[0]!.resources.wood).toBe(2)
    expect(spaceResources(resolved, 'forest').wood).toBe(0)

    const repeated = restored.resolveChoice(0, accept.value)
    expect(repeated.ok).toBe(false)
    expect(repeated.state.players[0]!.resources.wood).toBe(2)
    expect(spaceResources(repeated, 'forest').wood).toBe(0)
  })

  it('keeps separate action-space amounts separate for collect listeners', () => {
    const session = setupFinalHarvest(false)
    session.state.players[0]!.occupationPlayed.push('D146_Porter')
    session.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 2
    session.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.wood = 2
    session.loadState(session.state)

    const offered = session.performRoundEnd()
    const accept = expectChoice(offered)
    const resolved = session.resolveChoice(0, accept.value)

    expect(resolved.state.players[0]!.resources.wood).toBe(4)
    expect(resolved.state.players[0]!.resources.food).toBe(20)
  })

  it('does not combine separate action spaces for exact-amount collect listeners', () => {
    const session = setupFinalHarvest(false)
    session.state.players[0]!.occupationPlayed.push('B162_ForestClearer')
    session.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 1
    session.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.wood = 1
    session.loadState(session.state)

    const offered = session.performRoundEnd()
    const accept = expectChoice(offered)
    const resolved = session.resolveChoice(0, accept.value)

    expect(resolved.state.players[0]!.resources.wood).toBe(2)
    expect(resolved.state.players[0]!.resources.food).toBe(20)
  })

  it('undo restores both the player supply and action-space resources', () => {
    const session = setupFinalHarvest()
    const followUpEffect: CardEffect = {
      id: FOLLOW_UP_CARD,
      onBeforeHarvest: () => ({
        type: 'leaf',
        actionId: 'gain',
        params: { food: 1 },
        sourceCard: FOLLOW_UP_CARD,
        optional: true,
      }),
    }
    requireActiveCardRegistry('D098 undo test').setEffect(followUpEffect)
    session.state.players[0]!.occupationPlayed.push(FOLLOW_UP_CARD)
    session.loadState(session.state)
    const offered = session.performRoundEnd()
    expect(offered.interaction.stateId).toBe('wait')
    if (offered.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(offered.interaction.request.kind).toBe('select-trigger')
    const transactor = offered.interaction.request.options.find((option) => option.value === CARD_ID)!
    const resolved = session.resolveChoice(0, transactor.value)
    if (resolved.interaction.stateId !== 'wait') throw new Error('expected remaining trigger choice')
    expect(resolved.interaction.request.kind).toBe('select-trigger')
    expect(resolved.state.players[0]!.resources.wood).toBe(2)

    const undone = session.undoStep()

    expect(undone.ok).toBe(true)
    expect(undone.state.players[0]!.resources.wood).toBe(0)
    expect(spaceResources(undone, 'forest').wood).toBe(2)
    expect(undone.interaction.stateId).toBe('wait')
    if (undone.interaction.stateId !== 'wait') throw new Error('expected restored trigger choice')
    expect(undone.interaction.request.kind).toBe('select-trigger')
    expect(undone.interaction.request.options.some((option) => option.value === CARD_ID)).toBe(true)
  })
})
