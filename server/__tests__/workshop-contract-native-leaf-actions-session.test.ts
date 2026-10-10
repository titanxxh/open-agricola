import { afterEach, describe, expect, it } from 'vitest'
import { clearCustomCards } from '../../shared/cards/custom-registry'
import type { GameState, PlayerState } from '../../shared/contract/types'
import type { GameSession } from '../game/authoritative-session'
import { compileContractCard, createRoundTenSession } from './_helpers/workshop-contract-card'

/**
 * ADR 0025 fixed behavior tests for the leaf actions that run a native farm,
 * card or turn-order action, and for the special-effect kinds pop-card-stack-top
 * and remove-future-meeples. Each scenario is a two-player work phase in round
 * 10. Player 0 has played the custom card, whose listener returns the flow
 * after that player's own collect action, and takes Forest with 3 wood on it.
 * Apart from 10 food, a player owns only what the scenario grants.
 */

const CARD_ID = 'CUSTOM_NativeLeafProbe'
const ONE_CELL_FENCES = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const sessions: GameSession[] = []
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose()
  clearCustomCards()
})

const start = (flow: string, configure?: (state: GameState, owner: PlayerState) => void) => {
  const card = compileContractCard(CARD_ID, `
const leaf = (actionId, extra) => Object.assign({ type: 'leaf', actionId, sourceCard: CARD_ID }, extra || {})
const CARD_IMPL = {
  effect: { resolveChoice: (state, player, choice) =>
    choice === 'one' || choice === 'two' ? gainLeaf(CARD_ID, { grain: choice === 'one' ? 1 : 2 }) : undefined },
  listeners: [{ cardIds: [CARD_ID], actions: ['collect'], phases: ['after'],
    handler: () => ({ sourceCard: CARD_ID, flow: ${flow} }) }],
}`)
  const session = createRoundTenSession(card, {
    configure: (state) => {
      state.actionSpaces.find(space => space.id === 'forest')!.resources = { wood: 3 }
      configure?.(state, state.players[0]!)
    },
  })
  sessions.push(session)
  return session
}

type Response = ReturnType<GameSession['takeAction']>

const request = (response: Response) => {
  if (response.interaction.stateId !== 'wait') throw new Error(`expected a pending interaction, got ${response.interaction.stateId}`)
  return response.interaction.request
}

const farmRequest = (response: Response, farmType: string) => {
  const pending = request(response)
  if (pending.kind !== 'farm-select' || pending.farm.farmType !== farmType) throw new Error(`expected a ${farmType} selection`)
  return pending.farm as { selectableTiles: Array<{ row: number; col: number }> }
}

/** The card's flow has finished when only the hand-over to the next turn is pending. */
const expectSettled = (session: GameSession, response: Response) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  expect(session.cardWarnings).toEqual([])
}

const sheepPasture = (owner: PlayerState, sheep: number) => {
  owner.pastures = [{
    id: 'p1', size: 2, tiles: [{ row: 0, col: 3 }, { row: 0, col: 4 }], stables: 0,
    animalType: sheep > 0 ? 'sheep' : null, animalCount: sheep,
  }]
  owner.resources.sheep = sheep
}

