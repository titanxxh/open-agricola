import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'

const CARD_ID = 'A180_AnimalBrander'

const setup = (food = 3) => {
  const session = new GameSession(42, undefined, { playerCount: 5 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  state.players[0]!.occupationPlayed = [CARD_ID]
  state.players[0]!.resources.food = food
  state.players[0]!.pastures = [{
    id: 'p1',
    size: 1,
    tiles: [{ row: 2, col: 2 }],
    stables: 0,
    animalType: null,
    animalCount: 0,
  }]
  session.loadState(state)
  return session
}

const findOption = (
  resp: ReturnType<GameSession['takeAction']>,
  predicate: (option: { value: string; labelKey: string; sourceCard?: string; effectPreview?: unknown; descriptionPreview?: unknown }) => boolean,
) => {
  if (resp.interaction.stateId !== 'wait') return undefined
  return resp.interaction.options?.find(predicate)
}

const resolveAnimalReorgs = (
  session: GameSession,
  resp: ReturnType<GameSession['resolveChoice']>,
  animal: 'sheep' | 'boar' | 'cattle',
) => {
  let current = resp
  let count = current.state.players[0]!.resources[animal]
  while (current.interaction.stateId === 'wait' && current.interaction.request.kind === 'animal-reorg') {
    current = session.resolveChoice(0, 'confirm', {
      zones: [{ id: 'p1', zoneType: 'pasture', animalType: animal, animalCount: count }],
    })
    count = current.state.players[0]!.resources[animal]
  }
  return current
}

describe('A180 Animal Brander', () => {
  it('offers a paid doubled Animal Market sheep branch while preserving the original action', () => {
    const session = setup()

    let resp = session.takeAction(0, 'animal-market-56')

    const sheep = findOption(resp, (option) =>
      JSON.stringify(option.descriptionPreview).includes('option-sheep'),
    )
    expect(sheep).toBeDefined()

    resp = session.resolveChoice(0, sheep!.value)

    const doubled = findOption(resp, (option) => option.sourceCard === CARD_ID)
    expect(doubled).toBeDefined()
    const original = findOption(resp, (option) => option.sourceCard !== CARD_ID)
    expect(original).toBeDefined()

    resp = resolveAnimalReorgs(session, session.resolveChoice(0, doubled!.value), 'sheep')

    expect(resp.state.players[0]!.resources.sheep).toBe(2)
    expect(resp.state.players[0]!.resources.food).toBe(4)
  })

  it('duplicates the cattle branch including both original cattle payments', () => {
    const session = setup(3)

    let resp = session.takeAction(0, 'animal-market-56')
    const cattle = findOption(resp, (option) =>
      JSON.stringify(option.descriptionPreview).includes('option-cattle'),
    )
    expect(cattle).toBeDefined()

    resp = session.resolveChoice(0, cattle!.value)
    const doubled = findOption(resp, (option) => option.sourceCard === CARD_ID)
    expect(doubled).toBeDefined()

    resp = resolveAnimalReorgs(session, session.resolveChoice(0, doubled!.value), 'cattle')

    expect(resp.state.players[0]!.resources.cattle).toBe(2)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('preserves the original cattle branch when declining Animal Brander', () => {
    const session = setup(3)

    let resp = session.takeAction(0, 'animal-market-56')
    const cattle = findOption(resp, (option) =>
      JSON.stringify(option.descriptionPreview).includes('option-cattle'),
    )
    expect(cattle).toBeDefined()

    resp = session.resolveChoice(0, cattle!.value)
    const original = findOption(resp, (option) => option.sourceCard !== CARD_ID)
    expect(original).toBeDefined()

    resp = resolveAnimalReorgs(session, session.resolveChoice(0, original!.value), 'cattle')

    expect(resp.state.players[0]!.resources.cattle).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(2)
  })

  it('does not offer the doubled cattle branch unless the player can pay all 3 food', () => {
    const session = setup(2)
    const state = session.getState().state
    const player = state.players[0]!
    const space = state.actionSpaces.find((entry) => entry.id === 'animal-market-56')!
    const listener = getRegisteredCardListeners().find((entry) => entry.id === 'A180-animal-brander-replace-animal-market')!

    const result = executeCardListener(listener, {
      state,
      player,
      ownerPlayer: player,
      triggerPlayer: player,
      space,
      actionId: 'animal-market-cattle-56',
      phase: 'computeReplace',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})
