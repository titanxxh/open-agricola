import { afterEach, describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../shared/contract/types'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const BREEDER = 'D167_PureBreeder'
const PROVIDER = 'B165_GameProvider'

// #1158: stage continuations, animal housing and cooking are tested through
// public Session choices. Both printed occupations require four players.
function setup(card: string, round: number, configure: (state: GameState) => void) {
  const session = createWorkSession({ seed: 4258, options: { playerCount: 4 }, configure(state) {
    state.round = round
    for (const player of state.players) Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, food: 100,
    })
    state.players[0]!.occupationPlayed = [card]
    configure(state)
  } })
  sessions.push(session)
  return session
}

function pasture(player: PlayerState, sheep = 0) {
  player.pastures = [{ id: 'p1', tiles: [{ row: 0, col: 1 }], animalType: sheep ? 'sheep' : null, animalCount: sheep }]
  player.fenceSegments = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'].map(edge => ({
    edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id },
  }))
  player.stableTiles = [{ row: 0, col: 1 }]
  player.resources.sheep = sheep
}

function ok(response: SessionResponse): SessionResponse {
  expect(response.ok, response.error).toBe(true)
  return response
}

function drive(session: GameSession, stop: 'animal-reorg' | 'selection' | 'round', targetRound: number): SessionResponse {
  let response = session.getState()
  for (let step = 0; step < 100; step++) {
    if (response.state.round === targetRound && response.interaction.stateId === 'idle') return response
    const interaction = response.interaction
    if (interaction.stateId === 'idle') {
      const available = session.getActionAvailability(response.state.currentPlayerIndex)
      const space = ['forest', 'clay-pit', 'reed-bank', 'day-laborer', 'fishing', 'grain-seeds', 'copse', 'hollow-4', 'resource-market']
        .find(id => available[id])
      if (!space) throw new Error('No ordinary space for remaining workers')
      response = ok(session.takeAction(response.state.currentPlayerIndex, space))
    } else if (interaction.stateId === 'wait') {
      const request = interaction.request
      if (request.kind === stop) return response
      if (request.kind === 'confirm-next-player' || request.kind === 'confirm-player-switch') {
        response = ok(session.resolveChoice(interaction.playerIndex, 'confirm'))
      } else if (request.kind === 'choice' || request.kind === 'select-trigger') {
        const option = request.options.find(option => !('disabled' in option && option.disabled) && option.value !== '__pass__' &&
          !['__skip__', '__done__'].includes(option.value) && option.labelKey !== 'actions.exchange.name')
          ?? request.options.find(option => !('disabled' in option && option.disabled) && ['__pass__', '__skip__', '__done__'].includes(option.value))
        if (!option) throw new Error(`Unexpected choice: ${JSON.stringify(request)}`)
        response = ok(session.resolveChoice(interaction.playerIndex, option.value))
      } else if (request.kind === 'animal-reorg') {
        response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { zones: request.zones }))
      } else if (request.kind === 'feed') {
        response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] }))
      } else throw new Error(`Unexpected interaction: ${JSON.stringify(interaction)}`)
    } else throw new Error(`Unexpected state: ${JSON.stringify(interaction)}`)
  }
  throw new Error('Natural stage progression exceeded limit')
}

function house(session: GameSession, response: SessionResponse, animal: 'sheep' | 'boar', count: number, ownerIndex = 0) {
  const interaction = response.interaction
  if (interaction.stateId !== 'wait' || interaction.request.kind !== 'animal-reorg') throw new Error('Expected animal housing')
  expect(interaction.playerIndex).toBe(ownerIndex)
  const zones = interaction.request.zones.map(zone => ({ ...zone,
    animalType: zone.id === 'p1' ? animal : null, animalCount: zone.id === 'p1' ? count : 0,
  }))
  return ok(session.resolveChoice(ownerIndex, 'confirm', { zones }))
}

