import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import { confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

const TOOLBOX = 'B027_Toolbox'
const CLEANER = 'C094_StableCleaner'
const POTTERS = 'A040_PottersYard'
const CLEANER_ACTION = 'C94-stable-cleaner-anytime'
const { track, record } = createScenarioEvidence(import.meta.url)
const ok = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  return response
}
const choose = (session: GameSession, response: SessionResponse, value: string) => {
  if (response.interaction.stateId !== 'wait') throw new Error('Expected an anytime completion decision')
  expect(getChoiceOptions(response).some(option => option.value === value && !option.disabled)).toBe(true)
  return ok(session.resolveChoice(response.interaction.playerIndex, value))
}
const setup = (ownerIndex = 0, configure?: (state: GameSession['state']) => void) => track(createWorkSession({
  seed: 1300,
  configure: state => {
    state.round = 5
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      Object.assign(player.resources, { food: 0, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
    }
    const owner = state.players[ownerIndex]!
    owner.minorPlayed = [TOOLBOX]
    owner.occupationPlayed = [CLEANER]
    Object.assign(owner.resources, { wood: 6, stone: 4, food: 6 })
    configure?.(state)
  },
}))
const commitStable = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select'
    || response.interaction.request.farm.farmType !== 'stable') throw new Error('Expected a real stable selection')
  return ok(session.commitSelectionChoice(response.interaction.playerIndex, {
    stables: [response.interaction.request.farm.selectableTiles[0]!],
  }))
}
const ordinaryStable = (session: GameSession, playerIndex: number) => {
  let response = ok(session.takeAction(playerIndex, 'farm-expansion'))
  for (let step = 0; step < 5 && response.interaction.stateId === 'wait'
    && response.interaction.promptKey !== 'ui.interactionToolboxImprovement'; step++) {
    if (response.interaction.request.kind === 'farm-select') {
      response = commitStable(session, response)
    } else {
      const option = getChoiceOptions(response).find(entry => entry.value === '__done__')
        ?? getChoiceOptions(response).find(entry => entry.labelKey === 'actions.stables.name')
      if (!option) throw new Error(`Expected stable or end: ${JSON.stringify(response.interaction)}`)
      response = choose(session, response, option.value)
    }
  }
  expect(response.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionToolboxImprovement' })
  return response
}

const setupPotters = (configure?: (state: GameSession['state']) => void) => setup(0, state => {
  state.players[0]!.minorPlayed.push(POTTERS)
  state.players[0]!.farmyardSpaceStates = [{
    spaceKey: '0-0', sourceCardId: POTTERS, kind: 'farmyard-goods-token',
    resources: { clay: 1 }, claimPolicy: 'when-no-longer-unused',
  }]
  configure?.(state)
})
const toToolbox = (session: GameSession, initial: SessionResponse, order: string[], food = 7, stone = 4) => {
  let response = initial
  for (let step = 0; step < 12 && response.interaction.stateId === 'wait'
    && response.interaction.promptKey !== 'ui.interactionToolboxImprovement'; step++) {
    record(`child-${step}`, response)
    if (isCardFlagged(response.state.players[0]!, CLEANER)) {
      expect(response.state.events.filter(event => event.type === 'anytime.completed' && event.anytimeActionId === CLEANER_ACTION)).toEqual([])
    }
    const options = getChoiceOptions(response)
    const preferred = order.flatMap(card => options.filter(option => option.sourceCard === card && !option.value.startsWith('__')))
    const option = preferred[0] ?? options.find(entry => !entry.value.startsWith('__'))
    if (!option) throw new Error(`Expected complete child reaction: ${JSON.stringify(response.interaction)}`)
    response = choose(session, response, option.value)
  }
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, promptKey: 'ui.interactionToolboxImprovement' })
  expect(isCardFlagged(response.state.players[0]!, CLEANER)).toBe(false)
  expect(isCardFlagged(response.state.players[0]!, TOOLBOX)).toBe(false)
  expect(response.state.players[0]!.resources).toMatchObject({ wood: 5, stone, food, clay: 0 })
  expect(response.state.players[0]!.stableTiles).toEqual([{ row: 0, col: 0 }])
  expect(response.state.players[0]!.farmyardSpaceStates?.filter(token => token.sourceCardId === POTTERS)).toEqual([])
  return response
}

const restore = (session: GameSession) => track(new GameSession(rehydrateState(
  JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session))),
)))
const startAfterTurn = (session: GameSession) => {
  const action = ok(session.takeAction(0, 'grain-seeds'))
  expect(action.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  return commitStable(session, ok(session.takeAnytimeAction(0, CLEANER_ACTION)))
}
const pottersExchange = (session: GameSession, response: SessionResponse) => {
  const potter = getChoiceOptions(response).find(option => option.sourceCard === POTTERS)!
  const result = choose(session, response, potter.value)
  expect(result.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: POTTERS })
  expect(result.state.players[0]!.resources).toMatchObject({ wood: 5, stone: 4, food: 5, clay: 1 })
  expect(isCardFlagged(result.state.players[0]!, CLEANER)).toBe(true)
  return result
}

