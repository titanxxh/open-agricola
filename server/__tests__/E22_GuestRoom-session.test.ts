import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardStack, pushToCardStack } from '../../shared/cards/helpers/card-state'
import { familySize, inactiveWorkersInSupply, setActiveWorkerCount, workersAtHome } from '../../shared/domain/player'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { chooseSupplyWorkerTurn, takeNormalWorkerTurn } from './_helpers/supply-worker-turn'

const CARD_ID = 'E022_GuestRoom'

const setup = () => {
  const session = new GameSession(8022, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.round = 5
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = index === 0 ? [CARD_ID] : ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources.food = index === 0 ? 5 : 20
    player.resources.wood = index === 0 ? 4 : 0
    player.resources.reed = index === 0 ? 1 : 0
  })
  session.loadState(state)
  return session
}

const buy = (session: GameSession, food = 5) => {
  let response = session.takeAction(0, 'major-improvement')
  for (let step = 0; step < 3 && response.interaction.stateId === 'wait' &&
    response.interaction.request.kind !== 'resource-quantity-select'; step++) {
    const options = response.interaction.request.options ?? []
    const option = options.find((entry) => entry.value === CARD_ID)
      ?? options.find((entry) => entry.value.startsWith('action-improvement-'))
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, option!.value)
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'resource-quantity-select' } })
  expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0, food })
  return response
}

describe('E022 Guest Room supply placements', () => {
  it('refreshes food storage capacity after cooking without repeating the purchase', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.resources.food = 1
    player.resources.sheep = 1
    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = 1
    player.improvements = ['Major_Fireplace1']
    expect(buy(session, 1).interaction.request).toMatchObject({ availableByResource: { food: 1 } })
    let response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    const cooking = response.interaction.request.options.find((option) =>
      option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesPaid?.sheep === 1)!
    response = session.resolveChoice(0, cooking.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request).toMatchObject({ kind: 'resource-quantity-select', availableByResource: { food: 3 } })
    const before = structuredClone(response.state.players)
    response = session.commitSelectionChoice(0, { resourceCounts: { food: 4 } })
    expect(response.ok).toBe(false)
    expect(response.state.players).toEqual(before)
    expect(response.interaction.stateId).toBe('wait')
    response = session.commitSelectionChoice(0, { resourceCounts: { food: 3 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0, reed: 0 })
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual(['food', 'food', 'food'])
    expect(response.state.players[0]!.minorPlayed.filter((id) => id === CARD_ID)).toHaveLength(1)
  })

  it.each([0, 2, 5])('stores the chosen %i food through the purchase selection', (food) => {
    const session = setup()
    buy(session)
    const response = session.commitSelectionChoice(0, { resourceCounts: { food } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(5 - food)
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual(Array.from({ length: food }, () => 'food'))
  })

  it('rejects an invalid amount atomically and keeps the purchase selection', () => {
    const session = setup()
    const pending = buy(session)
    const before = JSON.stringify(pending.state.players[0])
    for (const food of [-1, 6, 1.5]) {
      const response = session.commitSelectionChoice(0, { resourceCounts: { food } })
      expect(response.ok).toBe(false)
      expect(JSON.stringify(response.state.players[0])).toBe(before)
      expect(response.interaction).toEqual(pending.interaction)
    }
    expect(session.commitSelectionChoice(0, { resourceCounts: { food: 2 } }).ok).toBe(true)
  })

  it('spends one card food for a normal rotation turn and becomes available again next round', () => {
    const session = setup()
    buy(session)
    expect(session.commitSelectionChoice(0, { resourceCounts: { food: 2 } }).ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'forest').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    const workerId = inactiveWorkersInSupply(session.state.players[0]!)[0]!.id
    const pending = chooseSupplyWorkerTurn(session, CARD_ID)
    expect(getCardStack(pending.state.players[0]!, CARD_ID)).toHaveLength(1)
    expect(pending.state.players[0]!.resources.food).toBe(3)
    const placed = session.resolveChoice(0, 'day-laborer')
    expect(placed.ok, placed.error).toBe(true)
    expect(placed.state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy)
      .toContainEqual({ playerId: placed.state.players[0]!.id, workerId })
    expect(familySize(placed.state.players[0]!)).toBe(2)
    expect(workersAtHome(placed.state, placed.state.players[0]!)).toHaveLength(1)
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    expect(session.takeAction(1, 'clay-pit').ok).toBe(true)
    const again = confirmNextPlayer(session)
    expect(again.ok, again.error).toBe(true)
    expect(again.interaction.stateId).toBe('idle')
    expect(again.interaction.anytimeActions.map((action) => action.id)).not.toContain('E22-guest-room-anytime')
    expect(takeNormalWorkerTurn(session, 'reed-bank').ok).toBe(true)
    const nextRound = confirmNextPlayer(session)
    expect(nextRound.ok, nextRound.error).toBe(true)
    expect(nextRound.state.round, JSON.stringify(nextRound.interaction)).toBe(6)
    const next = chooseSupplyWorkerTurn(session, CARD_ID)
    expect(getCardStack(next.state.players[0]!, CARD_ID)).toHaveLength(0)
    expect(familySize(next.state.players[0]!)).toBe(2)
  })

  it.each(['no-food', 'no-supply'] as const)('does not offer a placement with %s', (reason) => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.minorPlayed = [CARD_ID]
    if (reason === 'no-supply') {
      setActiveWorkerCount(state.players[0]!, 5)
      pushToCardStack(state.players[0]!, CARD_ID, ['food'])
    }
    session.loadState(state)
    expect(session.getState().interaction.stateId).toBe('idle')
  })
})
