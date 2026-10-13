import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A096_TaskArtisan'
import '../../shared/cards/A/A030_BakingSheet'
import '../../shared/cards/A/A067_CornScoop'

const CARD_ID = 'A096_TaskArtisan'
const MINOR_ID = 'A030_BakingSheet'
const OTHER_MINOR_ID = 'A067_CornScoop'
const PALISADES = 'B030_WoodPalisades'
const MILK_JUG = 'A050_MilkJug'
const FURNITURE_STALL = 'Major_Moor_FurnitureStall'
const SWIMMING_CLASS = 'A035_SwimmingClass'
const FILLER = '__test_placeholder__'

const setup = ({ played = false, round = 1, withMinors = true } = {}) => {
  const session = createWorkSession({ seed: 5096, options: { playerCount: 2 } })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    player.resources.wood = 0
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.minorHand = withMinors ? [MINOR_ID, OTHER_MINOR_ID] : [FILLER]
  owner.fields = []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  return resolveTriggerIfPresent(session, response, CARD_ID)
}

const chooseTaskArtisanMinor = (session: GameSession, response: SessionResponse) => {
  response = resolveTriggerIfPresent(session, response, CARD_ID)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, accept!.value)

  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.options?.map((option) => option.value)).toContain(MINOR_ID)
  expect(response.interaction.request.options?.some((option) => option.value.startsWith('Major_'))).toBe(false)
  response = session.resolveChoice(response.interaction.playerIndex, MINOR_ID)
  if (response.interaction.stateId === 'wait'
    && response.interaction.sourceCard === CARD_ID
    && response.interaction.request.options?.some((option) => option.value === '__skip__')) {
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
  }
  return response
}

const declineTaskArtisanMinor = (session: GameSession, response: SessionResponse) => {
  response = resolveTriggerIfPresent(session, response, CARD_ID)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)
  return session.resolveChoice(response.interaction.playerIndex, '__skip__')
}

const revealNextRound = (session: GameSession, revealed: string) => {
  const state = session.getState().state
  state.roundActionOrder[state.round] = revealed
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session.performRoundEnd()
}

const setupNestedReaction = (revealed: string): GameSession => createWorkSession({
  seed: 5096,
  options: { playerCount: 2 },
  configure(state) {
    state.round = 6
    const priorSlot = state.roundActionOrder.indexOf(revealed)
    if (priorSlot >= 0) state.roundActionOrder[priorSlot] = state.roundActionOrder[6] ?? null
    state.roundActionOrder[6] = revealed
    for (const player of state.players) {
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      Object.assign(player.resources, { food: 0, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0 })
    }
    state.players[0]!.occupationPlayed = [CARD_ID]
    state.players[0]!.minorHand = [PALISADES]
    const forest = state.actionSpaces.find(space => space.id === 'forest')
    if (!forest) throw new Error('Expected the Forest accumulation space')
    forest.resources.wood = 3
  },
})

const finishNestedReactionRound = (session: GameSession): SessionResponse => {
  let response = session.getState()
  for (const [actor, action] of [[0, 'grain-seeds'], [1, 'reed-bank'], [0, 'forest'], [1, 'clay-pit']] as const) {
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
      response = session.resolveChoice(response.interaction.request.fromPlayerIndex, 'confirm')
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.interaction.stateId).toBe('idle')
    response = session.takeAction(actor, action)
    expect(response.ok, response.error).toBe(true)
  }
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'confirm-next-player') {
    throw new Error('Expected the final round-six placement confirmation')
  }
  response = session.resolveChoice(response.interaction.request.fromPlayerIndex, 'confirm')
  expect(response.ok, response.error).toBe(true)
  return response
}

const setupFurnitureStallReaction = (minor = MILK_JUG): GameSession => createWorkSession({
  seed: 4242,
  options: { playerCount: 2, enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true },
  configure(state) {
    state.round = 6
    state.roundActionOrder[6] = 'western-quarry'
    for (const player of state.players) {
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, fuel: 0 })
      markAllWorkersUsed(state, player)
    }
    const owner = state.players[0]!
    owner.occupationPlayed = [CARD_ID]
    owner.minorHand = [minor]
    owner.improvements = [FURNITURE_STALL]
    const quarry = state.actionSpaces.find(space => space.id === 'western-quarry')
    if (!quarry) throw new Error('Expected the Western Quarry accumulation space')
    quarry.resources.stone = 0
  },
})

