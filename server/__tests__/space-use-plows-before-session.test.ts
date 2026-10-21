import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { getChoiceOptions, assertRejectedUnchanged } from './_helpers/session-assertions'
import { getCardStack } from '../../shared/cards/helpers/card-state'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const storedFields: Record<string, number> = { B019_MoldboardPlow: 2, C019_SwingPlow: 4, D020_TurnwrestPlow: 2 }

function make(card: string, configure?: (state: GameState) => void) {
  const session = createWorkSession({ seed: 42, options: { playerCount: card === 'A163_BuildingExpert' ? 4 : 2 }, configure: state => {
    state.round = 14
    for (const player of state.players) {
      for (const resource of Object.keys(player.resources)) Reflect.set(player.resources, resource, 0)
    }
    const owner = state.players[0]!
    if (['A163_BuildingExpert', 'B090_CooperativePlower', 'B091_AssistantTiller', 'C090_FieldWatchman', 'C091_PlowHero'].includes(card)) owner.occupationPlayed = [card]
    else owner.minorPlayed = [card]
    if (storedFields[card]) owner.cardStates[card] = { stack: Array.from({ length: storedFields[card] }, () => 'field') }
    if (card === 'C091_PlowHero') owner.resources.food = 1
    if (card === 'B090_CooperativePlower') {
      const opponent = state.players[1]!
      state.actionSpaces.find(space => space.id === 'grain-seeds')!.takenBy = [{ playerId: opponent.id, workerId: opponent.workers[0]!.id }]
    }
    state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

function finish(session: GameSession, initial: SessionResponse, accept = true, maxBonus = 2) {
  let response = initial
  for (let step = 0; step < 16 && response.interaction.stateId === 'wait'; step++) {
    const interaction = response.interaction
    if (interaction.request.kind === 'confirm-next-player') return response
    if (interaction.request.kind === 'farm-select' && interaction.request.farm.farmType === 'plow') {
      const tile = interaction.request.farm.selectableTiles[0]!
      const fields = response.state.players[0]!.fields
      if (fields.length) expect(fields.some(field => Math.abs(field.row - tile.row) + Math.abs(field.col - tile.col) === 1)).toBe(true)
      response = session.commitSelectionChoice(interaction.playerIndex, { tile })
    } else {
      const done = response.state.events.filter(event => event.type === 'farm.fieldPlowed' && event.sourceCardId).length
      const options = getChoiceOptions(response).filter(option => !option.disabled)
      const option = (accept && done < maxBonus ? options.find(option => !['__skip__', '__pass__', '__done__'].includes(option.value)) : undefined)
        ?? options.find(option => ['__skip__', '__pass__', '__done__'].includes(option.value))
      expect(option, JSON.stringify(interaction)).toBeDefined()
      response = session.resolveChoice(interaction.playerIndex, option!.value)
    }
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.interaction.stateId, JSON.stringify(response.interaction)).toBe('idle')
  return response
}

const plows = [
  { card: 'A018_WheelPlow', space: 'farmland', bonus: 2 },
  { card: 'A018_WheelPlow', space: 'cultivation', bonus: 2 },
  { card: 'B019_MoldboardPlow', space: 'farmland', bonus: 1 },
  { card: 'B090_CooperativePlower', space: 'farmland', bonus: 1 },
  { card: 'B091_AssistantTiller', space: 'day-laborer', bonus: 1 },
  { card: 'C019_SwingPlow', space: 'farmland', bonus: 2 },
  { card: 'C020_MolePlow', space: 'farmland', bonus: 1 },
  { card: 'C020_MolePlow', space: 'cultivation', bonus: 1 },
  { card: 'C090_FieldWatchman', space: 'grain-seeds', bonus: 1 },
  { card: 'C091_PlowHero', space: 'farmland', bonus: 1 },
  { card: 'C091_PlowHero', space: 'cultivation', bonus: 1 },
  { card: 'D020_TurnwrestPlow', space: 'farmland', bonus: 2 },
  { card: 'D020_TurnwrestPlow', space: 'cultivation', bonus: 2 },
]

describe('card plows before their space host', () => {
  it.each(plows)('$card can skip its $space bonus without consuming stored fields or its fee', scenario => {
    const session = make(scenario.card)
    const response = finish(session, session.takeAction(0, scenario.space), false)
    expect(response.state.players[0]!.fields).toHaveLength(['farmland', 'cultivation'].includes(scenario.space) ? 1 : 0)
    expect(response.state.events.filter(event => event.type === 'farm.fieldPlowed' && event.sourceCardId === scenario.card)).toHaveLength(0)
    if (storedFields[scenario.card]) expect(getCardStack(response.state.players[0]!, scenario.card)).toHaveLength(storedFields[scenario.card]!)
    if (scenario.card === 'C091_PlowHero') expect(response.state.players[0]!.resources.food).toBe(1)
    if (scenario.card === 'A018_WheelPlow') expect(response.state.players[0]!.cardStates[scenario.card]?.flagged).toBe(true)
  })

  it.each(plows.filter((scenario, index, all) => all.findIndex(candidate => candidate.card === scenario.card) === index)
    .flatMap(scenario => ['hand', 'opponent', 'unrelated'].map(mode => ({ ...scenario, mode }))))('$card does not grant a bonus for $mode', scenario => {
    const session = make(scenario.card, state => {
      const owner = state.players[0]!
      if (scenario.mode === 'hand') {
        if (owner.occupationPlayed.includes(scenario.card)) { owner.occupationPlayed = []; owner.occupationHand = [scenario.card] }
        else { owner.minorPlayed = []; owner.minorHand = [scenario.card] }
      }
      if (scenario.mode === 'opponent') state.currentPlayerIndex = 1
    })
    const response = finish(session, session.takeAction(scenario.mode === 'opponent' ? 1 : 0,
      scenario.mode === 'unrelated' ? 'reed-bank' : scenario.space))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.events.filter(event => event.type === 'farm.fieldPlowed' && event.sourceCardId === scenario.card)).toHaveLength(0)
    if (storedFields[scenario.card]) expect(getCardStack(response.state.players[0]!, scenario.card)).toHaveLength(storedFields[scenario.card]!)
  })

  it.each(Object.keys(storedFields))('%s restores its stored fields on undo and consumes them only once on retry', card => {
    const session = make(card)
    const use = () => finish(session, session.takeAction(0, 'farmland'))
    use()
    expect(session.undoAction().ok).toBe(true)
    expect(session.getState().state.players[0]!.fields).toHaveLength(0)
    expect(getCardStack(session.getState().state.players[0]!, card)).toHaveLength(storedFields[card]!)
    const response = use()
    expect(getCardStack(response.state.players[0]!, card)).toHaveLength(storedFields[card]! - (card === 'B019_MoldboardPlow' ? 1 : 2))
  })

  it('B019 rejects a nonadjacent extra field without consuming its stored tile', () => {
    const card = 'B019_MoldboardPlow'
    const session = make(card, state => state.players[0]!.fields.push({ row: 0, col: 1, stacks: [] }))
    let response = session.takeAction(0, 'farmland')
    const accept = getChoiceOptions(response).find(option => option.value !== '__skip__' && !option.disabled)
    expect(accept).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('farm-select')
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { tile: { row: 2, col: 4 } }))
    expect(getCardStack(session.getState().state.players[0]!, card)).toHaveLength(2)
    response = finish(session, response)
    expect(response.state.players[0]!.fields).toHaveLength(3)
    expect(getCardStack(response.state.players[0]!, card)).toHaveLength(1)
  })

  it('B090 with Grain Seeds unoccupied and C091 without food leave only the normal field', () => {
    const cooperative = make('B090_CooperativePlower', state => state.actionSpaces.find(space => space.id === 'grain-seeds')!.takenBy = [])
    expect(finish(cooperative, cooperative.takeAction(0, 'farmland')).state.players[0]!.fields).toHaveLength(1)
    const hero = make('C091_PlowHero', state => state.players[0]!.resources.food = 0)
    const response = finish(hero, hero.takeAction(0, 'farmland'))
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it.each(['A018_WheelPlow', 'C091_PlowHero'])('%s keeps its first-person bonus when the actual first worker moves to Farmland', card => {
    const granted = 'TEST_MoveFirstWorker'
    const session = make(card, state => state.players[0]!.minorPlayed.push(granted))
    session.withCtx(() => requireActiveCardRegistry('relocated-plow-before').registerListener({
      id: 'test-move-first-worker', cardIds: [granted], actions: ['collect'], phases: ['immediatelyAfter'],
      handler: context => context.space.id === 'forest' ? { flow: {
        type: 'leaf', actionId: 'place-farmer', sourceCard: granted,
        actionContext: { viaCardJump: true, sourceCard: granted, targetSpaceId: 'farmland',
          workerId: context.space.takenBy.find(worker => worker.playerId === context.player.id)?.workerId },
      } } : undefined,
    }))
    const response = finish(session, session.takeAction(0, 'forest'))
    expect(response.state.players[0]!.fields).toHaveLength(card === 'A018_WheelPlow' ? 3 : 2)
    expect(response.state.events.filter(event => event.type === 'farm.fieldPlowed' && event.sourceCardId === card)).toHaveLength(card === 'A018_WheelPlow' ? 2 : 1)
  })

  it.each([
    { card: 'C091_PlowHero', space: 'farmland' },
    { card: 'A163_BuildingExpert', space: 'resource-market-4' },
  ])('$card does not borrow the active forest worker snapshot for a nested workerless $space use', scenario => {
    const granted = 'TEST_WorkerlessUse'
    const session = make(scenario.card, state => state.players[0]!.minorPlayed.push(granted))
    session.withCtx(() => requireActiveCardRegistry('workerless-plow-before').registerListener({
      id: 'test-workerless-use', cardIds: [granted], actions: ['collect'], phases: ['immediatelyAfter'],
      handler: context => context.space.id === 'forest' ? { flow: {
        type: 'leaf', actionId: 'place-farmer', sourceCard: granted,
        actionContext: { viaCardJump: true, sourceCard: granted, targetSpaceId: scenario.space },
      } } : undefined,
    }))
    const response = finish(session, session.takeAction(0, 'forest'))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.events.filter(event => event.type === 'card.triggered' && event.sourceCardId === scenario.card)).toHaveLength(0)
    if (scenario.card === 'A163_BuildingExpert') expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, reed: 1, stone: 1, food: 1 })
    else {
      expect(response.state.players[0]!.fields).toHaveLength(1)
      expect(response.state.players[0]!.resources.food).toBe(1)
    }
  })

  it.each(plows)('$card plows $bonus fields before $space, with card sources and adjacency preserved', scenario => {
    const session = make(scenario.card)
    const pending = session.takeAction(0, scenario.space)
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction.stateId === 'wait' && pending.interaction.request.kind).toBe('choice')
    expect(pending.state.players[0]!.fields).toHaveLength(0)
    expect(pending.state.events.filter(event => event.type === 'resource.moved' && !event.sourceCardId)).toHaveLength(0)
    const response = finish(session, pending)
    const hostPlows = ['farmland', 'cultivation'].includes(scenario.space)
    expect(response.state.players[0]!.fields).toHaveLength(scenario.bonus + (hostPlows ? 1 : 0))
    const sources = response.state.events.filter(event => event.type === 'farm.fieldPlowed').map(event => event.sourceCardId)
    expect(sources).toEqual([...Array.from({ length: scenario.bonus }, () => scenario.card), ...(hostPlows ? [undefined] : [])])
    if (!hostPlows) {
      const plowed = response.state.events.findIndex(event => event.type === 'farm.fieldPlowed' && event.sourceCardId === scenario.card)
      const host = response.state.events.findIndex(event => event.type === 'resource.moved' && !event.sourceCardId)
      expect(host).toBeGreaterThan(plowed)
      expect(response.state.players[0]!.resources).toMatchObject(scenario.space === 'day-laborer' ? { food: 2 } : { grain: 1 })
    }
    if (storedFields[scenario.card]) expect(getCardStack(response.state.players[0]!, scenario.card)).toHaveLength(storedFields[scenario.card]! - scenario.bonus)
    if (scenario.card === 'A018_WheelPlow') expect(response.state.players[0]!.cardStates[scenario.card]?.flagged).toBe(true)
    if (scenario.card === 'C091_PlowHero') {
      expect(response.state.players[0]!.resources.food).toBe(0)
      const pay = response.state.events.findIndex(event => event.type === 'resource.paid' && event.sourceCardId === scenario.card)
      expect(pay).toBeGreaterThanOrEqual(0)
      expect(response.state.events.findIndex(event => event.type === 'farm.fieldPlowed')).toBeGreaterThan(pay)
    }
    expect(response.state.log.some(log => log.key === 'log.cardTriggered' && log.params?.cardId === scenario.card)).toBe(true)
    expect(response.scores).toHaveLength(2)
  })

  it('B019 uses a stored field before the normal Farmland field', () => {
    const card = 'B019_MoldboardPlow'
    const session = make(card)
    const pending = session.takeAction(0, 'farmland')
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction.stateId === 'wait' && pending.interaction.request.kind).toBe('choice')
    expect(pending.state.players[0]!.fields).toHaveLength(0)
    const response = finish(session, pending)
    expect(response.state.players[0]!.fields).toHaveLength(2)
    expect(getCardStack(response.state.players[0]!, card)).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'farm.fieldPlowed').map(event => event.sourceCardId)).toEqual([card, undefined])
    expect(response.state.log.some(log => log.key === 'log.cardTriggered' && log.params?.cardId === card)).toBe(true)
    expect(response.scores).toHaveLength(2)
  })
})
