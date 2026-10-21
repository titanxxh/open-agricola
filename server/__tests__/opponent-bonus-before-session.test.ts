import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { GameState, Resource } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

type Example = {
  card: string
  space: string
  players?: number
  occupation?: boolean
  stock: Partial<Resource>
  reward: Partial<Resource>
  actorReward?: Partial<Resource>
}

const examples: Example[] = [
  { card: 'A050_MilkJug', space: 'cattle-market', stock: { cattle: 1 }, reward: { food: 3 }, actorReward: { food: 1 } },
  { card: 'A077_Hod', space: 'pig-market', stock: { boar: 1 }, reward: { clay: 2 } },
  { card: 'C141_SheepProvider', occupation: true, players: 3, space: 'sheep-market', stock: { sheep: 1 }, reward: { grain: 1 } },
  { card: 'E160_KelpGatherer', occupation: true, players: 4, space: 'fishing', stock: { food: 2 }, reward: { vegetable: 1 }, actorReward: { food: 3 } },
]

function setup(example: Example, actor = 1, configure?: (state: GameState) => void) {
  const session = createWorkSession({ seed: 1329, options: { playerCount: example.players ?? 2 }, configure: state => {
    state.round = 14
    state.currentPlayerIndex = actor
    for (const player of state.players) {
      for (const resource of Object.keys(player.resources)) Reflect.set(player.resources, resource, 0)
      player.cardStates = {}
      setWorkersAtHome(state, player, 2)
    }
    for (const space of state.actionSpaces) space.takenBy = []
    Object.assign(state.actionSpaces.find(space => space.id === example.space)!.resources, example.stock)
    if (example.occupation) state.players[0]!.occupationPlayed = [example.card]
    else state.players[0]!.minorPlayed = [example.card]
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

function assertBefore(response: SessionResponse, example: Example, actor = 1) {
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.resources).toMatchObject(example.reward)
  if (actor !== 0) expect(response.state.players[actor]!.resources, JSON.stringify(response.interaction)).toMatchObject({ ...example.stock, ...example.actorReward })
  const gains = response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === example.card)
  expect(gains.length).toBeGreaterThan(0)
  const host = response.state.events.find(event => event.type === 'resource.moved' && event.reason === 'collect' && event.from.kind === 'actionSpace' && event.from.spaceId === example.space)
  expect(host).toBeDefined()
  for (const gain of gains) expect(gain.seq).toBeLessThan(host!.seq)
  expect(readCardResourceStats(response.state.players[0]!, example.card)?.used).toBe(1)
  if (actor !== 0) expect(readCardResourceStats(response.state.players[actor]!, example.card)).toBeUndefined()
  expect(response.state.log.filter(entry => entry.key === 'log.cardTriggered' && entry.params?.cardId === example.card)).toHaveLength(1)
}

function confirmSwitches(session: GameSession, response: SessionResponse): SessionResponse {
  while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') {
    response = confirmPlayerSwitch(session)
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

describe('opponent-space rewards before the host collection', () => {
  it.each(examples)('$card rewards its owner before the opponent takes $space', example => {
    assertBefore(setup(example).takeAction(1, example.space), example)
  })

  it('C164 gives and houses the owner sheep before the opponent collects the boar', () => {
    const example: Example = { card: 'C164_GermanHeathKeeper', occupation: true, players: 4, space: 'pig-market', stock: { boar: 1 }, reward: { sheep: 1 } }
    const session = setup(example)
    const pending = session.takeAction(1, example.space)
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.state.players[0]!.resources.sheep).toBe(1)
    expect(pending.state.players[1]!.resources.boar).toBe(0)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'animal-reorg' } })
    const response = session.resolveChoice(0, 'confirm', [{ id: 'house:2-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 }])
    assertBefore(response, example)
  })

  it.each(['food', 'stable', 'skip'])('D149 resolves the owner %s choice before the opponent Quarry', reward => {
    const example: Example = { card: 'D149_CasualWorker', occupation: true, players: 4, space: 'western-quarry', stock: { stone: 1 }, reward: reward === 'food' ? { food: 1 } : {} }
    const session = setup(example)
    let pending = session.takeAction(1, example.space)
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.state.players[1]!.resources.stone).toBe(0)
    pending = confirmSwitches(session, pending)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice' } })
    if (pending.interaction.stateId !== 'wait') throw new Error('Expected Casual Worker choice')
    const option = pending.interaction.request.options?.find(option => reward === 'skip'
      ? option.value === '__skip__'
      : reward === 'stable' ? option.labelKey === 'actions.stables.name'
        : option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesGained?.food === 1)
    expect(option, JSON.stringify(pending.interaction)).toBeDefined()
    let response = session.resolveChoice(0, option!.value)
    expect(response.ok, response.error).toBe(true)
    if (reward === 'stable') {
      expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select' } })
      expect(response.state.players[1]!.resources.stone).toBe(0)
      response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 0 }] })
      expect(response.ok, response.error).toBe(true)
    }
    response = confirmSwitches(session, response)
    expect(response.state.players[1]!.resources.stone).toBe(1)
    expect(response.state.players[1]!.stableTiles).toEqual([])
    expect(response.state.players[0]!.resources.wood).toBe(0)
    if (reward === 'food') assertBefore(response, example)
    else if (reward === 'stable') {
      expect(response.state.players[0]!.stableTiles).toEqual([{ row: 0, col: 0 }])
      const built = response.state.events.find(event => event.type === 'farm.stableBuilt' && event.sourceCardId === example.card)
      const host = response.state.events.find(event => event.type === 'resource.moved' && event.reason === 'collect')
      expect(built!.seq).toBeLessThan(host!.seq)
    } else {
      expect(response.state.players[0]!.resources.food).toBe(0)
      expect(response.state.players[0]!.stableTiles).toEqual([])
    }
  })

  it('E148 builds the owner stable before the opponent receives Grain Seeds', () => {
    const example: Example = { card: 'E148_Lazybones', occupation: true, players: 4, space: 'grain-seeds', stock: {}, reward: {} }
    const session = setup(example, 1, state => {
      state.players[0]!.cardStates[example.card] = { extraData: { reservedActionSpaces: ['grain-seeds'] } }
    })
    let pending = session.takeAction(1, example.space)
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.state.players[1]!.resources.grain).toBe(0)
    pending = confirmSwitches(session, pending)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select' } })
    expect(pending.state.players[0]!.cardStates[example.card]?.extraData?.reservedActionSpaces).toEqual([])
    const response = confirmSwitches(session, session.commitSelectionChoice(0, { stables: [{ row: 0, col: 0 }] }))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toEqual([{ row: 0, col: 0 }])
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, wood: 0 })
    expect(response.state.players[1]!.stableTiles).toEqual([])
    expect(response.state.players[1]!.resources.grain).toBe(1)
    const built = response.state.events.find(event => event.type === 'farm.stableBuilt' && event.sourceCardId === example.card)
    const host = response.state.events.find(event => event.type === 'resource.moved' && !event.sourceCardId)
    expect(built!.seq).toBeLessThan(host!.seq)
    expect(readCardResourceStats(response.state.players[0]!, example.card)?.used).toBe(1)
  })

  it('E066 grants the solo owner grain before collecting Forest wood', () => {
    const example: Example = { card: 'E066_BarnShed', players: 1, space: 'forest', stock: { wood: 1 }, reward: { grain: 1 } }
    assertBefore(setup(example, 0).takeAction(0, example.space), example, 0)
  })

  it('E066 keeps the opponent Forest reward after collection in multiplayer', () => {
    const example: Example = { card: 'E066_BarnShed', space: 'forest', stock: { wood: 1 }, reward: { grain: 1 } }
    const session = setup(example)
    const response = confirmSwitches(session, session.takeAction(1, example.space))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 1, grain: 0 })
    const gain = response.state.events.find(event => event.type === 'resource.moved' && event.sourceCardId === example.card)
    const host = response.state.events.find(event => event.type === 'resource.moved' && event.reason === 'collect')
    expect(gain!.seq).toBeGreaterThan(host!.seq)
    const self = setup(example, 0).takeAction(0, example.space)
    expect(self.ok, self.error).toBe(true)
    expect(self.state.players[0]!.resources).toMatchObject({ wood: 1, grain: 0 })
  })

  const quietExamples: Example[] = [
    ...examples,
    { card: 'C164_GermanHeathKeeper', occupation: true, players: 4, space: 'pig-market', stock: { boar: 1 }, reward: {} },
    { card: 'D149_CasualWorker', occupation: true, players: 4, space: 'western-quarry', stock: { stone: 1 }, reward: {} },
    { card: 'E148_Lazybones', occupation: true, players: 4, space: 'grain-seeds', stock: {}, reward: {} },
    { card: 'E066_BarnShed', space: 'forest', stock: { wood: 1 }, reward: {} },
  ]

  it.each(quietExamples)('$card does not react to an unrelated opponent Reed Bank', example => {
    const response = setup(example).takeAction(1, 'reed-bank')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.events.filter(event => event.sourceCardId === example.card)).toEqual([])
    expect(readCardResourceStats(response.state.players[0]!, example.card)).toBeUndefined()
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 0, vegetable: 0, sheep: 0, clay: 0 })
  })

  it.each(['D149_CasualWorker', 'E148_Lazybones', 'E160_KelpGatherer'])('%s does not react to its owner space use', card => {
    const space = card === 'D149_CasualWorker' ? 'western-quarry' : card === 'E148_Lazybones' ? 'grain-seeds' : 'fishing'
    const example: Example = { card, occupation: true, players: 4, space, stock: card === 'D149_CasualWorker' ? { stone: 1 } : card === 'E160_KelpGatherer' ? { food: 2 } : {}, reward: {} }
    const response = setup(example, 0, state => {
      if (card === 'E148_Lazybones') state.players[0]!.cardStates[card] = { extraData: { reservedActionSpaces: ['grain-seeds'] } }
    }).takeAction(0, space)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.events.filter(event => event.sourceCardId === card)).toEqual([])
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(readCardResourceStats(response.state.players[0]!, card)).toBeUndefined()
    if (card === 'E148_Lazybones') expect(response.state.players[0]!.cardStates[card]?.extraData?.reservedActionSpaces).toEqual(['grain-seeds'])
  })

  it.each(examples.filter(example => example.card !== 'E160_KelpGatherer'))('$card also grants the owner reward before its own collection', example => {
    assertBefore(setup(example, 0).takeAction(0, example.space), example, 0)
  })

  it('E148 does not build without a reserved token for the used space', () => {
    const example: Example = { card: 'E148_Lazybones', occupation: true, players: 4, space: 'grain-seeds', stock: {}, reward: {} }
    const response = setup(example).takeAction(1, example.space)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.events.filter(event => event.sourceCardId === example.card)).toEqual([])
  })

  it('E160 restores both recipients and owner usage on undo before one retry', () => {
    const example = examples.find(example => example.card === 'E160_KelpGatherer')!
    const session = setup(example)
    assertBefore(session.takeAction(1, example.space), example)
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources.vegetable).toBe(0)
    expect(undone.state.players[1]!.resources.food).toBe(0)
    expect(readCardResourceStats(undone.state.players[0]!, example.card)).toBeUndefined()
    assertBefore(session.takeAction(1, example.space), example)
  })
})
