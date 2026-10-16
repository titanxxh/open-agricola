import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent , expectWait } from './_helpers/trigger-select'
import '../../shared/cards/A/A096_TaskArtisan'
import '../../shared/cards/A/A030_BakingSheet'
import '../../shared/cards/A/A067_CornScoop'
import assert from 'node:assert/strict'
import { type ActionChoiceOption, type GameState } from '../../shared/contract/types'
import { assertRejectedUnchanged, confirmNext, passPreparationExchanges , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A096_TaskArtisan'

const MINOR_ID = 'A030_BakingSheet'

const OTHER_MINOR_ID = 'A067_CornScoop'

const PALISADES = 'B030_WoodPalisades'

const MILK_JUG = 'A050_MilkJug'

const FURNITURE_STALL = 'Major_Moor_FurnitureStall'

const SWIMMING_CLASS = 'A035_SwimmingClass'

const FILLER = '__test_placeholder__'

const setup = ({ played = false, round = 1, withMinors = true } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5096, options: { playerCount: 2 } }))
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
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  return resolveTriggerIfPresent(session, response, CARD_ID)
}

const chooseTaskArtisanMinor = (session: GameSession, response: SessionResponse) => {
  response = resolveTriggerIfPresent(session, response, CARD_ID)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const accept = getChoiceOptions(response)?.find((option) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, accept!.value)

  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(getChoiceOptions(response)?.map((option) => option.value)).toContain(MINOR_ID)
  expect(getChoiceOptions(response)?.some((option) => option.value.startsWith('Major_'))).toBe(false)
  response = session.resolveChoice(response.interaction.playerIndex, MINOR_ID)
  if (response.interaction.stateId === 'wait'
    && response.interaction.sourceCard === CARD_ID
    && getChoiceOptions(response)?.some((option) => option.value === '__skip__')) {
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
  }
  return response
}

const declineTaskArtisanMinor = (session: GameSession, response: SessionResponse) => {
  response = resolveTriggerIfPresent(session, response, CARD_ID)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(getChoiceOptions(response)?.some((option) => option.value === '__skip__')).toBe(true)
  return session.resolveChoice(response.interaction.playerIndex, '__skip__')
}

const revealNextRound = (session: GameSession, revealed: string) => {
  const state = session.getState().state
  state.roundActionOrder[state.round] = revealed
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session.performRoundEnd()
}

const setupNestedReaction = (revealed: string): GameSession => sessionEvidence.track(createWorkSession({
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
}))

const finishNestedReactionRound = (session: GameSession): SessionResponse => {
  let response = session.getState()
  for (const [actor, action] of [[0, 'grain-seeds'], [1, 'reed-bank'], [0, 'forest'], [1, 'clay-pit']] as const) {
    if (response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'confirm-next-player') {
      response = confirmNext(session, response)
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.interaction.stateId).toBe('idle')
    response = session.takeAction(actor, action)
    expect(response.ok, response.error).toBe(true)
  }
  if (response.interaction.stateId !== 'wait' || expectWait(response).interaction.request.kind !== 'confirm-next-player') {
    throw new Error('Expected the final round-six placement confirmation')
  }
  response = confirmNext(session, response)
  expect(response.ok, response.error).toBe(true)
  return response
}

const setupFurnitureStallReaction = (minor = MILK_JUG): GameSession => sessionEvidence.track(createWorkSession({
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
}))

