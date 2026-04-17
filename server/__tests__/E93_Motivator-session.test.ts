import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'

import '../../shared/cards/E/E93_Motivator'

const CARD_ID = 'E93_Motivator'

describe('E93_Motivator session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.playedCards.push(`occupation:${CARD_ID}`)
    player.roomTiles = [{ row: 2, col: 0 }, { row: 2, col: 1 }]
    player.fields = [
      { row: 0, col: 0, crop: null, remaining: 0 },
      { row: 0, col: 1, crop: null, remaining: 0 },
      { row: 0, col: 2, crop: null, remaining: 0 },
      { row: 0, col: 3, crop: null, remaining: 0 },
      { row: 0, col: 4, crop: null, remaining: 0 },
    ]
    player.pastures = [
      {
        id: 'pasture-1',
        size: 7,
        tiles: [
          { row: 1, col: 0 },
          { row: 1, col: 1 },
          { row: 1, col: 2 },
          { row: 1, col: 3 },
          { row: 1, col: 4 },
          { row: 2, col: 2 },
          { row: 2, col: 3 },
        ],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]
    player.stableTiles = [{ row: 2, col: 4 }]
    return { state, player }
  }

  it('offers an extra place-farmer opportunity on the first turn when the farm is full', () => {
    const { state, player } = setup()
    const effect = getCardEffect(CARD_ID)!
    const flow = effect.onBeforeStartOfTurn?.(state, player)

    expect(flow).toMatchObject({
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'place-farmer',
          sourceCard: CARD_ID,
          actionContext: { trueAction: false, extraPlacement: true },
        },
      ],
    })
  })

  it('does not trigger after the first placement of the round', () => {
    const { state, player } = setup()
    recordRoundPlacement(player, 'day-laborer', '1')
    const effect = getCardEffect(CARD_ID)!

    expect(effect.onBeforeStartOfTurn?.(state, player)).toBeUndefined()
  })

  it('does not trigger if there is still one unused farmyard space', () => {
    const { state, player } = setup()
    player.stableTiles = []
    const effect = getCardEffect(CARD_ID)!

    expect(effect.onBeforeStartOfTurn?.(state, player)).toBeUndefined()
  })
})