const finishFurnitureStallReaction = (session: GameSession, response: SessionResponse): SessionResponse => {
  if (response.interaction.stateId === 'wait') {
    expect(response.interaction.request.kind).toBe('select-trigger')
    expect(response.interaction.request.options?.find(option => option.value === '__pass__')?.disabled).not.toBe(true)
    response = session.resolveChoice(0, '__pass__')
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.state.round).toBe(7)
  expect(response.state.roundPhase).toBe('work')
  expect(response.interaction.stateId).toBe('idle')
  return response
}

describe('A096 Task Artisan parity', () => {
  it('A096 S1: playing Task Artisan gains one wood and the Minor Improvement action may be declined', () => {
    const session = setup()

    const response = declineTaskArtisanMinor(session, playOccupation(session))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.minorHand).toContain(MINOR_ID)
  })

  it('A096 S2: the action granted on play can build a Minor Improvement but offers no major', () => {
    const session = setup()

    const response = chooseTaskArtisanMinor(session, playOccupation(session))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.minorPlayed).toContain(MINOR_ID)
  })

  it('A096 S3: revealing Western Quarry gains one wood and offers a Minor Improvement action', () => {
    const session = setup({ played: true, round: 6 })

    const response = chooseTaskArtisanMinor(session, revealNextRound(session, 'western-quarry'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(7)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.minorPlayed).toContain(MINOR_ID)
  })

  it('A096 S4: revealing Eastern Quarry gains one wood even when the optional action is declined', () => {
    const session = setup({ played: true, round: 12 })

    const response = declineTaskArtisanMinor(session, revealNextRound(session, 'eastern-quarry'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(13)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.minorHand).toContain(MINOR_ID)
  })

  it('A096 S5: revealing a non-stone accumulation space grants neither wood nor an improvement action', () => {
    const session = setup({ played: true, round: 5 })

    const response = revealNextRound(session, 'vegetable-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })

  // The generic nested-optional window needs a Session boundary: real round
  // progression, mandatory pass rejection and live payment share one cursor.
  it('A096 S6: retains grain conversion without allowing the mandatory Quarry wood reward to be passed', () => {
    const session = setupNestedReaction('western-quarry')
    try {
      let response = finishNestedReactionRound(session)
      expect(response.state.round).toBe(7)
      expect(response.state.roundPhase).toBe('preparation')
      expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 3, grain: 1 })
      expect(response.interaction.stateId).toBe('wait')
      if (response.interaction.stateId !== 'wait') throw new Error('Expected the mandatory Quarry reaction')
      expect(response.interaction.request.kind).toBe('select-trigger')
      expect(response.interaction.request.options?.find(option => option.value === '__pass__')?.disabled).toBe(true)
      const exchange = response.interaction.request.options?.find(option => option.labelKey === 'actions.exchange.name')
      expect(exchange?.disabled).not.toBe(true)
      if (!exchange) throw new Error('Expected conversion beside the nested optional improvement')

      const beforePass = session.getState()
      const rejected = session.resolveChoice(0, '__pass__')
      expect(rejected.ok).toBe(false)
      expect(rejected.state).toEqual(beforePass.state)
      expect(rejected.interaction).toEqual(beforePass.interaction)
      expect(rejected.scores).toEqual(beforePass.scores)

      response = session.resolveChoice(0, exchange.value)
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.stateId !== 'wait') throw new Error('Expected basic grain conversion')
      const grain = response.interaction.request.options?.find(option => option.effectPreview?.kind === 'resourceExchange'
        && option.effectPreview.resourcesPaid?.grain === 1 && option.effectPreview.resourcesGained?.food === 1)
      if (!grain) throw new Error('Expected one grain to convert to one food')
      response = session.resolveChoice(0, `bulk:${grain.value.split(':')[1]}=1`)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 3, grain: 0 })
      if (response.interaction.stateId !== 'wait') throw new Error('Expected the retained Quarry reaction')
      expect(response.interaction.request.options?.find(option => option.value === '__pass__')?.disabled).toBe(true)

      response = resolveTriggerIfPresent(session, response, CARD_ID)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.wood).toBe(4)
      if (response.interaction.stateId !== 'wait') throw new Error('Expected the optional minor improvement')
      const accept = response.interaction.request.options?.find(option => !option.disabled
        && !['__skip__', '__pass__', '__done__'].includes(option.value))
      if (!accept) throw new Error('Expected the now-payable minor improvement action')
      response = session.resolveChoice(0, accept.value)
      expect(response.ok, response.error).toBe(true)
      if (!response.state.players[0]!.minorPlayed.includes(PALISADES)) {
        if (response.interaction.stateId !== 'wait') throw new Error('Expected the minor improvement hand')
        expect(response.interaction.request.options?.find(option => option.value === PALISADES)?.disabled).not.toBe(true)
        response = session.resolveChoice(0, PALISADES)
        expect(response.ok, response.error).toBe(true)
      }
      expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 4, grain: 0 })
      expect(response.state.players[0]!.minorPlayed).toEqual([PALISADES])
      expect(response.state.events.filter(event => event.type === 'action.revealed'
        && event.actionId === 'western-quarry' && event.roundSlot === 7)).toHaveLength(1)
      expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID
        && event.resources.wood === 1)).toHaveLength(1)
      expect(response.state.events.filter(event => event.type === 'resource.paid'
        && event.sourceCardId === PALISADES && event.resources.food === 1)).toHaveLength(1)
      expect(response.state.events.filter(event => event.type === 'card.played' && event.cardId === PALISADES)).toHaveLength(1)
      expect(response.state.roundPhase).toBe('work')
      expect(response.interaction.stateId).toBe('idle')
    } finally {
      session.dispose()
    }
  })

  it('A096 S7: revealing another round card does not capture a conversion or Task Artisan source', () => {
    const session = setupNestedReaction('vegetable-seeds')
    try {
      const response = finishNestedReactionRound(session)
      expect(response.state.round).toBe(7)
      expect(response.state.roundPhase).toBe('work')
      expect(response.interaction.stateId).toBe('idle')
      expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 3, grain: 1 })
      expect(response.state.players[0]!.minorHand).toEqual([PALISADES])
      expect(response.state.players[0]!.minorPlayed).toEqual([])
      expect(response.state.events.filter(event => event.type === 'action.revealed'
        && event.actionId === 'vegetable-seeds' && event.roundSlot === 7)).toHaveLength(1)
      expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)).toEqual([])
      expect(response.state.events.filter(event => event.type === 'resource.exchanged')).toEqual([])
      expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === PALISADES)).toEqual([])
    } finally {
      session.dispose()
    }
  })

  // The newly granted wood is the only Furniture Stall input. The internal
  // optional purchase must survive until its owner can convert that reward.
  it('A096 S8: restores the optional minor purchase after converting its Quarry wood reward into clay', () => {
    const session = setupFurnitureStallReaction()
    let restored: GameSession | undefined
    try {
      let response = session.performRoundEnd()
      expect(response.ok, response.error).toBe(true)
      expect(response.state.roundPhase).toBe('preparation')
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, food: 40 })
      if (response.interaction.stateId !== 'wait') throw new Error('Expected the mandatory Quarry reaction')
      expect(response.interaction.request.kind).toBe('select-trigger')
      expect(response.interaction.request.options?.find(option => option.value === '__pass__')?.disabled).toBe(true)
      response = session.resolveChoice(0, CARD_ID)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 0, food: 40 })
      expect(readCardResourceStats(response.state.players[0]!, CARD_ID)?.gained.wood).toBe(1)
      expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: CARD_ID,
        request: { kind: 'choice', requiresExplicitChoice: true } })
      if (response.interaction.stateId !== 'wait') throw new Error('The internal minor purchase disappeared')
      expect(response.interaction.request.options?.some(option => option.value === '__skip__')).toBe(true)
      const purchaseSpace = response.interaction.spaceId
      const unpaidAccept = response.interaction.request.options?.find(option => option.value !== '__skip__')
      expect(unpaidAccept?.disabled).toBe(true)
      if (!unpaidAccept) throw new Error('Expected the disabled unpaid minor action beside Skip')
      const beforeUnpaidAccept = session.getState()
      const rejectedUnpaidAccept = session.resolveChoice(0, unpaidAccept.value)
      expect(rejectedUnpaidAccept.ok).toBe(false)
      expect(rejectedUnpaidAccept.state).toEqual(beforeUnpaidAccept.state)
      expect(rejectedUnpaidAccept.interaction).toEqual(beforeUnpaidAccept.interaction)
      expect(rejectedUnpaidAccept.scores).toEqual(beforeUnpaidAccept.scores)

      response = session.takeAnytimeAction(0, 'exchange')
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.stateId).toBe('wait')
      restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
      response = restored.getState()
      if (response.interaction.stateId !== 'wait') throw new Error('The Furniture Stall exchange did not restore')
      const recipe = response.interaction.request.options?.find(option => option.effectPreview?.kind === 'resourceExchange'
        && option.effectPreview.resourcesPaid?.wood === 1 && option.effectPreview.resourcesGained?.clay === 1)
      expect(recipe?.sourceCard).toBe(FURNITURE_STALL)
      if (!recipe) throw new Error('Expected Furniture Stall to convert one wood into one clay')
      const exchangeChoice = `bulk:${recipe.value.split(':')[1]}=1`
      const beforeWrongActor = restored.getState()
      const wrongActor = restored.resolveChoice(1, exchangeChoice)
      expect(wrongActor.ok).toBe(false)
      expect(wrongActor.state).toEqual(beforeWrongActor.state)
      expect(wrongActor.interaction).toEqual(beforeWrongActor.interaction)
      expect(wrongActor.scores).toEqual(beforeWrongActor.scores)

      response = restored.resolveChoice(0, exchangeChoice)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 1, food: 40 })
      expect(readCardResourceStats(response.state.players[0]!, CARD_ID)?.gained.wood).toBe(1)
      expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: CARD_ID, spaceId: purchaseSpace,
        request: { kind: 'choice', requiresExplicitChoice: true } })
      if (response.interaction.stateId !== 'wait') throw new Error('The affordable minor purchase did not resume')
      const accept = response.interaction.request.options?.find(option => !option.disabled && option.value !== '__skip__')
      if (!accept) throw new Error('Expected the now-payable Milk Jug purchase')
      response = restored.resolveChoice(0, accept.value)
      expect(response.ok, response.error).toBe(true)
      if (!response.state.players[0]!.minorPlayed.includes(MILK_JUG)) {
        if (response.interaction.stateId !== 'wait') throw new Error('Expected the minor improvement hand')
        expect(response.interaction.request.options?.find(option => option.value === MILK_JUG)?.disabled).not.toBe(true)
        response = restored.resolveChoice(0, MILK_JUG)
        expect(response.ok, response.error).toBe(true)
      }
      response = finishFurnitureStallReaction(restored, response)
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, food: 40 })
      expect(response.state.players[0]!.minorPlayed).toEqual([MILK_JUG])
      expect(response.state.players[0]!.minorHand).not.toContain(MILK_JUG)
      expect(readCardResourceStats(response.state.players[0]!, CARD_ID)?.gained.wood).toBe(1)
      expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID
        && event.reason === 'cardEffect').map(event => event.type === 'resource.moved' ? event.resources : undefined)).toEqual([{ wood: 1 }])
      expect(response.state.events.filter(event => event.type === 'resource.exchanged' && event.exchangeSource === FURNITURE_STALL)
        .map(event => event.type === 'resource.exchanged' ? { paid: event.paid, gained: event.gained, times: event.times } : undefined))
        .toEqual([{ paid: { wood: 1 }, gained: { clay: 1 }, times: 1 }])
      expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === MILK_JUG)
        .map(event => event.type === 'resource.paid' ? event.resources : undefined)).toEqual([{ clay: 1 }])
      expect(response.state.events.filter(event => event.type === 'card.played' && event.cardId === MILK_JUG)).toHaveLength(1)
      expect(response.state.events.filter(event => event.type === 'action.revealed'
        && event.actionId === 'western-quarry' && event.roundSlot === 7)).toHaveLength(1)
      expect(response.state.actionSpaces.find(space => space.id === 'western-quarry')?.resources.stone).toBe(1)
    } finally {
      restored?.dispose()
      session.dispose()
    }
  })

  it('A096 S9: explicitly skipping the unpaid minor retains the Quarry wood without purchasing or exchanging', () => {
    const session = setupFurnitureStallReaction()
    try {
      const opening = session.performRoundEnd()
      expect(opening.ok, opening.error).toBe(true)
      let response = session.resolveChoice(0, CARD_ID)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 0, food: 40 })
      expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: CARD_ID,
        request: { kind: 'choice', requiresExplicitChoice: true } })
      if (response.interaction.stateId !== 'wait') throw new Error('Expected the explicit optional minor boundary')
      expect(response.interaction.request.options?.find(option => option.value === '__skip__')?.disabled).not.toBe(true)
      const beforeWrongActor = session.getState()
      const wrongActor = session.resolveChoice(1, '__skip__')
      expect(wrongActor.ok).toBe(false)
      expect(wrongActor.state).toEqual(beforeWrongActor.state)
      expect(wrongActor.interaction).toEqual(beforeWrongActor.interaction)
      expect(wrongActor.scores).toEqual(beforeWrongActor.scores)
      response = session.resolveChoice(0, '__skip__')
      expect(response.ok, response.error).toBe(true)
      response = finishFurnitureStallReaction(session, response)
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 0, food: 40 })
      expect(response.state.players[0]!.minorHand).toEqual([MILK_JUG])
      expect(response.state.players[0]!.minorPlayed).toEqual([])
      expect(readCardResourceStats(response.state.players[0]!, CARD_ID)?.gained.wood).toBe(1)
      expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID
        && event.reason === 'cardEffect').map(event => event.type === 'resource.moved' ? event.resources : undefined)).toEqual([{ wood: 1 }])
      expect(response.state.events.filter(event => event.type === 'resource.exchanged')).toEqual([])
      expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === MILK_JUG)).toEqual([])
      expect(response.state.events.filter(event => event.type === 'card.played' && event.cardId === MILK_JUG)).toEqual([])
      expect(response.state.events.filter(event => event.type === 'action.revealed'
        && event.actionId === 'western-quarry' && event.roundSlot === 7)).toHaveLength(1)
      expect(response.state.actionSpaces.find(space => space.id === 'western-quarry')?.resources.stone).toBe(1)
    } finally {
      session.dispose()
    }
  })

  it.each([
    { scenario: 'S10: no legal minor is in hand', minor: FILLER },
    { scenario: 'S11: the affordable minor needs two occupations', minor: SWIMMING_CLASS },
  ])('A096 $scenario: completes the wood reward without a phantom purchase window', ({ minor }) => {
    const session = setupFurnitureStallReaction(minor)
    try {
      const opening = session.performRoundEnd()
      expect(opening.ok, opening.error).toBe(true)
      let response = session.resolveChoice(0, CARD_ID)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 0, food: 40 })
      expect(response.state.players[0]!.occupationPlayed).toEqual([CARD_ID])
      expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'select-trigger' } })
      if (response.interaction.stateId !== 'wait') throw new Error('Expected the remaining Furniture Stall exchange window')
      expect(response.interaction.sourceCard).toBeUndefined()
      expect(response.interaction.request.options?.some(option => option.sourceCard === CARD_ID
        || option.value === minor || option.value === '__skip__')).toBe(false)
      expect(response.interaction.request.options?.find(option => option.labelKey === 'actions.exchange.name')?.disabled).not.toBe(true)
      response = finishFurnitureStallReaction(session, response)
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 0, food: 40 })
      expect(response.state.players[0]!.minorHand).toEqual([minor])
      expect(response.state.players[0]!.minorPlayed).toEqual([])
      expect(readCardResourceStats(response.state.players[0]!, CARD_ID)?.gained.wood).toBe(1)
      expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID
        && event.reason === 'cardEffect').map(event => event.type === 'resource.moved' ? event.resources : undefined)).toEqual([{ wood: 1 }])
      expect(response.state.events.filter(event => event.type === 'resource.exchanged')).toEqual([])
      expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === minor)).toEqual([])
      expect(response.state.events.filter(event => event.type === 'card.played' && event.cardId === minor)).toEqual([])
      expect(response.state.events.filter(event => event.type === 'action.revealed'
        && event.actionId === 'western-quarry' && event.roundSlot === 7)).toHaveLength(1)
      expect(response.state.actionSpaces.find(space => space.id === 'western-quarry')?.resources.stone).toBe(1)
    } finally {
      session.dispose()
    }
  })
})