const finishFurnitureStallReaction = (session: GameSession, response: SessionResponse): SessionResponse => {
  if (response.interaction.stateId === 'wait') {
    expect(expectWait(response).interaction.request.kind).toBe('select-trigger')
    expect(getChoiceOptions(response)?.find(option => option.value === '__pass__')?.disabled).not.toBe(true)
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
    {
      let response = finishNestedReactionRound(session)
      expect(response.state.round).toBe(7)
      expect(response.state.roundPhase).toBe('preparation')
      expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 3, grain: 1 })
      expect(response.interaction.stateId).toBe('wait')
      if (response.interaction.stateId !== 'wait') throw new Error('Expected the mandatory Quarry reaction')
      expect(expectWait(response).interaction.request.kind).toBe('select-trigger')
      expect(getChoiceOptions(response)?.find(option => option.value === '__pass__')?.disabled).toBe(true)
      const exchange = getChoiceOptions(response)?.find(option => option.labelKey === 'actions.exchange.name')
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
      const grain = getChoiceOptions(response)?.find(option => option.effectPreview?.kind === 'resourceExchange'
        && option.effectPreview.resourcesPaid?.grain === 1 && option.effectPreview.resourcesGained?.food === 1)
      if (!grain) throw new Error('Expected one grain to convert to one food')
      response = session.resolveChoice(0, `bulk:${grain.value.split(':')[1]}=1`)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 3, grain: 0 })
      if (response.interaction.stateId !== 'wait') throw new Error('Expected the retained Quarry reaction')
      expect(getChoiceOptions(response)?.find(option => option.value === '__pass__')?.disabled).toBe(true)

      response = resolveTriggerIfPresent(session, response, CARD_ID)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.wood).toBe(4)
      if (response.interaction.stateId !== 'wait') throw new Error('Expected the optional minor improvement')
      const accept = getChoiceOptions(response)?.find(option => !option.disabled
        && !['__skip__', '__pass__', '__done__'].includes(option.value))
      if (!accept) throw new Error('Expected the now-payable minor improvement action')
      response = session.resolveChoice(0, accept.value)
      expect(response.ok, response.error).toBe(true)
      if (!response.state.players[0]!.minorPlayed.includes(PALISADES)) {
        if (response.interaction.stateId !== 'wait') throw new Error('Expected the minor improvement hand')
        expect(getChoiceOptions(response)?.find(option => option.value === PALISADES)?.disabled).not.toBe(true)
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
    }
  })

  it('A096 S7: revealing another round card does not capture a conversion or Task Artisan source', () => {
    const session = setupNestedReaction('vegetable-seeds')
    {
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
    }
  })

  // The newly granted wood is the only Furniture Stall input. The internal
  // optional purchase must survive until its owner can convert that reward.
  it('A096 S8: restores the optional minor purchase after converting its Quarry wood reward into clay', () => {
    const session = setupFurnitureStallReaction()
    let restored: GameSession | undefined
    {
      let response = session.performRoundEnd()
      expect(response.ok, response.error).toBe(true)
      expect(response.state.roundPhase).toBe('preparation')
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, food: 40 })
      if (response.interaction.stateId !== 'wait') throw new Error('Expected the mandatory Quarry reaction')
      expect(expectWait(response).interaction.request.kind).toBe('select-trigger')
      expect(getChoiceOptions(response)?.find(option => option.value === '__pass__')?.disabled).toBe(true)
      response = session.resolveChoice(0, CARD_ID)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 0, food: 40 })
      expect(readCardResourceStats(response.state.players[0]!, CARD_ID)?.gained.wood).toBe(1)
      expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: CARD_ID,
        request: { kind: 'choice', requiresExplicitChoice: true } })
      if (response.interaction.stateId !== 'wait') throw new Error('The internal minor purchase disappeared')
      expect(getChoiceOptions(response)?.some(option => option.value === '__skip__')).toBe(true)
      const purchaseSpace = response.interaction.spaceId
      const unpaidAccept = getChoiceOptions(response)?.find(option => option.value !== '__skip__')
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
      restored = sessionEvidence.track(new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session))))))
      response = restored.getState()
      if (response.interaction.stateId !== 'wait') throw new Error('The Furniture Stall exchange did not restore')
      const recipe = getChoiceOptions(response)?.find(option => option.effectPreview?.kind === 'resourceExchange'
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
      const accept = getChoiceOptions(response)?.find(option => !option.disabled && option.value !== '__skip__')
      if (!accept) throw new Error('Expected the now-payable Milk Jug purchase')
      response = restored.resolveChoice(0, accept.value)
      expect(response.ok, response.error).toBe(true)
      if (!response.state.players[0]!.minorPlayed.includes(MILK_JUG)) {
        if (response.interaction.stateId !== 'wait') throw new Error('Expected the minor improvement hand')
        expect(getChoiceOptions(response)?.find(option => option.value === MILK_JUG)?.disabled).not.toBe(true)
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
    }
  })

  it('A096 S9: explicitly skipping the unpaid minor retains the Quarry wood without purchasing or exchanging', () => {
    const session = setupFurnitureStallReaction()
    {
      const opening = session.performRoundEnd()
      expect(opening.ok, opening.error).toBe(true)
      let response = session.resolveChoice(0, CARD_ID)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 0, food: 40 })
      expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: CARD_ID,
        request: { kind: 'choice', requiresExplicitChoice: true } })
      if (response.interaction.stateId !== 'wait') throw new Error('Expected the explicit optional minor boundary')
      expect(getChoiceOptions(response)?.find(option => option.value === '__skip__')?.disabled).not.toBe(true)
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
    }
  })

  it.each([
    { scenario: 'S10: no legal minor is in hand', minor: FILLER },
    { scenario: 'S11: the affordable minor needs two occupations', minor: SWIMMING_CLASS },
  ])('A096 $scenario: completes the wood reward without a phantom purchase window', ({ minor }) => {
    const session = setupFurnitureStallReaction(minor)
    {
      const opening = session.performRoundEnd()
      expect(opening.ok, opening.error).toBe(true)
      let response = session.resolveChoice(0, CARD_ID)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 0, food: 40 })
      expect(response.state.players[0]!.occupationPlayed).toEqual([CARD_ID])
      expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'select-trigger' } })
      if (response.interaction.stateId !== 'wait') throw new Error('Expected the remaining Furniture Stall exchange window')
      expect(response.interaction.sourceCard).toBeUndefined()
      expect(getChoiceOptions(response)?.some(option => option.sourceCard === CARD_ID
        || option.value === minor || option.value === '__skip__')).toBe(false)
      expect(getChoiceOptions(response)?.find(option => option.labelKey === 'actions.exchange.name')?.disabled).not.toBe(true)
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
    }
  })
})

