import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { getCardEffect } from '../../shared/cards/card-effects'
import { setCardFlag, isCardFlagged } from '../../shared/cards/helpers/card-state'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import type {
  ActionSpace,
  GameState,
  PlayerState,
} from '../../shared/contract/types'

import '../../shared/cards/D/D093_SheepInspector'
import type { ActionChoiceOption , ActionFlow } from '../../shared/contract/types'
import type { SessionResponse } from '../../shared/session/session-core'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

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
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
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

const findListener = () =>
  getRegisteredCardListeners().find((l) => l.id === 'D93-sheep-inspector-after-place-farmer')

describe('D093_SheepInspector listener', () => {
  it('is registered on place-farmer after (player scope)', () => {
    const listener = findListener()
    expect(listener).toBeDefined()
    expect(listener!.actions).toContain('place-farmer')
    expect(listener!.phases).toContain('after')
    expect(listener!.scope).toBe('player')
  })


  it('does nothing when already flagged this work phase', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    setCardFlag(player, CARD_ID, true)

    const forest = createSpace('forest', player.id)
    const justPlaced = createSpace('clay-pit', player.id)
    const state = createState([player], [forest, justPlaced])

    const result = executeCardListener(listener, {
      state,
      player,
      space: justPlaced,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('does nothing if no other placed worker exists', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)

    const justPlaced = createSpace('clay-pit', player.id)
    const opponentSpace = createSpace('forest', 'p2')
    const state = createState([player], [justPlaced, opponentSpace])

    const result = executeCardListener(listener, {
      state,
      player,
      space: justPlaced,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('excludes Meeting Place from candidate list', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)

    const meetingPlace = createSpace('meeting-place', player.id)
    const justPlaced = createSpace('clay-pit', player.id)
    const state = createState([player], [meetingPlace, justPlaced])

    const result = executeCardListener(listener, {
      state,
      player,
      space: justPlaced,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)

    // Only Meeting Place is a candidate — which is excluded — so no flow.
    expect(result).toBeUndefined()
  })

  it('returns optional seq with flag + pay + recall when candidates exist', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)

    const forest = createSpace('forest', player.id)
    const clayPit = createSpace('clay-pit', player.id)
    const justPlaced = createSpace('farmland', player.id)
    const state = createState([player], [forest, clayPit, justPlaced])

    const result = executeCardListener(listener, {
      state,
      player,
      space: justPlaced,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)

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

  it('onRoundStart unflags the card if flagged', () => {
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    setCardFlag(player, CARD_ID, true)
    expect(isCardFlagged(player, CARD_ID)).toBe(true)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    expect(effect!.onRoundStart).toBeDefined()

    const state = createState([player], [])
    effect!.onRoundStart!(state, player)
    expect(isCardFlagged(player, CARD_ID)).toBe(false)
  })

})

describe('D093_SheepInspector end-to-end via GameSession', () => {
  const setup = () => {
    const session = new GameSession(42)
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
    if (forest) forest.takenBy = player.id

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
