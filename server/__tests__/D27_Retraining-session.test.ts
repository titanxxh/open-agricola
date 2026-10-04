import { type SessionResponse } from '../game/authoritative-session'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { setCardFlag, isCardFlagged } from '../../shared/cards/helpers/card-state'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { GameState, PlayerState, ActionSpace, ActionChoiceOption } from '../../shared/contract/types'

import '../../shared/cards/D/D027_Retraining'

const CARD_ID = 'D027_Retraining'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
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
    fields: [], fences: 0, roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as unknown as PlayerState

const createState = (players: PlayerState[], majors: string[] = []): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [],
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: majors,
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    takenBy: [],
  }) as unknown as ActionSpace

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

const setupSwapSession = () => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.improvements = ['Major_Joinery']
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  setCardFlag(player, CARD_ID, true)
  setWorkersAtHome(state, player, 2)
  state.availableMajorImprovements = ['Major_Pottery', 'Major_Basket']
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  forest.resources = { ...(forest.resources ?? {}), wood: 1 }

  session.loadState(state)
  return session
}

describe('D027_Retraining listeners', () => {
  it('registers both renovation-after and place-farmer-after listeners', () => {
    expect(findListener('D27-retraining-after-renovation')).toBeDefined()
    expect(findListener('D27-retraining-after-place-farmer')).toBeDefined()
  })

  it('renovation listener returns a set-flag flow without mutating immediately', () => {
    const listener = findListener('D27-retraining-after-renovation')!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    const state = createState([player])

    const result = executeCardListener(listener, {
      state, player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result?.flow).toEqual({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-flag', flag: true },
    })
    expect(isCardFlagged(player, CARD_ID)).toBe(false)
  })


  it('place-farmer listener offers Joinery→Pottery swap without immediate mutation', () => {
    const listener = findListener('D27-retraining-after-place-farmer')!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    player.improvements.push('Major_Joinery')
    setCardFlag(player, CARD_ID, true)
    const state = createState([player], ['Major_Pottery'])

    const result = executeCardListener(listener, {
      state, player, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-flag', flag: false },
        },
        {
          type: 'seq',
          optional: true,
          children: [
            {
              type: 'leaf',
              actionId: 'special-effect',
              sourceCard: CARD_ID,
              params: {
                kind: 'swap-improvement-with-board',
                from: 'Major_Joinery',
                to: 'Major_Pottery',
              },
            },
          ],
        },
      ],
    })
    expect(isCardFlagged(player, CARD_ID)).toBe(true)
    expect(state.availableMajorImprovements).toContain('Major_Pottery')
    expect(player.improvements).toContain('Major_Joinery')
  })

  it('place-farmer listener offers Pottery→Basket when Pottery is played', () => {
    const listener = findListener('D27-retraining-after-place-farmer')!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    player.improvements.push('Major_Pottery')
    setCardFlag(player, CARD_ID, true)
    const state = createState([player], ['Major_Basket'])

    const result = executeCardListener(listener, {
      state, player, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-flag', flag: false },
        },
        {
          type: 'seq',
          optional: true,
          children: [
            {
              type: 'leaf',
              actionId: 'special-effect',
              sourceCard: CARD_ID,
              params: {
                kind: 'swap-improvement-with-board',
                from: 'Major_Pottery',
                to: 'Major_Basket',
              },
            },
          ],
        },
      ],
    })
    expect(isCardFlagged(player, CARD_ID)).toBe(true)
    expect(state.availableMajorImprovements).toContain('Major_Basket')
  })

  it('place-farmer listener clears the flag by flow when no swap is available', () => {
    const listener = findListener('D27-retraining-after-place-farmer')!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    setCardFlag(player, CARD_ID, true)
    const state = createState([player], []) // no majors available

    const result = executeCardListener(listener, {
      state, player, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result?.flow).toEqual({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-flag', flag: false },
    })
    expect(isCardFlagged(player, CARD_ID)).toBe(true)
  })

  it('place-farmer listener does nothing if card is not flagged', () => {
    const listener = findListener('D27-retraining-after-place-farmer')!
    const player = createPlayer('p1')
    player.minorPlayed.push(CARD_ID)
    player.improvements.push('Major_Joinery')
    const state = createState([player], ['Major_Pottery'])

    const result = executeCardListener(listener, {
      state, player, space: createSpace('place-farmer'),
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
    expect(state.availableMajorImprovements).toContain('Major_Pottery')
  })

  it('declining the optional swap clears the flag but leaves board and player majors unchanged', () => {
    const session = setupSwapSession()

    const resp = session.takeAction(0, 'forest')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    expect(isCardFlagged(resp.state.players[0]!, CARD_ID)).toBe(false)
    expect(resp.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(resp.state.players[0]!.improvements).not.toContain('Major_Pottery')
    expect(resp.state.availableMajorImprovements).toContain('Major_Pottery')

    const declined = session.resolveChoice(0, '__skip__')

    expect(declined.ok).toBe(true)
    expect(declined.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(declined.state.players[0]!.improvements).not.toContain('Major_Pottery')
    expect(declined.state.availableMajorImprovements).toContain('Major_Pottery')
    expect(declined.state.availableMajorImprovements).not.toContain('Major_Joinery')
  })

  it('accepting the optional swap exchanges the player major with the board', () => {
    const session = setupSwapSession()

    const resp = session.takeAction(0, 'forest')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    const acceptOption = resp.interaction.request.options?.find((option: ActionChoiceOption) => option.value !== '__skip__')
    expect(acceptOption).toBeDefined()

    const accepted = session.resolveChoice(0, acceptOption!.value)

    expect(accepted.ok).toBe(true)
    expect(accepted.state.players[0]!.improvements).toContain('Major_Pottery')
    expect(accepted.state.players[0]!.improvements).not.toContain('Major_Joinery')
    expect(accepted.state.availableMajorImprovements).toContain('Major_Joinery')
    expect(accepted.state.availableMajorImprovements).not.toContain('Major_Pottery')
  })
})

describe('D027 Retraining parity', () => {
  const CARD_ID = 'D027_Retraining'

  const FILLER = '__test_placeholder__'

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const setup = ({
    played = true, occupations = 1, major, targetOwner = -1,
  }: {
    played?: boolean
    occupations?: number
    major?: 'Major_Joinery' | 'Major_Pottery'
    targetOwner?: number
  } = {}) => {
    const session = new GameSession(6027, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => {
      space.takenBy = []
      if (space.id === 'house-redevelopment') space.roundAvailable = 1
    })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, index === 0 ? 2 : 0)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.houseType = 'wood'
      player.rooms = 2
      player.resources = {
        ...player.resources,
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.occupationPlayed = occupations > 0 ? ['A100_Curator'] : []
    owner.resources = { ...owner.resources, food: played ? 0 : 1, clay: 2, reed: 1 }
    if (major) {
      owner.improvements.push(major)
      state.availableMajorImprovements = state.availableMajorImprovements.filter(
        (cardId) => cardId !== major,
      )
    }
    if (targetOwner >= 0) {
      const target = major === 'Major_Pottery' ? 'Major_Basket' : 'Major_Pottery'
      state.players[targetOwner]!.improvements.push(target)
      state.availableMajorImprovements = state.availableMajorImprovements.filter(
        (cardId) => cardId !== target,
      )
    }
    session.loadState(state)
    return session
  }

  const playMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    for (let guard = 0; guard < 8 && response.state.players[0]!.minorHand.includes(CARD_ID); guard += 1) {
      if (response.interaction.stateId !== 'wait') break
      const card = options(response).find((option) =>
        option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
      const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
      const next = card ?? branch
      if (!next) break
      response = session.resolveChoice(response.interaction.playerIndex, next.value)
      if (response.interaction.stateId === 'wait'
        && response.interaction.promptKey === 'prompt.selectPayment') {
        const payment = options(response).find((option) => option.value !== 'cancel')
        expect(payment).toBeDefined()
        response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
      }
    }
    return response
  }

  const renovate = (session: GameSession) => {
    let response = session.takeAction(0, 'house-redevelopment')
    for (let guard = 0; guard < 10 && response.interaction.stateId === 'wait'; guard += 1) {
      if (response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
        response = session.resolveChoice(response.interaction.playerIndex, 'clay')
        continue
      }
      if (response.interaction.promptKey === 'prompt.selectPayment') {
        const payment = options(response).find((option) => option.value !== 'cancel')
        expect(payment).toBeDefined()
        response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
        continue
      }
      if (response.interaction.request.kind === 'select-trigger'
        && options(response).some((option) =>
          option.value === CARD_ID || option.sourceCard === CARD_ID)) {
        response = resolveTriggerIfPresent(session, response, CARD_ID)
        continue
      }
      break
    }
    return response
  }

  it('D027 S1: one occupation and one food allow Retraining to be played', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D027 S2: without an occupation Retraining remains unavailable', () => {
    const response = playMinor(setup({ played: false, occupations: 0 }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('D027 S5: renovating exchanges Pottery for the available Basketmaker', () => {
    const session = setup({ major: 'Major_Pottery' })
    let response = renovate(session)
    expect(options(response).map((option) => option.value)).toContain('__skip__')
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Basket')
    expect(response.state.players[0]!.improvements).not.toContain('Major_Pottery')
    expect(response.state.availableMajorImprovements).toContain('Major_Pottery')
  })

  it('D027 S6: no exchange is offered when the target major is unavailable', () => {
    const response = renovate(setup({ major: 'Major_Joinery', targetOwner: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(response.state.players[1]!.improvements).toContain('Major_Pottery')
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
  })
})