describe('Workshop Capability Contract native leaf actions', () => {
  it('plow lets the player place one field', () => {
    const session = start(`leaf('plow')`)

    const pending = session.takeAction(0, 'forest')
    const plowed = session.commitSelectionChoice(0, { tile: farmRequest(pending, 'plow').selectableTiles[0] })

    expectSettled(session, plowed)
    expect(plowed.state.players[0]!.fields).toHaveLength(1)
  })

  it('sow plants the player\'s own seed on a chosen field', () => {
    const session = start(`leaf('sow')`, (_state, owner) => {
      owner.fields = [{ row: 0, col: 2, stacks: [] }]
      owner.resources.grain = 1
    })

    const pending = session.takeAction(0, 'forest')
    expect(request(pending)).toMatchObject({ kind: 'farm-select', farm: { farmType: 'sow' } })
    const sown = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })

    expectSettled(session, sown)
    expect(sown.state.players[0]!.resources.grain).toBe(0)
    expect(sown.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
  })

  it('fence charges the native wood cost for the chosen edges', () => {
    const session = start(`leaf('fence')`, (_state, owner) => { owner.resources.wood = 1 })

    const pending = session.takeAction(0, 'forest')
    expect(request(pending)).toMatchObject({ kind: 'farm-select', farm: { farmType: 'fence' } })
    const fenced = session.commitSelectionChoice(0, { edges: ONE_CELL_FENCES, palisadeEdges: [], extraWood: 0 })

    expectSettled(session, fenced)
    // 1 wood owned and 3 from Forest pay for the four fences.
    expect(fenced.state.players[0]!.resources.wood).toBe(0)
    expect(fenced.state.players[0]!.pastures).toHaveLength(1)
  })

  it('stables builds a stable for 2 wood', () => {
    const session = start(`leaf('stables')`)

    const pending = session.takeAction(0, 'forest')
    const tile = farmRequest(pending, 'stable').selectableTiles[0]!
    const built = session.commitSelectionChoice(0, { stables: [tile] })

    expectSettled(session, built)
    expect(built.state.players[0]!.resources.wood).toBe(1)
    expect(built.state.players[0]!.stableTiles).toEqual([tile])
  })

  it('construct adds a room and charges the wooden house cost', () => {
    const session = start(`leaf('construct')`, (_state, owner) => { Object.assign(owner.resources, { wood: 2, reed: 2 }) })

    const pending = session.takeAction(0, 'forest')
    const built = session.commitSelectionChoice(0, { rooms: [farmRequest(pending, 'room').selectableTiles[0]] })

    expectSettled(session, built)
    expect(built.state.players[0]!.rooms).toBe(3)
    expect(built.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('renovate-house upgrades the house and charges 1 clay per room plus 1 reed', () => {
    const session = start(`leaf('renovate-house')`, (_state, owner) => { Object.assign(owner.resources, { clay: 2, reed: 1 }) })

    const renovated = session.takeAction(0, 'forest')

    expectSettled(session, renovated)
    expect(renovated.state.players[0]!.houseType).toBe('clay')
    expect(renovated.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
  })

  it('improvement offers the major improvements and charges the chosen one', () => {
    const session = start(`leaf('improvement')`, (_state, owner) => { owner.resources.clay = 3 })

    const pending = session.takeAction(0, 'forest')
    expect(pending.interaction).toMatchObject({ promptKey: 'ui.interactionChooseImprovement', request: { kind: 'choice' } })
    const bought = session.resolveChoice(0, 'Major_Fireplace2')

    expectSettled(session, bought)
    expect(bought.state.players[0]!.improvements).toEqual(['Major_Fireplace2'])
    expect(bought.state.players[0]!.resources.clay).toBe(0)
  })

  it('improvement with types minor offers only the minor improvements in hand', () => {
    const session = start(`leaf('improvement', { params: { types: ['minor'] } })`, (_state, owner) => {
      owner.minorHand = ['A012_DrinkingTrough', 'A032_Manger']
      owner.resources.clay = 3
    })

    const pending = session.takeAction(0, 'forest')
    const options = request(pending).options!.map(option => option.value)
    expect(options).toContain('A032_Manger')
    expect(options.some(value => value.startsWith('Major_'))).toBe(false)
    const played = session.resolveChoice(0, 'A032_Manger')

    expectSettled(session, played)
    expect(played.state.players[0]!.minorPlayed).toEqual([CARD_ID, 'A032_Manger'])
    // Manger costs 2 of the 3 wood taken from Forest.
    expect(played.state.players[0]!.resources.wood).toBe(1)
    expect(played.state.players[0]!.minorHand).toEqual(['A012_DrinkingTrough'])
  })

  it.each([
    { name: 'charges the Lessons cost of a second occupation', flow: `leaf('occupation')`, food: 9 },
    { name: 'is free with an empty exactCost', flow: `leaf('occupation', { params: { exactCost: {} } })`, food: 10 },
  ])('occupation plays one from hand and $name', ({ flow, food }) => {
    const session = start(flow, (_state, owner) => {
      owner.occupationPlayed = ['A100_Curator']
      owner.occupationHand = ['A101_CookeryOutfitter', 'A118_Treegardener']
    })

    const pending = session.takeAction(0, 'forest')
    expect(request(pending).options!.map(option => option.value)).toEqual(expect.arrayContaining(['A101_CookeryOutfitter', 'A118_Treegardener']))
    const played = session.resolveChoice(0, 'A101_CookeryOutfitter')

    expectSettled(session, played)
    expect(played.state.players[0]!.occupationPlayed).toEqual(['A100_Curator', 'A101_CookeryOutfitter'])
    expect(played.state.players[0]!.resources.food).toBe(food)
  })

  it('family-growth adds a family member when a room is free', () => {
    const session = start(`leaf('family-growth')`, (_state, owner) => { owner.rooms = 3 })

    const grown = session.takeAction(0, 'forest')

    expectSettled(session, grown)
    expect(grown.state.players[0]!.workers.filter(worker => worker.isActive)).toHaveLength(3)
  })

  it('breed adds one newborn outside Harvest and asks where the animals live', () => {
    const session = start(`leaf('breed')`, (_state, owner) => sheepPasture(owner, 2))

    const pending = session.takeAction(0, 'forest')
    expect(request(pending)).toMatchObject({ kind: 'animal-reorg' })
    expect(pending.state.players[0]!.resources.sheep).toBe(3)
    expect(pending.state.harvestBreedSummary?.[pending.state.players[0]!.id]).toBeUndefined()
    const placed = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: 3 },
    ] as unknown as Record<string, unknown>)

    expectSettled(session, placed)
    expect(placed.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'sheep', animalCount: 3 })
  })

  it('reap takes one crop per sown field as a field phase outside Harvest', () => {
    const session = start(`leaf('reap')`, (_state, owner) => {
      owner.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }]
    })

    const reaped = session.takeAction(0, 'forest')

    expectSettled(session, reaped)
    expect(reaped.state.players[0]!.resources.grain).toBe(1)
    expect(reaped.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    const removed = reaped.state.events.filter(event => event.type === 'farm.cropRemoved')
    expect(removed).toHaveLength(1)
    expect(removed[0]).toMatchObject({ reason: 'reap', trigger: { phase: 'private-field-phase', cardId: CARD_ID } })
  })

  it('exchange opens the player\'s own exchange menu', () => {
    const session = start(`leaf('exchange')`, (_state, owner) => {
      owner.improvements = ['Major_Fireplace2']
      owner.resources.vegetable = 1
    })

    const pending = session.takeAction(0, 'forest')
    expect(pending.interaction).toMatchObject({ promptKey: 'ui.interactionExchangeChoice', request: { kind: 'choice' } })
    const cook = request(pending).options!.find(option => option.sourceCard === 'Major_Fireplace2')!
    const cooked = session.resolveChoice(0, cook.value)

    expectSettled(session, cooked)
    // The Fireplace turns the vegetable into 2 food.
    expect(cooked.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 12 })
  })

  it('set-first-player hands the starting player marker to the effect player', () => {
    const session = start(`leaf('set-first-player')`, (state) => {
      state.players[0]!.startPlayer = false
      state.players[1]!.startPlayer = true
    })

    const taken = session.takeAction(0, 'forest')

    expectSettled(session, taken)
    expect(taken.state.players.map(player => player.startPlayer)).toEqual([true, false])
  })

  it('selection stores the chosen farm positions on the card', () => {
    const session = start(`leaf('selection', { actionContext: {
      selectableTiles: [{ row: 0, col: 2 }, { row: 1, col: 3 }], minSelections: 1, maxSelections: 1,
    } })`)

    const pending = session.takeAction(0, 'forest')
    expect(request(pending)).toMatchObject({
      kind: 'selection',
      selection: { kind: 'farm-position', selectablePositions: [{ row: 0, col: 2 }, { row: 1, col: 3 }], minSelections: 1, maxSelections: 1 },
    })
    expect(session.commitSelectionChoice(0, { positions: ['2-2'] }).ok).toBe(false)
    const chosen = session.commitSelectionChoice(0, { positions: ['1-3'] })

    expectSettled(session, chosen)
    expect(chosen.state.players[0]!.cardStates[CARD_ID]!.extraData).toMatchObject({ selectedPositions: ['1-3'] })
  })

  it('emit-choice asks the card\'s own question and resolveChoice answers it', () => {
    const session = start(`leaf('emit-choice', { params: {
      options: [{ value: 'one', labelKey: 'Take 1 grain' }, { value: 'two', labelKey: 'Take 2 grain' }], promptKey: 'Pick a reward',
    } })`)

    const pending = session.takeAction(0, 'forest')
    expect(pending.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 0, promptKey: 'Pick a reward',
      request: { kind: 'choice', options: [{ value: 'one', labelKey: 'Take 1 grain' }, { value: 'two', labelKey: 'Take 2 grain' }] },
    })
    const chosen = session.resolveChoice(0, 'two')

    expectSettled(session, chosen)
    expect(chosen.state.players[0]!.resources.grain).toBe(2)
  })

  it('reorganize lets the player move animals between their zones', () => {
    const session = start(`leaf('reorganize')`, (_state, owner) => sheepPasture(owner, 1))

    const pending = session.takeAction(0, 'forest')
    expect(pending.interaction).toMatchObject({ promptKey: 'ui.interactionAnimalReorg', request: { kind: 'animal-reorg' } })
    const moved = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: null, animalCount: 0 },
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ] as unknown as Record<string, unknown>)

    expectSettled(session, moved)
    expect(moved.state.players[0]!).toMatchObject({ houseAnimalType: 'sheep', houseAnimalCount: 1 })
    expect(moved.state.players[0]!.pastures[0]!.animalCount).toBe(0)
  })

  it('pop-card-stack-top removes the newest item of the card stack', () => {
    const session = start(`{ type: 'seq', children: [
      leaf('push-to-card-stack', { params: { item: 'first' } }),
      leaf('push-to-card-stack', { params: { item: 'second' } }),
      leaf('special-effect', { params: { kind: 'pop-card-stack-top' } }),
    ] }`)

    const popped = session.takeAction(0, 'forest')

    expectSettled(session, popped)
    expect(popped.state.players[0]!.cardStates[CARD_ID]!.stack).toEqual(['first'])
  })

  it('remove-future-meeples cancels only this card\'s goods scheduled for the given rounds', () => {
    const session = start(`leaf('special-effect', { params: { kind: 'remove-future-meeples', rounds: [11] } })`, (state, owner) => {
      const scheduled = (cardId: string, round: number) => ({
        id: `${cardId}-${round}`, cardId, playerId: owner.id, round, actionId: null, resources: { food: 1 },
      })
      state.futureMeeples.push(scheduled(CARD_ID, 11), scheduled(CARD_ID, 12), scheduled('A100_Curator', 11))
    })

    const removed = session.takeAction(0, 'forest')

    expectSettled(session, removed)
    expect(removed.state.futureMeeples.map(entry => entry.id)).toEqual([`${CARD_ID}-12`, 'A100_Curator-11'])
  })
})
