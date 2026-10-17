import { CardRegistry as TestCardRegistry } from '../../shared/cards/registry'
import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { setCardFlag, isCardFlagged } from '../../shared/cards/helpers/card-state'
import { markAllWorkersUsed, setWorkersAtHome, workersAtHome } from '../../shared/domain/player'
import type {
  ActionSpace,
  GameState,
  PlayerState,
} from '../../shared/contract/types'

import '../../shared/cards/D/D093_SheepInspector'
import type { ActionChoiceOption , ActionFlow } from '../../shared/contract/types'
import type { SessionResponse } from '../../shared/session/session-core'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, confirmNext } from './_helpers/negative-rule-audit'
import * as audit45Placement from './_helpers/audit/ae-negative-45-placement'

const CARD_ID = 'D093_SheepInspector'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id,
    name: id,
    color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood' as const,
    fields: [], fences: 0,
    roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimals: {}, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as unknown as PlayerState

const createSpace = (id: string, takenBy: string | null = null): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    descriptionKey: `actions.${id}.description`,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' as const }),
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    takenBy: takenBy ? [{ playerId: takenBy, workerId: '1' }] : [],
  }) as unknown as ActionSpace

const createState = (
  players: PlayerState[],
  spaces: ActionSpace[],
): GameState =>
  ({
    round: 3,
    currentPlayerIndex: 0,
    players,
    actionSpaces: spaces,
    log: [],
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as unknown as GameState

const findListener = (ruleOwner: TestCardRegistry) =>
  {
  const lookupRule1 = () => getRegisteredCardListeners().find((l) => l.id === 'D93-sheep-inspector-after-place-farmer')
  return withActiveRegistry(ruleOwner, lookupRule1)
}

describe('D093_SheepInspector listener', () => {
  it('is registered on place-farmer after (player scope)', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry)
    expect(listener).toBeDefined()
    expect(listener!.actions).toContain('place-farmer')
    expect(listener!.phases).toContain('after')
    expect(listener!.scope).toBe('player')
  })


  it('does nothing when already flagged this work phase', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry)!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    setCardFlag(player, CARD_ID, true)

    const forest = createSpace('forest', player.id)
    const justPlaced = createSpace('clay-pit', player.id)
    const state = createState([player], [forest, justPlaced])

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state,
      player,
      space: justPlaced,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext))

    expect(result).toBeUndefined()
  })

  it('does nothing if no other placed worker exists', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry)!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)

    const justPlaced = createSpace('clay-pit', player.id)
    const opponentSpace = createSpace('forest', 'p2')
    const state = createState([player], [justPlaced, opponentSpace])

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state,
      player,
      space: justPlaced,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext))

    expect(result).toBeUndefined()
  })

  it('excludes Meeting Place from candidate list', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry)!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)

    const meetingPlace = createSpace('meeting-place', player.id)
    const justPlaced = createSpace('clay-pit', player.id)
    const state = createState([player], [meetingPlace, justPlaced])

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state,
      player,
      space: justPlaced,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext))

    // Only Meeting Place is a candidate — which is excluded — so no flow.
    expect(result).toBeUndefined()
  })

  it('returns optional seq with flag + pay + recall when candidates exist', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry)!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)

    const forest = createSpace('forest', player.id)
    const clayPit = createSpace('clay-pit', player.id)
    const justPlaced = createSpace('farmland', player.id)
    const state = createState([player], [forest, clayPit, justPlaced])

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state,
      player,
      space: justPlaced,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext))

    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.type).toBe('seq')
    expect(flow.optional).toBe(true)
    expect(flow.children).toHaveLength(3)
    expect(flow.children[0]).toMatchObject({ actionId: 'special-effect', params: { kind: 'set-flag', flag: true } })
    expect(flow.children[1].actionId).toBe('pay')
    expect(flow.children[1].params).toEqual({ sheep: 1, food: 2 })
    expect(flow.children[2].actionId).toBe('recall-placed-worker')
    expect(flow.children[2].params.excludeSpaceId).toBe('farmland')
    expect(flow.children[2].params.excludeMeetingPlace).toBe(true)
  })

  it('work start unflags Sheep Inspector after the next preparation', () => {
    const session = createWorkSession({ seed: 42, configure(state) {
      state.round = 2
      state.players[0]!.occupationPlayed = [CARD_ID]
      setCardFlag(state.players[0]!, CARD_ID, true)
      state.players.forEach(player => {
        player.resources.food = 20
        markAllWorkersUsed(state, player)
      })
    } })
    try {
      expect(isCardFlagged(session.state.players[0]!, CARD_ID)).toBe(true)
      const response = session.performRoundEnd()
      expect(response.ok, response.error).toBe(true)
      expect(response.state.round).toBe(3)
      expect(response.state.roundPhase).toBe('work')
      expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(false)
    } finally {
      session.dispose()
    }
  })

})

