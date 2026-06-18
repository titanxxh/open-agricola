import { describe, expect, it } from 'vitest'

import { finalizeDraft } from '../../draft/draft-manager'
import { createInitialState } from '../state-bootstrap'
import { rehydrateState, serializeState, serializeStateForPlayer } from '../serialization'
import { EngineStack } from '../../engine'
import {
  resolveOrdinaryCardDrawChoice,
  startOrdinaryCardDrawChoice,
} from '../ordinary-card-draw'

const emptyCtx = () => ({ engineStack: new EngineStack() })

describe('ordinary card draw decks', () => {
  it('seeds non-draft draw decks without cards already dealt to player hands', () => {
    const state = createInitialState(42, { playerCount: 2 })
    const dealt = new Set(state.players.flatMap((player) => [
      ...player.occupationHand,
      ...player.minorHand,
    ]))

    expect(state.ordinaryCardDecks.occupation.length).toBeGreaterThan(0)
    expect(state.ordinaryCardDecks.minor.length).toBeGreaterThan(0)
    for (const cardId of dealt) {
      expect(state.ordinaryCardDecks.occupation).not.toContain(cardId)
      expect(state.ordinaryCardDecks.minor).not.toContain(cardId)
    }
  })

  it('seeds draft draw decks without cards already assigned to draft pools', () => {
    const state = createInitialState(77, {
      playerCount: 2,
      draftMode: 'simultaneous',
      draftPoolSize: 8,
    })
    const pooled = new Set(Object.values(state.draft!.pools).flatMap((pool) => [
      ...pool.occ,
      ...pool.minor,
    ]))

    for (const cardId of pooled) {
      expect(state.ordinaryCardDecks.occupation).not.toContain(cardId)
      expect(state.ordinaryCardDecks.minor).not.toContain(cardId)
    }

    const finalized = finalizeDraft({
      ...state,
      draft: {
        ...state.draft!,
        kept: Object.fromEntries(
          Object.entries(state.draft!.pools).map(([pid, pool]) => [
            pid,
            { occ: pool.occ.slice(0, 7), minor: pool.minor.slice(0, 7) },
          ]),
        ),
      },
    })
    for (const cardId of pooled) {
      expect(finalized.ordinaryCardDecks.occupation).not.toContain(cardId)
      expect(finalized.ordinaryCardDecks.minor).not.toContain(cardId)
    }
  })

  it('draws three cards into a private keep-one choice and commits the selected card to hand', () => {
    const state = createInitialState(101, { playerCount: 2 })
    const player = state.players[0]
    const deckBefore = [...state.ordinaryCardDecks.occupation]

    const choice = startOrdinaryCardDrawChoice(state, {
      playerId: player.id,
      cardType: 'occupation',
      count: 3,
      sourceCard: 'PS_TEST',
    })

    expect(choice.ok).toBe(true)
    if (!choice.ok) throw new Error(choice.error)
    expect(choice.choice.candidates).toEqual(deckBefore.slice(0, 3))
    expect(state.ordinaryCardDecks.occupation).toEqual(deckBefore.slice(3))

    const keptCardId = choice.choice.candidates[1]
    const resolved = resolveOrdinaryCardDrawChoice(state, {
      playerId: player.id,
      choiceId: choice.choice.id,
      keepCardId: keptCardId,
    })

    expect(resolved.ok).toBe(true)
    expect(player.occupationHand).toContain(keptCardId)
    expect(player.occupationHand).not.toContain(choice.choice.candidates[0])
    expect(player.occupationHand).not.toContain(choice.choice.candidates[2])
    expect(state.ordinaryCardDrawChoices[choice.choice.id]).toBeUndefined()
    expect(resolved.privateEvents).toEqual([
      {
        schemaVersion: 1,
        type: 'private.handChanged',
        recipientPlayerId: player.id,
        cardIds: player.occupationHand,
        cardType: 'occupation',
        reason: 'card-effect',
        sourceCard: 'PS_TEST',
      },
    ])
  })

  it('preserves decks through persistence and masks deck order plus private draw choices per viewer', () => {
    const state = createInitialState(202, { playerCount: 2 })
    const choice = startOrdinaryCardDrawChoice(state, {
      playerId: 'p1',
      cardType: 'minor',
      count: 3,
      sourceCard: 'PS_TEST',
    })
    expect(choice.ok).toBe(true)
    if (!choice.ok) throw new Error(choice.error)

    const serialized = serializeState(state, emptyCtx())
    const restored = rehydrateState(JSON.parse(JSON.stringify(serialized))).state
    expect(restored.ordinaryCardDecks).toEqual(state.ordinaryCardDecks)
    expect(restored.ordinaryCardDrawChoices).toEqual(state.ordinaryCardDrawChoices)

    const p1View = serializeStateForPlayer(state, 'p1', emptyCtx())
    const p2View = serializeStateForPlayer(state, 'p2', emptyCtx())
    const spectatorView = serializeStateForPlayer(state, null, emptyCtx())

    expect(p1View.ordinaryCardDecks.minor).toEqual(Array(state.ordinaryCardDecks.minor.length).fill('?'))
    expect(p1View.ordinaryCardDrawChoices[choice.choice.id].candidates).toEqual(choice.choice.candidates)
    expect(p2View.ordinaryCardDrawChoices[choice.choice.id].candidates).toEqual(['?', '?', '?'])
    expect(spectatorView.ordinaryCardDrawChoices[choice.choice.id].candidates).toEqual(['?', '?', '?'])
  })
})
