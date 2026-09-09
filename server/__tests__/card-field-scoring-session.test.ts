import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { getLogicalFields } from '../../shared/cards/helpers/card-field'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

const CARDS = [
  'B068_Beanfield', 'B113_PatchCaregiver', 'B141_FieldCaretaker',
  'C070_LettucePatch', 'D075_WoodField', 'E068_CherryOrchard',
  'E069_MelonPatch', 'E070_CropRotationField', 'E072_ArtichokeField', 'E080_RockGarden',
]

describe('card fields at final scoring', () => {
  it.each(CARDS)('%s remains a logical field but does not add farmyard field points', (cardId) => {
    for (const fieldCount of [0, 2]) {
      const session = new GameSession(831, undefined, { playerCount: 2 })
      const state = session.getState().state
      state.round = 14
      state.roundPhase = 'work'
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.cardStates = {}
        player.resources.food = 20
        markAllWorkersUsed(state, player)
      }
      const owner = state.players[0]!
      if (cardId === 'B113_PatchCaregiver' || cardId === 'B141_FieldCaretaker') {
        owner.occupationPlayed = [cardId]
      } else {
        owner.minorPlayed = [cardId]
      }
      owner.fields = Array.from({ length: fieldCount }, (_, index) => ({
        row: 2, col: index + 1, stacks: [],
      }))
      session.loadState(state)
      expect(getLogicalFields(session.state.players[0]!).length).toBeGreaterThan(fieldCount)

      const response = autoAdvanceRoundEnd(session)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.gameOver).toBe(true)
      expect(response.scores[0]!.categories.find((category) => category.key === 'fields'))
        .toMatchObject({ quantity: fieldCount, total: fieldCount === 0 ? -1 : 1 })
      const saved = JSON.stringify(response.state)
      expect(session.getState().scores).toEqual(response.scores)
      expect(JSON.stringify(session.getState().state)).toBe(saved)
    }
  })
})
