import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { D172_PutcherMaker } from '../../shared/cards/D/D172_PutcherMaker'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'

const setupLessonsSession = (cardId: string, food = 10) => {
  const session = new GameSession(undefined, undefined, { playerCount: 4 })
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = [cardId]
  player.resources.food = food
  state.players[1]!.workersAvailable = 2
  session.loadState(state)
  return session
}

const chooseFirstNonSkipOption = (session: GameSession, playerIndex: number) => {
  const resp = session.getState()
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  expect(resp.interaction.options).toBeDefined()
  const option = resp.interaction.options.find((entry) => entry.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(playerIndex, option!.value)
}

const setupHarvestStartSession = (cardId: string) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 4
  for (const player of state.players) {
    markAllWorkersUsed(state, player)
    player.resources.food = 20
  }
  state.players[0]!.occupationPlayed.push(cardId)
  session.loadState(state)
  return session
}

const setupWorkPhaseHookSession = (cardId: string, playerCount = 5) => {
  const session = new GameSession(undefined, undefined, { playerCount })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  const player = state.players[0]!
  player.occupationPlayed.push(cardId)
  session.loadState(state)
  return session
}

const setupRoundStartHookSession = (cardId: string, playerCount = 5) => {
  const session = new GameSession(undefined, undefined, { playerCount })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 2
  const player = state.players[0]!
  player.occupationPlayed.push(cardId)
  player.resources.food = 0
  session.loadState(state)
  return session
}

const setupActionRewardSession = (cardId: string, playerCount = 6, food = 0) => {
  const session = new GameSession(undefined, undefined, { playerCount })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const player = state.players[0]!
  player.occupationPlayed.push(cardId)
  player.resources.food = food
  session.loadState(state)
  return session
}

const givePastureCattle = (session: GameSession, playerIndex: number) => {
  const state = session.getState().state
  const player = state.players[playerIndex]!
  player.pastures = [{
    id: `cattle-${playerIndex}`,
    size: 1,
    tiles: [{ row: 2, col: playerIndex }],
    stables: 0,
    animalType: 'cattle',
    animalCount: 1,
  }]
  player.resources.cattle = 1
  session.loadState(state)
}

const occupySpace = (session: GameSession, spaceId: string, playerId = 'p2') => {
  const state = session.getState().state
  const space = state.actionSpaces.find((entry) => entry.id === spaceId)
  if (!space) throw new Error(`${spaceId} missing`)
  space.takenBy = [{ playerId, workerId: `${playerId}-worker` }]
  session.loadState(state)
}

const setActionSpaceResources = (
  session: GameSession,
  spaceId: string,
  resources: Record<string, number>,
) => {
  const state = session.getState().state
  const space = state.actionSpaces.find((entry) => entry.id === spaceId)
  if (!space) throw new Error(`${spaceId} missing`)
  Object.assign(space.resources, resources)
  session.loadState(state)
}

const setStoneAccumulationSpaces = (session: GameSession, stones: Record<string, number>) => {
  const state = session.getState().state
  for (const space of state.actionSpaces) {
    if ((space.gainPerRound.stone ?? 0) > 0) {
      space.resources.stone = stones[space.id] ?? 0
    }
  }
  session.loadState(state)
}

const completeFirstPlowSelection = (session: GameSession, playerIndex = 0) => {
  const resp = session.getState()
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  expect(resp.interaction.request.kind).toBe('farm-select')
  expect(resp.interaction.farm?.farmType).toBe('plow')
  const tile = resp.interaction.farm?.selectableTiles[0]
  expect(tile).toBeTruthy()
  return session.commitSelectionChoice(playerIndex, { tile })
}