describe('complete anytime activation', () => {
  it('assigns an idle next-player activation to the upcoming turn instead of the consumed previous turn', () => {
    const session = setup(1)
    let response = ok(session.takeAction(0, 'day-laborer'))
    confirmNext(session, response)
    response = ordinaryStable(session, 1)
    response = choose(session, response, '__skip__')
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 4, stone: 4, food: 6 })
    confirmNext(session, response)
    response = ok(session.takeAction(0, 'grain-seeds'))
    confirmNext(session, response)
    expect(session.getState().interaction.stateId).toBe('idle')

    response = ok(session.takeAnytimeAction(1, CLEANER_ACTION))
    response = commitStable(session, response)
    expect(response.state.players[1]!.stableTiles).toHaveLength(2)
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 3, stone: 4, food: 5 })
    expect(response.interaction.stateId).toBe('idle')
    expect(isCardFlagged(response.state.players[1]!, TOOLBOX)).toBe(true)
    expect(isCardFlagged(response.state.players[1]!, CLEANER)).toBe(false)
    expect(response.state.events.filter(event => event.type === 'anytime.completed')).toEqual([
      expect.objectContaining({ actorPlayerId: 'p2', anytimeActionId: CLEANER_ACTION, turn: { kind: 'before-turn' } }),
    ])

    response = ok(session.takeAction(1, 'forest'))
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, promptKey: 'ui.interactionToolboxImprovement' })
    record('upcoming-turn', response)
  })

  it.each([[TOOLBOX, POTTERS], [POTTERS, TOOLBOX]])('finishes C094 and A040 before Toolbox, source order %s then %s', (first, second) => {
    const session = setupPotters()
    let response = ok(session.takeAction(0, 'grain-seeds'))
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    response = ok(session.takeAnytimeAction(0, CLEANER_ACTION))
    response = commitStable(session, response)
    response = toToolbox(session, response, [first, second])
    assertRejectedUnchanged(session, () => session.takeAnytimeAction(1, CLEANER_ACTION))
    const accept = getChoiceOptions(response).find(option => !option.value.startsWith('__'))!
    response = choose(session, response, accept.value)
    if (!response.state.players[0]!.improvements.includes('Major_Joinery')) {
      response = choose(session, response, 'Major_Joinery')
    }
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, stone: 2, food: 7, clay: 0 })
    expect(response.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(response.scores?.find(score => score.playerId === 'p1')?.total).toBe(-8)
    expect(response.state.log.filter(entry => entry.key === 'log.playImprovement')).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'farm.stableBuilt')).toHaveLength(1)
    const completions = response.state.events.filter(event => event.type === 'anytime.completed')
    expect(completions).toEqual([
      expect.objectContaining({ actorPlayerId: 'p1', anytimeActionId: CLEANER_ACTION, turn: expect.objectContaining({ kind: 'after-turn' }) }),
    ])
    const purchase = response.state.events.find(event => event.type === 'card.played' && event.cardId === 'Major_Joinery')!
    expect(completions[0]!.seq).toBeLessThan(purchase.seq)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    record('Joinery-after-complete-activation', response)
  })


  it('declines without payment, suppresses a second activation in the same Turn, then opens on the next Turn', () => {
    const session = setupPotters()
    let response = toToolbox(session, startAfterTurn(session), [POTTERS, TOOLBOX])
    response = choose(session, response, '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 5, stone: 4, food: 7, clay: 0 })
    expect(response.state.players[0]!.improvements).toEqual([])
    expect(response.scores?.find(score => score.playerId === 'p1')?.total).toBe(-11)
    response = commitStable(session, ok(session.takeAnytimeAction(0, CLEANER_ACTION)))
    expect(response.state.players[0]!.stableTiles).toHaveLength(2)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, stone: 4, food: 6 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(isCardFlagged(response.state.players[0]!, TOOLBOX)).toBe(false)
    const sameTurn = response.state.events.filter(event => event.type === 'anytime.completed')
    expect(sameTurn).toHaveLength(2)
    expect(sameTurn[0]!.turn).toEqual(sameTurn[1]!.turn)
    confirmNext(session, response)
    response = ok(session.takeAction(1, 'forest'))
    confirmNext(session, response)
    ok(session.takeAction(0, 'clay-pit'))
    response = commitStable(session, ok(session.takeAnytimeAction(0, CLEANER_ACTION)))
    for (let step = 0; step < 4 && response.interaction.stateId === 'wait'
      && response.interaction.promptKey !== 'ui.interactionToolboxImprovement'; step++) {
      const option = getChoiceOptions(response).find(entry => entry.sourceCard === TOOLBOX)!
      response = choose(session, response, option.value)
    }
    expect(response.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionToolboxImprovement' })
    expect(response.state.players[0]!.stableTiles).toHaveLength(3)
    record('next-turn-window', response)
  })

  it('waits for the ordinary Turn end when activation is inserted inside an unfinished action', () => {
    const session = setupPotters()
    ok(session.takeAction(0, 'farmland'))
    let response = commitStable(session, ok(session.takeAnytimeAction(0, CLEANER_ACTION)))
    for (let step = 0; step < 8 && response.interaction.stateId === 'wait'
      && response.interaction.request.kind !== 'farm-select'; step++) {
      expect(response.interaction.promptKey).not.toBe('ui.interactionToolboxImprovement')
      const option = getChoiceOptions(response).find(entry => !entry.value.startsWith('__'))!
      response = choose(session, response, option.value)
    }
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } } })
    expect(isCardFlagged(response.state.players[0]!, CLEANER)).toBe(false)
    expect(isCardFlagged(response.state.players[0]!, TOOLBOX)).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 5, stone: 4, food: 7, clay: 0 })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') throw new Error('Expected pending plow')
    response = ok(session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }))
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionToolboxImprovement' })
    response = choose(session, response, '__skip__')
    expect(response.state.events.filter(event => event.type === 'anytime.completed')).toEqual([
      expect.objectContaining({ anytimeActionId: CLEANER_ACTION, turn: expect.objectContaining({ kind: 'inside-turn' }) }),
    ])
    record('inside-turn-completion', response)
  })

  it('restores JSON during the child exchange and the Toolbox decision, completing only once', () => {
    let session = setupPotters()
    pottersExchange(session, startAfterTurn(session))
    session = restore(session)
    let response = session.getState()
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: POTTERS })
    expect(isCardFlagged(response.state.players[0]!, CLEANER)).toBe(true)
    toToolbox(session, response, [POTTERS, TOOLBOX])
    session = restore(session)
    response = choose(session, session.getState(), '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 5, stone: 4, food: 7, clay: 0 })
    expect(response.state.events.filter(event => event.type === 'anytime.completed')).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'farm.stableBuilt')).toHaveLength(1)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    record('restored-completion', response)
  })

  it('undoes and retries the child receipt and the Toolbox purchase without duplicating the activation', () => {
    const session = setupPotters()
    pottersExchange(session, startAfterTurn(session))
    let response = ok(session.undoStep())
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 5, stone: 4, food: 5, clay: 0 })
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.players[0]!.farmyardSpaceStates).toHaveLength(1)
    response = pottersExchange(session, response)
    response = toToolbox(session, response, [POTTERS, TOOLBOX])
    const accept = getChoiceOptions(response).find(option => !option.value.startsWith('__'))!
    response = choose(session, response, accept.value)
    expect(response.state.players[0]!.improvements).toContain('Major_Joinery')
    response = ok(session.undoStep())
    expect(response.state.players[0]!.improvements).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 5, stone: 4, food: 7, clay: 0 })
    const retry = getChoiceOptions(response).find(option => !option.value.startsWith('__'))!
    response = choose(session, response, retry.value)
    expect(response.state.players[0]!.improvements).toEqual(['Major_Joinery'])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, stone: 2, food: 7, clay: 0 })
    expect(response.state.events.filter(event => event.type === 'anytime.completed')).toHaveLength(1)
    record('undo-completion', response)
  })

  it('keeps a nested card activation inside C094 without consuming the outer Toolbox qualification', () => {
    const STONE_BUYER = 'C143_StoneBuyer'
    const NESTED_ACTION = 'C143-stone-buyer-anytime'
    let session = setupPotters(state => state.players[0]!.occupationPlayed.push(STONE_BUYER))
    let response = startAfterTurn(session)
    const flag = getChoiceOptions(response).find(option => option.sourceCard === TOOLBOX)!
    response = choose(session, response, flag.value)
    response = pottersExchange(session, response)
    expect(isCardFlagged(response.state.players[0]!, TOOLBOX)).toBe(true)
    expect(response.interaction.anytimeActions.some(entry => entry.id === NESTED_ACTION)).toBe(true)
    response = ok(session.takeAnytimeAction(0, NESTED_ACTION))
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: POTTERS })
    expect(isCardFlagged(response.state.players[0]!, CLEANER)).toBe(true)
    expect(isCardFlagged(response.state.players[0]!, TOOLBOX)).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 5, stone: 5, food: 3, clay: 1 })
    session = restore(session)
    response = session.getState()
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: POTTERS })
    response = toToolbox(session, response, [POTTERS, TOOLBOX], 5, 5)
    response = choose(session, response, '__skip__')
    const completions = response.state.events.filter(event => event.type === 'anytime.completed')
    expect(completions).toHaveLength(2)
    expect(completions[0]!.anytimeActionId).toBe(NESTED_ACTION)
    expect(completions[1]!.anytimeActionId).toBe(CLEANER_ACTION)
    expect(completions[0]!.parentActivationId).toBe(completions[1]!.activationId)
    expect(completions[0]!.turn).toEqual(completions[1]!.turn)
    expect(completions[1]!.parentActivationId).toBeUndefined()
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 5, stone: 5, food: 5, clay: 0 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    record('nested-anytime', response)
  })

})
