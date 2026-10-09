import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/B/B030_WoodPalisades'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'

import '../../shared/cards/D/D089_Stablehand'

const CARD_ID = 'D089_Stablehand'

const fenceBuilt = (
  newPastures: Array<{ tiles?: unknown[] }>,
  type: 'fence' | 'palisade' = 'fence',
): DraftGameEvent<'farm.fenceBuilt'> => ({
  type: 'farm.fenceBuilt',
  fences: [{ edge: 'H-0-0', type }],
  newFenceEdges: type === 'fence' ? ['H-0-0'] : [],
  newPastures,
})

const setup = () => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  const listener = getRegisteredCardListeners().find((entry) => entry.id === 'D89-stablehand-after-fencing')
  expect(listener).toBeDefined()
  return { state, player, listener: listener! }
}

describe('D089_Stablehand fence provenance', () => {
  it('offers one optional stable after a new pasture fence event', () => {
    const { state, player, listener } = setup()
    const actionEvents = [fenceBuilt([{ tiles: [{ row: 0, col: 0 }] }])]

    const result = executeCardListener(listener, {
      state,
      player,
      space: state.actionSpaces.find((entry) => entry.id === 'fencing')!,
      actionId: 'fence',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'stables',
      optional: true,
      sourceCard: CARD_ID,
      actionContext: { max: 1, exactCost: { max: 1 }, trueAction: false },
    })
  })

  it('offers one optional stable after building an ordinary fence without a new pasture', () => {
    const { state, player, listener } = setup()
    const actionEvents = [fenceBuilt([])]

    const result = executeCardListener(listener, {
      state,
      player,
      space: state.actionSpaces.find((entry) => entry.id === 'fencing')!,
      actionId: 'fence',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'stables',
      optional: true,
      sourceCard: CARD_ID,
    })
  })

  it('ignores Wood Palisades even when they enclose a new pasture', () => {
    const { state, player, listener } = setup()
    const actionEvents = [fenceBuilt([{ tiles: [{ row: 0, col: 0 }] }], 'palisade')]

    const result = executeCardListener(listener, {
      state,
      player,
      space: state.actionSpaces.find((entry) => entry.id === 'fencing')!,
      actionId: 'fence',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})

describe('D089 Stablehand parity', () => {
  const CARD_ID = 'D089_Stablehand'

  const FILLER = '__test_placeholder__'

  const ONE_CELL_FENCES = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

  const PALISADE_EXISTING_FENCES = ['H-2-4', 'V-2-4']

  const PALISADE_EDGES = ['H-3-4', 'V-2-5']

  const setup = ({ played = true, wood = 4, palisadesOnly = false } = {}) => {
    const session = new GameSession(6089, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.pastures = []
      player.fenceSegments = []
      player.stableTiles = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources.wood = wood
    if (palisadesOnly) {
      owner.minorPlayed = ['B030_WoodPalisades']
      owner.fenceSegments = PALISADE_EXISTING_FENCES.map((edge) => ({
        edge, type: 'fence' as const, source: { kind: 'own' as const, ownerPlayerId: owner.id },
      }))
    }
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const fenceForStablehand = (session: GameSession) => {
    let response = session.takeAction(0, 'fencing')
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, {
      edges: ONE_CELL_FENCES, palisadeEdges: [], extraWood: 0,
    })
    expect(response.ok, response.error).toBe(true)
    return resolveTriggerIfPresent(session, response, CARD_ID)
  }

  const acceptStable = (session: GameSession, response: SessionResponse) => {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const accept = options(response).find((option) =>
      option.value !== '__skip__' && (option.sourceCard === CARD_ID || option.value === CARD_ID))
      ?? options(response).find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, accept!.value)
  }

  it('D089 S2: ordinary fencing may add one stable without paying two wood', () => {
    const session = setup()
    let response = acceptStable(session, fenceForStablehand(session))
    expect(response.interaction).toMatchObject({
      stateId: 'wait', promptKey: 'ui.interactionStableSelect', sourceCard: CARD_ID,
    })
    if (response.interaction.stateId !== 'wait') return
    const stable = response.interaction.request.farm.selectableTiles[0]
    expect(stable).toBeDefined()

    response = session.commitSelectionChoice(response.interaction.playerIndex, { stables: [stable!] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.stableTiles).toEqual([stable])
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('D089 S3: declining the optional stable keeps the completed fences', () => {
    const session = setup()
    const pending = fenceForStablehand(session)
    expect(options(pending).some((option) => option.value === '__skip__')).toBe(true)

    const response = session.resolveChoice(pending.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('D089 S4: building only Wood Palisades does not offer a Stablehand stable', () => {
    const session = setup({ palisadesOnly: true })
    let response = session.takeAction(0, 'fencing')
    expect(response.ok, response.error).toBe(true)

    response = session.commitSelectionChoice(0, {
      edges: [], palisadeEdges: PALISADE_EDGES, extraWood: 0,
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(options(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
    expect(response.interaction.sourceCard).not.toBe(CARD_ID)
  })
})
