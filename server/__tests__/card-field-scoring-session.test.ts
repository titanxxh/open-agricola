import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { getLogicalFields } from '../../shared/cards/helpers/card-field'
import { autoAdvanceRoundEnd } from './_helpers/round-end'
import { createWorkSession } from './_helpers/session-fixtures'

const CARDS = [
  'B068_Beanfield', 'B113_PatchCaregiver', 'B141_FieldCaretaker',
  'C070_LettucePatch', 'D075_WoodField', 'E068_CherryOrchard',
  'E069_MelonPatch', 'E070_CropRotationField', 'E072_ArtichokeField', 'E080_RockGarden',
]

describe('card fields at final scoring', () => {
  it('scores supply and every farmyard and card-field crop layer after the final harvest', () => {
    const session = createWorkSession({
      seed: 831,
      configure: (state) => {
        state.round = 14
        for (const player of state.players) {
          player.minorPlayed = []
          player.occupationPlayed = []
          player.improvements = []
          player.cardStates = {}
          player.resources.food = 20
          player.resources.grain = 0
          player.resources.vegetable = 0
          markAllWorkersUsed(state, player)
        }
        const owner = state.players[0]!
        owner.resources.grain = 1
        owner.fields = [
          { row: 1, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
          { row: 1, col: 1, stacks: [{ kind: 'vegetable', remaining: 2 }] },
        ]
        owner.minorPlayed = ['B068_Beanfield']
        owner.occupationPlayed = ['B113_PatchCaregiver']
        owner.cardStates = {
          B068_Beanfield: { extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] } },
          B113_PatchCaregiver: {
            extraData: {
              cardFieldStacks: [{ crop: 'grain', remaining: 3, below: [{ crop: 'grain', remaining: 1 }] }],
            },
          },
        }
      },
    })
    try {
      const response = autoAdvanceRoundEnd(session)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.gameOver).toBe(true)
      expect(response.interaction.stateId).toBe('gameover')
      expect(response.state.players[0]!.resources).toMatchObject({ grain: 3, vegetable: 2 })
      expect(response.state.players[0]!.fields.map((field) => field.stacks)).toEqual([
        [{ kind: 'grain', remaining: 2 }],
        [{ kind: 'vegetable', remaining: 1 }],
      ])
      const byKey = new Map(response.scores[0]!.categories.map((category) => [category.key, category]))
      expect(byKey.get('grains')).toMatchObject({ quantity: 8, total: 4 })
      expect(byKey.get('vegetables')).toMatchObject({ quantity: 4, total: 4 })
      expect(byKey.get('fields')).toMatchObject({ quantity: 2, total: 1 })
      const saved = JSON.stringify(response.state)
      expect(session.getState().scores).toEqual(response.scores)
      expect(JSON.stringify(session.getState().state)).toBe(saved)
    } finally {
      session.dispose()
    }
  })

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
