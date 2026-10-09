import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'

import { markAllWorkersUsed } from '../../shared/domain/player'
import '../../shared/cards/B/B070_NewPurchase'
import '../../shared/cards/B/B081_Handcart'
import '../../shared/cards/C/C093_InnerDistrictsDirector'
import '../../shared/cards/C/C125_Nightworker'
import '../../shared/cards/E/E056_RomanPot'
import '../../shared/cards/E/E100_MuseumCaretaker'
import '../../shared/cards/A/A166_Haydryer'
import '../../shared/cards/A/A064_BarleyMill'
import '../../shared/cards/C/C071_Slurry'
import '../../shared/cards/C/C120_AgriculturalLabourer'
import '../../shared/cards/C/C107_Baker'
import '../../shared/cards/D/D099_EarthenwarePotter'
import '../../shared/cards/D/D115_FodderPlanter'
import '../../shared/cards/D/D167_PureBreeder'
import '../../shared/cards/E/E052_Cubbyhole'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getStoredResource, setStoredResource } from '../../shared/cards/helpers/card-storage'

const chooseFirstOption = (session: GameSession, playerIndex: number) => {
  const interaction = session.getState().interaction
  expect(interaction.stateId).toBe('wait')
  if (interaction.stateId !== 'wait') {
    throw new Error('expected pending choice')
  }
  const options = interaction.request.options ?? []
  return session.resolveChoice(playerIndex, options[0]!.value)
}

const setupBeforeWorkOrderingSession = () => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 1
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
  })

  const player = state.players[0]!
  player.occupationPlayed.push('E100_MuseumCaretaker', 'C125_Nightworker')
  Object.assign(player.resources, {
    wood: 0,
    clay: 1,
    reed: 1,
    stone: 1,
    grain: 1,
    vegetable: 1,
  })
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  forest.resources.wood = 3
  forest.takenBy = []
  session.loadState(state)
  return session
}