describe('D093_SheepInspector end-to-end via GameSession', () => {
  const setup = () => {
    const session = createWorkSession({ seed: 42 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    // Give the player enough resources: 1 sheep + 2 food (plus 1 worker to place).
    player.resources.sheep = 1
    player.resources.food = 2
    setWorkersAtHome(state, player, 1)
    state.players[1]!.workersAvailable = 1

    // Pretend the player already placed another worker earlier on 'forest'.
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.takenBy = [{ playerId: player.id, workerId: '1' }]

    session.loadState(state)
    return session
  }

  const walkToChoice = (session: GameSession, resp: SessionResponse) => {
    let r = resp
    let safety = 30
    while (safety-- > 0) {
      if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-player-switch') {
        r = confirmPlayerSwitch(session)
        continue
      }
      break
    }
    return r
  }

  it('accepting the optional seq pays 1 sheep + 2 food and recalls the chosen worker', () => {
    const session = setup()
    const before = session.getState().state.players[0]!
    const sheepBefore = before.resources.sheep
    const foodBefore = before.resources.food

    // Place on day-laborer: grants +2 food from the space itself.
    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    resp = walkToChoice(session, resp)

    // Should now be at the optional-seq prompt (choice with skip / accept).
    expect(resp.interaction.stateId).toBe('wait')
    const options = resp.interaction.request.options ?? []
    const acceptOption = options.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(acceptOption).toBeDefined()
    resp = session.resolveChoice(0, acceptOption!.value)
    resp = walkToChoice(session, resp)

    // If multiple candidate spaces existed we'd see another choice; here only
    // `forest` is a candidate (excluding the just-placed `day-laborer`), so the
    // helper auto-resolves. But if it pops a choice for recall, resolve it.
    if (resp.interaction.stateId === 'wait') {
      const opts = resp.interaction.request.options ?? []
      const forestOption = opts.find((o: ActionChoiceOption) => String(o.value) === 'forest')
      expect(forestOption).toBeDefined()
      resp = session.resolveChoice(0, forestOption!.value)
      resp = walkToChoice(session, resp)
    }

    const after = resp.state.players[0]!
    expect(after.resources.sheep).toBe(sheepBefore - 1)
    // day-laborer +2 food, paid -2 food → net 0.
    expect(after.resources.food).toBe(foodBefore + 2 - 2)

    // Forest is unoccupied again.
    const forestAfter = resp.state.actionSpaces.find((s) => s.id === 'forest')
    expect(forestAfter?.takenBy).toEqual([])

    // Card flagged (used this work phase).
    expect(isCardFlagged(after, CARD_ID)).toBe(true)
  })

  it('declining via __skip__ leaves resources, placement, and flag untouched', () => {
    const session = setup()
    const before = session.getState().state.players[0]!
    const sheepBefore = before.resources.sheep
    const foodBefore = before.resources.food

    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    resp = walkToChoice(session, resp)

    // Decline the optional seq.
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.resolveChoice(0, '__skip__')
    resp = walkToChoice(session, resp)

    const after = resp.state.players[0]!
    expect(after.resources.sheep).toBe(sheepBefore)
    // day-laborer granted +2 food.
    expect(after.resources.food).toBe(foodBefore + 2)
    const forestAfter = resp.state.actionSpaces.find((s) => s.id === 'forest')
    expect(forestAfter?.takenBy.some((t) => t.playerId === after.id)).toBe(true)
    expect(isCardFlagged(after, CARD_ID)).toBe(false)
  })
})

describe('ae-negative-45-placement', () => {
  const { sessions, save, ok, setup, choice, finish, next, inspector, optionsOf, requestOf } = audit45Placement
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D093 N1 real second placement pays one sheep two food recalls prior Forest and excludes the just placed person', () => { const { s } = inspector(); let r = ok(s.takeAction(0, 'day-laborer')); r = choice(s, r, o => o.value !== '__skip__'); if (requestOf(r).kind === 'select-trigger')
    r = choice(s, r, o => o.value === 'D093_SheepInspector'); if (optionsOf(r)?.some(o => o.value === '__accept__'))
    r = choice(s, r, o => o.value === '__accept__'); assertRejectedUnchanged(s, () => s.resolveChoice(0, 'day-laborer')); if (optionsOf(r)?.some(o => o.value === 'forest'))
    r = choice(s, r, o => o.value === 'forest'); assert.equal(r.state.players[0]!.resources.sheep, 0); assert.equal(r.state.players[0]!.resources.food, 2); assert.equal(r.state.actionSpaces.find(a => a.id === 'forest')!.takenBy.length, 0); assert.equal(r.state.actionSpaces.find(a => a.id === 'day-laborer')!.takenBy.length, 1); assert.equal(workersAtHome(r.state, r.state.players[0]!).length, 1); save('D093-N1', r); })
  it('D093 N2 declining leaves sheep food and prior worker while Meeting Place and no sheep prevent recall', () => { for (const mode of ['decline', 'meeting', 'sheep']) {
    const { s } = inspector(mode === 'meeting' ? 'meeting-place' : 'forest', mode !== 'sheep')
    const r = finish(s, ok(s.takeAction(0, 'day-laborer')))
    assert.equal(r.state.players[0]!.resources.sheep, mode === 'sheep' ? 0 : 1)
    assert.equal(r.state.players[0]!.resources.food, 4)
    assert.equal(r.state.actionSpaces.find(a => a.id === (mode === 'meeting' ? 'meeting-place' : 'forest'))!.takenBy.length, 1)
    save(`D093-N2-${mode}`, r)
  } })
  it('D093 N3 enough remaining sheep and food cannot recall twice and natural new work phase resets usage', () => {
    const s = setup('D093_SheepInspector', state => { const p = state.players[0]!; p.resources.food = 4; p.resources.sheep = 2; p.pastures = [{ id: 'inspector-pen', tiles: [{ row: 0, col: 2 }], animalType: 'sheep', animalCount: 2 }]; p.fenceSegments = ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } })); })
    finish(s, ok(s.takeAction(0, 'forest')))
    next(s)
    finish(s, ok(s.takeAction(1, 'grain-seeds')))
    next(s)
    let r = finish(s, ok(s.takeAction(0, 'day-laborer')), true)
    assert.equal(r.state.players[0]!.resources.sheep, 1)
    assert.equal(r.state.players[0]!.resources.food, 4)
    assert.equal(r.state.players[0]!.cardStates.D093_SheepInspector?.flagged, true)
    next(s)
    finish(s, ok(s.takeAction(1, 'clay-pit')))
    next(s)
    r = ok(s.takeAction(0, 'reed-bank'))
    assert.equal(r.state.players[0]!.resources.sheep, 1)
    assert.equal(r.state.players[0]!.resources.food, 4)
    assert.equal(r.state.actionSpaces.find(a => a.id === 'day-laborer')!.takenBy.length, 1)
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    r = finish(s, r)
    assert.equal(r.state.round, 9)
    assert.equal(r.state.players[0]!.cardStates.D093_SheepInspector?.flagged, false)
    save('D093-N3', r)
  })
})