describe("A096 command boundaries", () => {
    const ARTISAN = 'A096_TaskArtisan';
    const MINOR = 'A030_BakingSheet', DEBT = 'A031_DebtSecurity';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response; }
    function setup(configure: (state: GameState) => void = () => { }, round = 14, played = true) {
        const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = round;
                for (const player of state.players)
                    Object.assign(player.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 });
                state.players[0]!.occupationPlayed = played ? [ARTISAN] : [];
                state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [ARTISAN];
                configure(state);
            } }));
        return session;
    }
    function ready(session: GameSession, actor: number) {
        let response = session.getState();
        if (response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'confirm-next-player')
            response = confirmNext(session, response);
        assert.equal(response.interaction.stateId, 'idle', JSON.stringify(response.interaction));
        assert.equal(response.state.currentPlayerIndex, actor);
    }
    function turn(session: GameSession, actor: number, space: string) { ready(session, actor); return ok(session.takeAction(actor, space)); }
    function options(response: SessionResponse): ActionChoiceOption[] { assert.ok(response.interaction.stateId === 'wait', JSON.stringify(response.interaction)); assert.ok('options' in expectWait(response).interaction.request); return getChoiceOptions(response)!; }
    function accept(session: GameSession, response: SessionResponse) {
        assert.ok(response.interaction.stateId === 'wait');
        assert.equal(response.interaction.sourceCard, ARTISAN);
        const matching = options(response).filter(option => option.sourceCard === ARTISAN && !option.disabled);
        assert.equal(matching.length, 1, JSON.stringify(response.interaction));
        return ok(session.resolveChoice(response.interaction.playerIndex, matching[0]!.value));
    }
    function reveal(session: GameSession) {
        turn(session, 0, 'grain-seeds');
        turn(session, 1, 'reed-bank');
        turn(session, 0, 'day-laborer');
        let response = confirmNext(session, turn(session, 1, 'clay-pit'));
        for (let n = 0; n < 12 && response.interaction.stateId === 'wait'; n++) {
            const interaction = response.interaction;
            if (interaction.request.kind === 'feed')
                response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] }));
            else if (interaction.request.kind === 'confirm-player-switch')
                response = ok(session.resolveChoice(interaction.request.toPlayerIndex, 'confirm'));
            else
                break;
        }
        response = passPreparationExchanges(session, response);
        if (response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'select-trigger' && getChoiceOptions(response).some(o => o.value === ARTISAN && !('disabled' in o && o.disabled)))
            response = ok(session.resolveChoice(response.interaction.playerIndex, ARTISAN));
        return response;
    }
    function artisan(played = true, round = 6, revealed = 'western-quarry', stone = 0) { return setup(state => { state.players[0]!.minorHand = [MINOR, DEBT]; state.roundActionOrder[round] = revealed; if (stone)
        state.actionSpaces.find(space => space.id === revealed)!.resources.stone = stone; }, round, played); }
    function buyMinor(session: GameSession, response: SessionResponse) {
        response = accept(session, response);
        assert.ok(options(response).some(o => o.value === MINOR));
        assert.ok(options(response).every(o => !o.value.startsWith('Major_')));
        return ok(session.resolveChoice(0, MINOR));
    }
    it("real occupation play grants exactly one wood with accepted or declined minor", () => {
        for (const decline of [false, true]) {
            const session = artisan(false);
            let response = turn(session, 0, 'lessons');
            if (response.state.players[0]!.occupationHand.includes(ARTISAN))
                response = ok(session.resolveChoice(0, ARTISAN));
            assert.equal(response.state.players[0]!.resources.wood, 1);
            response = decline ? ok(session.resolveChoice(0, '__skip__')) : buyMinor(session, response);
            assert.equal(response.state.players[0]!.resources.wood, 1);
            assert.ok(response.state.players[0]!.occupationPlayed.includes(ARTISAN));
            assert.equal(response.state.players[0]!.minorPlayed.includes(MINOR), !decline);
            assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(response.state.currentPlayerIndex, 0);
        save(`A096-N1-${decline}`, response);
        }
    });
    it("natural Western Quarry reveal accepting minor cannot repeat wood or offer", () => {
        const session = artisan();
        let response = reveal(session);
        assert.equal(response.state.round, 7);
        assert.equal(response.state.players[0]!.resources.wood, 1);
        response = buyMinor(session, response);
        save('A096-N2-after-minor', response);
        assert.deepEqual({ wood: response.state.players[0]!.resources.wood, repeatedOffer: response.interaction.stateId === 'wait' && response.interaction.sourceCard === ARTISAN }, { wood: 1, repeatedOffer: false });
        response = passPreparationExchanges(session, response);
        assert.equal(response.interaction.stateId, 'idle');
        assert.ok(response.state.players[0]!.minorPlayed.includes(MINOR));
        assert.equal(response.state.players[1]!.resources.wood, 0);
        save('A096-N2', response);
    });
    it("natural Eastern Quarry decline retains one wood and minor in hand", () => {
        const session = artisan(true, 12, 'eastern-quarry');
        let response = reveal(session);
        assert.equal(response.state.round, 13);
        response = ok(session.resolveChoice(0, '__skip__'));
        assert.equal(response.state.players[0]!.resources.wood, 1);
        assert.ok(response.state.players[0]!.minorHand.includes(MINOR));
        response = passPreparationExchanges(session, response);
        assert.equal(response.interaction.stateId, 'idle');
        assert.equal(response.state.players[1]!.resources.wood, 0);
        save('A096-N3', response);
    });
    it("nonquarry reveal unplayed card and ordinary quarry collection cannot trigger", () => {
        for (const session of [artisan(true, 5, 'vegetable-seeds'), artisan(false)]) {
            const response = reveal(session);
            assert.equal(response.state.players[0]!.resources.wood, 0);
            assert.equal(response.interaction.stateId, 'idle');
            save(`A096-N4-${response.state.round}`, response);
        }
        const response = turn(artisan(true, 7, 'western-quarry', 1), 0, 'western-quarry');
        assert.equal(response.state.players[0]!.resources.wood, 0);
        assert.ok(response.state.players[0]!.minorHand.includes(MINOR));
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A096-N4-collect', response);
    });
    it("major and wrong actor are rejected and legal minor remains possible", () => {
        const session = artisan(false);
        let response = turn(session, 0, 'lessons');
        if (response.state.players[0]!.occupationHand.includes(ARTISAN))
            response = ok(session.resolveChoice(0, ARTISAN));
        response = accept(session, response);
        assert.ok(options(response).every(o => !o.value.startsWith('Major_')));
        assertRejectedUnchanged(session, () => session.resolveChoice(0, 'Major_Fireplace1'));
        assertRejectedUnchanged(session, () => session.resolveChoice(1, MINOR));
        response = ok(session.resolveChoice(0, MINOR));
        assert.equal(response.state.players[0]!.resources.wood, 1);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A096-N5', response);
    });
});