describe('stage hook flows', () => {
  it('resumes start-of-feeding hooks without replaying harvest hooks', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 4
    })

    const baker = state.players[0]!
    baker.occupationPlayed.push('C107_Baker')
    baker.resources.grain = 1
    const cubbyhole = state.players[1]!
    cubbyhole.minorPlayed.push('E052_Cubbyhole')
    setStoredResource(cubbyhole, 'E052_Cubbyhole', 'food', 3)

    session.loadState(state)
    const resp = session.performRoundEnd()

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(5)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.players[1]!.resources.food).toBe(3)
    expect(getStoredResource(resp.state.players[1]!, 'E052_Cubbyhole', 'food')).toBe(3)
    expect(resp.state.events.filter((event) =>
      event.type === 'harvest.phaseStarted' && event.harvestPhase === 'feeding',
    )).toHaveLength(1)
  })

  it('resumes onBeforeWork without replaying preparation', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.minorPlayed.push('B081_Handcart')
    const forest = state.actionSpaces.find((space) => space.id === 'forest')!
    forest.resources.wood = 6

    session.loadState(state)
    let resp = session.performRoundEnd()

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined)
      .toBe('B081_Handcart')
    expect(resp.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(9)

    resp = session.resolveChoice(0, '__skip__')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(2)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(9)
    expect(resp.state.events.filter((event) => event.type === 'round.started')).toHaveLength(1)
    expect(resp.state.events.filter((event) => event.type === 'work.started' && event.round === 2)).toHaveLength(1)
    expect(resp.state.log.filter((entry) => entry.key === 'log.enterRound')).toHaveLength(1)
    expect(resp.state.log.filter((entry) => entry.key === 'log.workStarted')).toHaveLength(2)
  })

  it('resolves before-work cards before start-of-work cards', () => {
    const session = setupBeforeWorkOrderingSession()

    let resp = session.performRoundEnd()

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined)
      .toBe('C125_Nightworker')
    expect(resp.state.roundPhase).toBe('preparation')
    expect(resp.state.players[0]!.cardStates.E100_MuseumCaretaker?.counters?.bonusVp ?? 0).toBe(0)

    resp = chooseFirstOption(session, 0)

    const player = resp.state.players[0]!
    const forest = resp.state.actionSpaces.find((space) => space.id === 'forest')!
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(2)
    expect(resp.state.roundPhase).toBe('work')
    expect(player.resources.wood).toBe(6)
    expect(forest.resources.wood).toBe(0)
    expect(forest.takenBy).toEqual([expect.objectContaining({ playerId: player.id })])
    expect(player.cardStates.E100_MuseumCaretaker?.counters?.bonusVp).toBe(1)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        sourceCardId: 'C125_Nightworker',
        from: { kind: 'actionSpace', spaceId: 'forest' },
        to: { kind: 'player', playerId: player.id },
      }),
      expect.objectContaining({
        type: 'card.stateChanged',
        cardId: 'E100_MuseumCaretaker',
        key: 'bonusVp',
      }),
    ]))
    expect(resp.state.events.filter((event) => event.type === 'round.started')).toHaveLength(1)
    expect(resp.state.events.filter((event) => event.type === 'work.started' && event.round === 2)).toHaveLength(1)
    expect(resp.state.log.filter((entry) => entry.key === 'log.enterRound')).toHaveLength(1)
    expect(resp.state.log.filter((entry) => entry.key === 'log.workStarted')).toHaveLength(2)
    expect(resp.scores[0]!.categories.find((category) => category.key === 'cardBonusVp')?.total).toBe(1)
  })

  it('does not trigger start-of-work prerequisites when before-work is skipped', () => {
    const session = setupBeforeWorkOrderingSession()

    session.performRoundEnd()
    const resp = session.resolveChoice(0, '__skip__')

    const player = resp.state.players[0]!
    const forest = resp.state.actionSpaces.find((space) => space.id === 'forest')!
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.roundPhase).toBe('work')
    expect(player.resources.wood).toBe(0)
    expect(forest.resources.wood).toBe(6)
    expect(forest.takenBy).toEqual([])
    expect(player.cardStates.E100_MuseumCaretaker?.counters?.bonusVp ?? 0).toBe(0)
    expect(resp.scores[0]!.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0).toBe(0)
  })

  it('freezes round work order before before-work marker changes', () => {
    const session = new GameSession(42, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 3)
    state.round = 1
    state.players.forEach((player, index) => {
      markAllWorkersUsed(state, player)
      player.startPlayer = index === 1
    })

    const originalFirstPlayer = state.players[1]!
    const beforeWorkPlayer = state.players[2]!
    beforeWorkPlayer.occupationPlayed.push('C125_Nightworker', 'C093_InnerDistrictsDirector')
    Object.assign(beforeWorkPlayer.resources, { wood: 0, clay: 1, reed: 1, stone: 1 })
    const forest = state.actionSpaces.find((space) => space.id === 'forest')!
    forest.resources.wood = 3
    forest.takenBy = []

    const frozenLastPlayer = state.players[0]!
    const physicalLastPlayer = state.players[2]!
    for (const player of [frozenLastPlayer, physicalLastPlayer]) {
      player.minorPlayed.push('E056_RomanPot')
      player.cardStates.E056_RomanPot = {
        extraData: { foodCount: 4 },
        infobox: '4 Food',
      }
    }
    const frozenLastFood = frozenLastPlayer.resources.food
    const physicalLastFood = physicalLastPlayer.resources.food

    session.loadState(state)
    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined)
      .toBe('C125_Nightworker')

    resp = chooseFirstOption(session, 2)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.options?.map((option) => option.value) : [])
      .toContain('forest')
    resp = session.resolveChoice(2, 'forest')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined)
      .toBe('C093_InnerDistrictsDirector')

    resp = chooseFirstOption(session, 2)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined)
      .toBe('C093_InnerDistrictsDirector')
    resp = chooseFirstOption(session, 2)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.options?.map((option) => option.value) : [])
      .toContain('meeting-place')
    resp = session.resolveChoice(2, 'meeting-place')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(2)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.roundFirstPlayerId).toBe(originalFirstPlayer.id)
    expect(resp.state.currentPlayerIndex).toBe(1)
    expect(resp.state.players.find((player) => player.startPlayer)?.id).toBe(beforeWorkPlayer.id)
    expect(resp.state.players[0]!.resources.food).toBe(frozenLastFood + 1)
    expect(resp.state.players[2]!.resources.food).toBe(physicalLastFood)
    expect(resp.state.players[0]!.cardStates.E056_RomanPot?.extraData?.foodCount).toBe(3)
    expect(resp.state.players[2]!.cardStates.E056_RomanPot?.extraData?.foodCount).toBe(4)

    const markerEvent = resp.state.events.find((event) => event.type === 'startPlayer.changed')
    const romanPotEvent = resp.state.events.find((event) =>
      event.type === 'resource.moved' && event.sourceCardId === 'E056_RomanPot')
    expect(markerEvent).toMatchObject({ type: 'startPlayer.changed', playerId: beforeWorkPlayer.id })
    expect(romanPotEvent).toMatchObject({
      type: 'resource.moved',
      sourceCardId: 'E056_RomanPot',
      to: { kind: 'player', playerId: frozenLastPlayer.id },
    })
    expect(markerEvent!.seq).toBeLessThan(romanPotEvent!.seq)
    expect(resp.state.events.filter((event) => event.type === 'round.started')).toHaveLength(1)
    expect(resp.state.events.filter((event) => event.type === 'work.started' && event.round === 2)).toHaveLength(1)
    expect(resp.state.log.filter((entry) => entry.key === 'log.enterRound')).toHaveLength(1)
    expect(resp.state.log.filter((entry) => entry.key === 'log.workStarted')).toHaveLength(2)

    const roundTwoScores = resp.scores
    session.state.players.forEach((player) => {
      markAllWorkersUsed(session.state, player)
    })
    resp = session.performRoundEnd()

    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(3)
    expect(resp.state.roundFirstPlayerId).toBe(beforeWorkPlayer.id)
    expect(resp.state.currentPlayerIndex).toBe(2)
    expect(resp.scores).toEqual(roundTwoScores)
  })

  it('runs B070_NewPurchase through before-start-of-turn flow', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 3
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.minorPlayed.push('B070_NewPurchase')
    player.resources.food = 6

    session.loadState(state)
    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionNewPurchaseGrain')

    resp = chooseFirstOption(session, 0)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionNewPurchaseVegetable')

    resp = chooseFirstOption(session, 0)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(4)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(readCardResourceStats(resp.state.players[0]!, 'B070_NewPurchase')).toMatchObject({
      paid: { food: 6 },
      gained: { grain: 1, vegetable: 1 },
    })
  })

  it('runs A166_Haydryer through before-harvest flow', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.occupationPlayed.push('A166_Haydryer')
    player.resources.food = 10
    player.pastures = [
      {
        id: 'p1',
        size: 2,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    session.loadState(state)
    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionHaydryer')

    resp = chooseFirstOption(session, 0)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'cattle', animalCount: 1 },
    ])

    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.players[0]!.resources.food).toBe(3)
    expect(resp.state.players[0]!.resources.cattle).toBe(1)
    expect(readCardResourceStats(resp.state.players[0]!, 'A166_Haydryer')).toMatchObject({
      paid: { food: 3 },
      gained: { cattle: 1 },
    })
  })

  it('makes A166_Haydryer mandatory when four pastures reduce its cost to zero', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })
    const player = state.players[0]!
    player.occupationPlayed = ['A166_Haydryer']
    player.resources.food = 0
    player.pastures = Array.from({ length: 4 }, (_, index) => ({
      id: `pasture-${index}`,
      size: 1,
      tiles: [{ row: index, col: 0 }],
      stables: 0,
      animalType: null,
      animalCount: 0,
    }))
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.players[0]!.resources.cattle).toBe(1)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.kind).toBe('animal-reorg')
  })

  it('runs D099_EarthenwarePotter through after-harvest flow on round 14', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 14
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.occupationPlayed.push('D099_EarthenwarePotter')
    player.resources.food = 10
    player.resources.clay = 2
    player.cardStates = {
      ...player.cardStates,
      D099_EarthenwarePotter: { counters: { earlyBuy: 1 } },
    }

    session.loadState(state)
    const resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('gameover')
    expect(resp.state.gameOver).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.state.players[0]!.cardStates?.D099_EarthenwarePotter?.counters?.bonusVp).toBe(2)
    expect(readCardResourceStats(resp.state.players[0]!, 'D099_EarthenwarePotter')).toMatchObject({
      paid: { clay: 2 },
      gained: {},
    })
  })

  it('runs A064_BarleyMill through after-reap flow', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.minorPlayed.push('A064_BarleyMill')
    player.resources.food = 10
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
    ]

    session.loadState(state)
    const resp = session.performRoundEnd()

    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(5)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.players[0]!.resources.food).toBe(8)
    expect(resp.state.players[0]!.resources.grain).toBe(2)
    expect(readCardResourceStats(resp.state.players[0]!, 'A064_BarleyMill')).toMatchObject({
      paid: {},
      gained: { food: 2 },
    })

    const gainLog = resp.state.log.find(
      (entry) =>
        entry.key === 'log.cardEffectGain' &&
        entry.params?.cardId === 'A064_BarleyMill',
    )
    expect(gainLog?.params?.gain).toEqual({ food: 2 })
  })

  it('runs C120_AgriculturalLabourer through after-reap flow', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.occupationPlayed.push('C120_AgriculturalLabourer')
    player.resources.food = 10
    player.cardStates = {
      ...player.cardStates,
      C120_AgriculturalLabourer: { counters: { clay: 3 } },
    }
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
    ]

    session.loadState(state)
    const resp = session.performRoundEnd()

    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(5)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.players[0]!.resources.food).toBe(6)
    expect(resp.state.players[0]!.resources.grain).toBe(2)
    expect(resp.state.players[0]!.resources.clay).toBe(2)
    expect(resp.state.players[0]!.cardStates?.C120_AgriculturalLabourer?.counters?.clay).toBe(1)

    const gainLog = resp.state.log.find(
      (entry) =>
        entry.key === 'log.cardEffectGain' &&
        entry.params?.cardId === 'C120_AgriculturalLabourer',
    )
    expect(gainLog?.params?.gain).toEqual({ clay: 2 })
  })

  it('runs C071_Slurry through end-harvest sow flow after multi-animal breeding', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.minorPlayed.push('C071_Slurry')
    player.resources.food = 10
    player.resources.grain = 1
    player.resources.sheep = 2
    player.resources.boar = 2
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    player.pastures = [
      {
        id: 'p1',
        size: 2,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        stables: 0,
        animalType: 'sheep',
        animalCount: 2,
      },
      {
        id: 'p2',
        size: 2,
        tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }],
        stables: 0,
        animalType: 'boar',
        animalCount: 2,
      },
    ]

    session.loadState(state)
    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: 3 },
      { id: 'p2', zoneType: 'pasture', animalType: 'boar', animalCount: 3 },
    ])
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionSlurrySow')

    resp = chooseFirstOption(session, 0)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionSowSelect')
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.farm.farmType : undefined)
      .toBe('sow')

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })

    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(5)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.players[0]!.resources.food).toBe(6)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.sheep).toBe(3)
    expect(resp.state.players[0]!.resources.boar).toBe(3)
    expect(resp.state.players[0]!.fields).toContainEqual({
      row: 0,
      col: 0,
      stacks: [{ kind: 'grain', remaining: 3 }],
    })
  })

  it('runs D115_FodderPlanter through multi-sow flow based on newborn count', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.occupationPlayed.push('D115_FodderPlanter')
    player.resources.food = 10
    player.resources.grain = 2
    player.resources.sheep = 2
    player.resources.boar = 2
    player.fields = [
      { row: 0, col: 0, stacks: [] },
      { row: 0, col: 1, stacks: [] },
    ]
    player.pastures = [
      {
        id: 'p1',
        size: 2,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        stables: 0,
        animalType: 'sheep',
        animalCount: 2,
      },
      {
        id: 'p2',
        size: 2,
        tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }],
        stables: 0,
        animalType: 'boar',
        animalCount: 2,
      },
    ]

    session.loadState(state)
    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: 3 },
      { id: 'p2', zoneType: 'pasture', animalType: 'boar', animalCount: 3 },
    ])
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionFodderPlanterSow')

    resp = chooseFirstOption(session, 0)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionSowSelect')
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.farm.farmType : undefined)
      .toBe('sow')
    expect(resp.interaction.stateId === 'wait' && resp.interaction.request.farm.farmType === 'sow'
      ? resp.interaction.request.farm.maxSelections
      : undefined).toBe(2)

    resp = session.commitSelectionChoice(0, {
      crops: [
        { row: 0, col: 0, crop: 'grain' },
        { row: 0, col: 1, crop: 'grain' },
      ],
    })

    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(5)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.players[0]!.resources.food).toBe(6)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.sheep).toBe(3)
    expect(resp.state.players[0]!.resources.boar).toBe(3)
    expect(resp.state.players[0]!.fields).toEqual([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] },
    ])
  })

  it('limits D115_FodderPlanter sow count to the number of newborn animals', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.occupationPlayed.push('D115_FodderPlanter')
    player.resources.food = 10
    player.resources.grain = 2
    player.resources.sheep = 2
    player.fields = [
      { row: 0, col: 0, stacks: [] },
      { row: 0, col: 1, stacks: [] },
    ]
    player.pastures = [
      {
        id: 'p1',
        size: 3,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }],
        stables: 0,
        animalType: 'sheep',
        animalCount: 2,
      },
    ]

    session.loadState(state)
    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: 3 },
    ])
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionFodderPlanterSow')

    resp = chooseFirstOption(session, 0)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' && resp.interaction.request.farm.farmType === 'sow'
      ? resp.interaction.request.farm.maxSelections
      : undefined).toBe(1)

    // Sowing within the 1-newborn cap succeeds. (Note: PR 3 unified the sow
    // commit onto resolveChoice; an over-cap submission now clears pending,
    // so we no longer assert a fail-then-retry path here — the limit is
    // already exercised by maxSelections in the validator unit tests.)
    resp = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.players[0]!.fields).toContainEqual({
      row: 0,
      col: 0,
      stacks: [{ kind: 'grain', remaining: 3 }],
    })
  })

  it('does not let D167 non-harvest breeding write D115 harvest breeding summary', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.occupationPlayed.push('D167_PureBreeder', 'D115_FodderPlanter')
    player.resources.food = 10
    player.resources.grain = 1
    player.resources.sheep = 2
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    player.pastures = [
      {
        id: 'p1',
        size: 3,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }],
        stables: 0,
        animalType: 'sheep',
        animalCount: 2,
      },
    ]

    session.loadState(state)
    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionFlowSelect')

    resp = chooseFirstOption(session, 0)

    expect(resp.state.players[0]!.resources.sheep).toBe(3)
    expect(resp.state.harvestBreedSummary).toBeUndefined()
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(2)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.players[0]!.fields).toEqual([{ row: 0, col: 0, stacks: [] }])
  })
})