describe('Stage animal gains settle before continuation', () => {
  it('houses a nonharvest newborn before the next round starts and does not replay the gain', () => {
    const session = setup(BREEDER, 5, state => pasture(state.players[0]!, 2))
    const pending = drive(session, 'animal-reorg', 6)
    expect(pending.state.players[0]!.resources.sheep).toBe(3)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'animal-reorg' } })
    expect(pending.state.round).toBe(5)
    house(session, pending, 'sheep', 3)
    const completed = drive(session, 'round', 6)
    expect(completed.state.players[0]!.resources.sheep).toBe(3)
    expect(completed.state.players[0]!.pastures[0]!.animalCount).toBe(3)
    expect(completed.state.round).toBe(6)
  })
  it.each([1, 3, 4])('records and houses Game Provider pigs from %i distinct fields before ordinary breeding', count => {
    const session = setup(PROVIDER, 4, state => {
      const owner = state.players[0]!
      pasture(owner)
      owner.fields = [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }, { row: 1, col: 4 }]
        .map(tile => ({ ...tile, stacks: [{ kind: 'grain', remaining: 3 }] }))
    })
    const selection = drive(session, 'selection', 5)
    expect(selection.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'selection' } })
    const positions = selection.state.players[0]!.fields.slice(0, count).map(({ row, col }) => ({ row, col }))
    const acquired = ok(session.commitSelectionChoice(0, { positions }))
    const reward = count === 1 ? 1 : count === 3 ? 2 : 3
    expect(acquired.state.players[0]!.resources.boar).toBe(reward)
    expect(acquired.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === PROVIDER && event.resources.boar === reward)).toHaveLength(1)
    house(session, acquired, 'boar', reward)
    if (count > 1) {
      const breeding = drive(session, 'animal-reorg', 5)
      expect(breeding.state.players[0]!.resources.boar).toBe(reward + 1)
      house(session, breeding, 'boar', reward + 1)
    }
    const completed = drive(session, 'round', 5)
    expect(completed.state.players[0]!.pastures[0]!.animalCount).toBe(count === 1 ? 1 : count === 3 ? 3 : 4)
    expect(completed.state.players[0]!.fields.map(field => field.stacks[0]!.remaining)).toEqual(
      count === 1 ? [1, 2, 2, 2] : count === 3 ? [1, 1, 1, 2] : [1, 1, 1, 1])
    expect(completed.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === PROVIDER && event.resources.boar === reward)).toHaveLength(1)
  })

  it('allows immediate cooking before housing a Game Provider pig', () => {
    const session = setup(PROVIDER, 4, state => {
      const owner = state.players[0]!
      owner.improvements = ['Major_Fireplace1']
      state.availableMajorImprovements = state.availableMajorImprovements.filter(id => id !== 'Major_Fireplace1')
      owner.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }]
    })
    drive(session, 'selection', 5)
    const acquired = ok(session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] }))
    expect(acquired.state.players[0]!.resources.boar).toBe(1)
    expect(Object.values(acquired.state.players[0]!.houseAnimals)).toEqual([])
    const food = acquired.state.players[0]!.resources.food
    const opened = ok(session.takeAnytimeAction(0, 'exchange'))
    if (opened.interaction.stateId !== 'wait' || opened.interaction.request.kind !== 'choice') throw new Error('Expected cooking choices')
    const recipe = opened.interaction.request.options.find(option => option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesPaid?.boar === 1)
    if (!recipe) throw new Error('Expected a pig cooking recipe')
    const cooked = ok(session.resolveChoice(0, `bulk:${recipe.value.split(':')[1]}=1`))
    expect(cooked.state.players[0]!.resources).toMatchObject({ boar: 0, food: food + 2 })
    expect(cooked.state.events).toContainEqual(expect.objectContaining({ type: 'resource.exchanged', paid: { boar: 1 }, gained: { food: 2 } }))
    expect(drive(session, 'round', 5).state.players[0]!.resources.boar).toBe(0)
  })

  it('discards a pig that has no legal holder without leaking it into the next round', () => {
    const session = setup(PROVIDER, 4, state => {
      const owner = state.players[0]!
      owner.resources.sheep = 1
      owner.houseAnimals = { '1-0': 'sheep' }
      owner.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }]
    })
    drive(session, 'selection', 5)
    const acquired = ok(session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] }))
    const interaction = acquired.interaction
    if (interaction.stateId !== 'wait' || interaction.request.kind !== 'animal-reorg') throw new Error('Expected animal disposal')
    ok(session.resolveChoice(0, 'confirm', { zones: interaction.request.zones.map(zone => ({ ...zone,
      animalType: zone.id === 'house:1-0' ? 'sheep' : null, animalCount: zone.id === 'house:1-0' ? 1 : 0,
    })) }))
    const completed = drive(session, 'round', 5)
    expect(completed.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 0 })
  })

  it('restores the pending stage, rejects invalid housing, and resumes once after a legal retry', () => {
    const session = setup(BREEDER, 5, state => pasture(state.players[0]!, 2))
    const pending = drive(session, 'animal-reorg', 6)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
    sessions.push(restored)
    expect(restored.getState().interaction).toEqual(pending.interaction)
    const before = JSON.parse(JSON.stringify(restored.getState()))
    const rejected = restored.resolveChoice(0, 'confirm', { zones: [{ id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: 5 }] })
    expect(rejected.ok).toBe(false)
    expect(JSON.parse(JSON.stringify(rejected.state))).toEqual(before.state)
    expect(rejected.interaction).toEqual(before.interaction)
    house(restored, restored.getState(), 'sheep', 3)
    const completed = drive(restored, 'round', 6)
    expect(completed.state.players[0]!.resources.sheep).toBe(3)
    expect(completed.state.players[0]!.pastures[0]!.animalCount).toBe(3)
    expect(completed.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === BREEDER && event.resources.sheep === 1)).toHaveLength(1)
  })

  it('settles the card owner independently of the player who finished the round', () => {
    const session = setup(BREEDER, 5, state => {
      state.players[0]!.occupationPlayed = []
      state.players[1]!.occupationPlayed = [BREEDER]
      pasture(state.players[1]!, 2)
    })
    const pending = drive(session, 'animal-reorg', 6)
    expect(pending.state.players[0]!.resources.sheep).toBe(0)
    expect(pending.state.players[1]!.resources.sheep).toBe(3)
    house(session, pending, 'sheep', 3, 1)
    const completed = drive(session, 'round', 6)
    expect(completed.state.players[1]!.pastures[0]!.animalCount).toBe(3)
    expect(completed.state.players[0]!.resources.sheep).toBe(0)
  })
})