describe('Agricola 5-6 simple occupation cards', () => {
  it.each([
    ['hollow-56', 6, { vegetable: 1, grain: 0 }],
    ['hollow-56', 3, { grain: 1, vegetable: 0 }],
  ])('A175 Hollow Gardener rewards %s based on actual clay taken', (spaceId, clay, expected) => {
    const session = setupActionRewardSession('A175_HollowGardener', 6)
    setActionSpaceResources(session, spaceId, { clay })

    const resp = session.takeAction(0, spaceId)
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.clay).toBe(clay)
    expect(player.resources.grain).toBe(expected.grain)
    expect(player.resources.vegetable).toBe(expected.vegetable)
  })

  it('A175 Hollow Gardener does not reward less than 3 clay actually taken', () => {
    const session = setupActionRewardSession('A175_HollowGardener', 6)
    setActionSpaceResources(session, 'hollow-56', { clay: 2 })

    const resp = session.takeAction(0, 'hollow-56')
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.vegetable).toBe(0)
  })

  it.each(['western-quarry', 'eastern-quarry'])(
    'A179 Mountain Shepherd gives sheep after using %s',
    (spaceId) => {
      const session = setupActionRewardSession('A179_MountainShepherd', 6)
      setActionSpaceResources(session, spaceId, { stone: 1 })

      const resp = session.takeAction(0, spaceId)
      expect(resp.ok).toBe(true)

      expect(resp.state.players[0]!.resources.stone).toBe(1)
      expect(resp.state.players[0]!.resources.sheep).toBe(1)
    },
  )

  it('B174 Riverbank Gardener gives vegetable after using Riverbank Forest', () => {
    const session = setupActionRewardSession('B174_RiverbankGardener', 6)
    setActionSpaceResources(session, 'riverbank-forest-56', { wood: 1 })

    const resp = session.takeAction(0, 'riverbank-forest-56')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(1)
    expect(player.resources.reed).toBe(1)
    expect(player.resources.vegetable).toBe(1)
  })

  it.each([
    [1, { cattle: 1, boar: 0, sheep: 0 }],
    [2, { cattle: 0, boar: 1, sheep: 0 }],
    [3, { cattle: 0, boar: 0, sheep: 1 }],
  ])('B180 Game Teaser rewards exactly %i food from a food accumulation space', (food, expected) => {
    const session = setupActionRewardSession('B180_GameTeaser', 6)
    setActionSpaceResources(session, 'fishing', { food })

    const resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.food).toBe(food)
    expect(player.resources.cattle).toBe(expected.cattle)
    expect(player.resources.boar).toBe(expected.boar)
    expect(player.resources.sheep).toBe(expected.sheep)
  })

  it('B180 Game Teaser gives no reward for 4+ food or non-food accumulation food', () => {
    const fourFood = setupActionRewardSession('B180_GameTeaser', 6)
    setActionSpaceResources(fourFood, 'fishing', { food: 4 })
    let resp = fourFood.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.cattle).toBe(0)
    expect(resp.state.players[0]!.resources.boar).toBe(0)
    expect(resp.state.players[0]!.resources.sheep).toBe(0)

    const nonFoodAccumulation = setupActionRewardSession('B180_GameTeaser', 6)
    setActionSpaceResources(nonFoodAccumulation, 'forest', { food: 2 })
    resp = nonFoodAccumulation.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.boar).toBe(0)
  })

  it('C177 Mountain Hiker can buy stone after using a 5-6 extension accumulation space', () => {
    const session = setupActionRewardSession('C177_MountainHiker', 6, 2)
    setActionSpaceResources(session, 'hollow-56', { clay: 1 })

    let resp = session.takeAction(0, 'hollow-56')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = chooseFirstNonSkipOption(session, 0)

    const player = resp.state.players[0]!
    expect(player.resources.food).toBe(1)
    expect(player.resources.stone).toBe(1)
  })

  it('C177 Mountain Hiker ignores instant-gain 5-6 extension spaces', () => {
    const session = setupActionRewardSession('C177_MountainHiker', 6, 2)

    const resp = session.takeAction(0, 'resource-market-56')
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.resources.stone).toBe(1)
  })

  it.each(['farmland', 'cultivation'])(
    'C176 Cleanacre gives 2 clay after using %s',
    (spaceId) => {
      const session = setupActionRewardSession('C176_Cleanacre', 6)

      let resp = session.takeAction(0, spaceId)
      expect(resp.ok).toBe(true)
      if (spaceId === 'cultivation') {
        resp = chooseFirstNonSkipOption(session, 0)
      }
      resp = completeFirstPlowSelection(session)

      expect(resp.state.players[0]!.resources.clay).toBe(2)
    },
  )

  it('C176 Cleanacre triggers only once when Farming Supplies resolves both branches', () => {
    const session = setupActionRewardSession('C176_Cleanacre', 6, 3)

    let resp = session.takeAction(0, 'farm-supplies-6')
    expect(resp.ok).toBe(true)
    const plowOption = resp.interaction.options?.find((option) =>
      JSON.stringify(option.descriptionPreview).includes('actions.plow.name'),
    )
    expect(plowOption).toBeTruthy()
    resp = session.resolveChoice(0, plowOption!.value)
    resp = completeFirstPlowSelection(session)
    const grainOption = resp.interaction.options?.find((option) =>
      JSON.stringify(option.effectPreview).includes('"grain":1'),
    )
    expect(grainOption).toBeTruthy()
    resp = session.resolveChoice(0, grainOption!.value)

    const player = resp.state.players[0]!
    expect(player.resources.clay).toBe(2)
    expect(player.resources.grain).toBe(1)
    expect(player.resources.food).toBe(1)
  })

  it('D174 Loess Gardener can buy vegetable after using Clay Pit only', () => {
    const session = setupActionRewardSession('D174_LoessGardener', 6, 2)
    setActionSpaceResources(session, 'clay-pit', { clay: 1 })

    let resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = chooseFirstNonSkipOption(session, 0)

    const player = resp.state.players[0]!
    expect(player.resources.food).toBe(1)
    expect(player.resources.clay).toBe(1)
    expect(player.resources.vegetable).toBe(1)
  })

  it('D174 Loess Gardener does not trigger after using Hollow', () => {
    const session = setupActionRewardSession('D174_LoessGardener', 6, 2)
    setActionSpaceResources(session, 'hollow-56', { clay: 1 })

    const resp = session.takeAction(0, 'hollow-56')
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('C174 Stone Custodian gives grain when exactly one stone accumulation space has stone left', () => {
    const session = setupWorkPhaseHookSession('C174_StoneCustodian', 5)
    setStoneAccumulationSpaces(session, { 'western-quarry': 1 })
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'C174_StoneCustodian', 'onBeforeReturnHome')

    expect(flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { grain: 1 },
      sourceCard: 'C174_StoneCustodian',
    })
  })

  it('C174 Stone Custodian gives vegetable when at least two stone accumulation spaces have stone left', () => {
    const session = setupWorkPhaseHookSession('C174_StoneCustodian', 5)
    setStoneAccumulationSpaces(session, { 'western-quarry': 1, 'eastern-quarry': 1 })
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'C174_StoneCustodian', 'onBeforeReturnHome')

    expect(flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { vegetable: 1 },
      sourceCard: 'C174_StoneCustodian',
    })
  })

  it('C174 Stone Custodian ignores stone on non-stone accumulation spaces', () => {
    const session = setupWorkPhaseHookSession('C174_StoneCustodian', 5)
    setStoneAccumulationSpaces(session, {})
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'resource-market-56')!.resources.stone = 1
    session.loadState(state)
    const updatedState = session.getState().state
    const player = updatedState.players[0]!

    const flow = runCardEffectHook(updatedState, player, 'C174_StoneCustodian', 'onBeforeReturnHome')

    expect(flow).toBeNull()
  })

  it.each([
    [3, 1],
    [4, 2],
    [5, 3],
  ])('B172 Cattle Caregiver gives %i cattle owners %i food at round start', (cattleOwners, food) => {
    const session = setupRoundStartHookSession('B172_CattleCaregiver', 5)
    for (let index = 0; index < cattleOwners; index += 1) {
      givePastureCattle(session, index)
    }
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'B172_CattleCaregiver', 'onRoundStart')

    expect(flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { food },
      sourceCard: 'B172_CattleCaregiver',
    })
  })

  it('B172 Cattle Caregiver ignores cattle counters that are not in a valid holding zone', () => {
    const session = setupRoundStartHookSession('B172_CattleCaregiver', 5)
    givePastureCattle(session, 0)
    givePastureCattle(session, 1)
    givePastureCattle(session, 2)
    const state = session.getState().state
    state.players[3]!.resources.cattle = 1
    session.loadState(state)
    const updatedState = session.getState().state
    const player = updatedState.players[0]!

    const flow = runCardEffectHook(updatedState, player, 'B172_CattleCaregiver', 'onRoundStart')

    expect(flow).toMatchObject({ type: 'leaf', params: { food: 1 } })
  })

  it('A172 Boat Painter offers grain or food when Fishing and 5-6 Traveling Players are occupied', () => {
    const session = setupWorkPhaseHookSession('A172_BoatPainter', 5)
    occupySpace(session, 'fishing')
    occupySpace(session, 'traveling-players-56')
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'A172_BoatPainter', 'onBeforeReturnHome')

    expect(flow).toMatchObject({
      type: 'xor',
      children: [
        { type: 'leaf', actionId: 'gain', params: { grain: 1 }, sourceCard: 'A172_BoatPainter' },
        { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: 'A172_BoatPainter' },
      ],
    })
  })

  it('A172 Boat Painter does not trigger when only Fishing is occupied', () => {
    const session = setupWorkPhaseHookSession('A172_BoatPainter', 5)
    occupySpace(session, 'fishing')
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'A172_BoatPainter', 'onBeforeReturnHome')

    expect(flow).toBeNull()
  })

  it('A172 Boat Painter also counts the base Traveling Players space', () => {
    const session = setupWorkPhaseHookSession('A172_BoatPainter', 4)
    occupySpace(session, 'fishing')
    occupySpace(session, 'traveling-players')
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'A172_BoatPainter', 'onBeforeReturnHome')

    expect(flow).toMatchObject({ type: 'xor' })
  })

  it('D172 Putcher Maker can exchange multiple reed for food through the anytime exchange action', () => {
    const session = setupLessonsSession('A176_Wheelmaker')
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['D172_PutcherMaker']
    player.resources.reed = 3
    player.resources.food = 0
    session.loadState(state)

    expect(session.takeAction(0, 'farmland').ok).toBe(true)
    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('choice')

    resp = session.resolveChoice(0, 'bulk:0=2')
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.reed).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(4)
  })

  it('C178 On-Site Reverend lets the player choose one building resource at harvest start', () => {
    const session = setupHarvestStartSession('C178_OnSiteReverend')

    let resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const options = resp.interaction.options?.filter((option) => option.sourceCard === 'C178_OnSiteReverend')
    expect(options).toHaveLength(4)

    resp = session.resolveChoice(0, options![3]!.value)
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.stone).toBe(1)
  })

  it('A176 Wheelmaker tops up wood to 15 when another occupation is in play and the player has more wood than all others combined', () => {
    const session = setupLessonsSession('A176_Wheelmaker')
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['A114_SeasonalWorker']
    player.resources.wood = 12
    state.players[1]!.resources.wood = 11
    session.loadState(state)

    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.occupationPlayed).toContain('A176_Wheelmaker')
    expect(updatedPlayer.resources.wood).toBe(15)
  })

  it('A176 Wheelmaker does not trigger without another occupation already in play', () => {
    const session = setupLessonsSession('A176_Wheelmaker')
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 12

    const flow = runCardEffectHook(state, player, 'A176_Wheelmaker', 'onBuy')

    expect(flow).toBeNull()
  })

  it('A176 Wheelmaker does not trigger on a wood tie with all other players combined', () => {
    const session = setupLessonsSession('A176_Wheelmaker')
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['A114_SeasonalWorker']
    player.resources.wood = 12
    state.players[1]!.resources.wood = 12

    const flow = runCardEffectHook(state, player, 'A176_Wheelmaker', 'onBuy')

    expect(flow).toBeNull()
  })

  it('D177 Graduate lets the player pay 1 food for 2 stone and 2 reed when played', () => {
    const session = setupLessonsSession('D177_Graduate', 3)

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    resp = chooseFirstNonSkipOption(session, 0)
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.occupationPlayed).toContain('D177_Graduate')
    expect(player.resources.food).toBe(2)
    expect(player.resources.stone).toBe(2)
    expect(player.resources.reed).toBe(2)
  })

  it('D177 Graduate has no on-play reward when the player cannot pay food', () => {
    const session = setupLessonsSession('D177_Graduate', 0)
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'D177_Graduate', 'onBuy')

    expect(flow).toBeNull()
  })

  it('D172 Putcher Maker exposes an unlimited anytime reed to food exchange', () => {
    expect(D172_PutcherMaker.exchanges).toEqual([
      { from: { reed: 1 }, to: { food: 2 }, triggers: ['anytime'] },
    ])
  })
})
