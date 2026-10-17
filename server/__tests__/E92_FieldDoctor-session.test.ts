import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import {
  familySize,
  newbornCount,
  setActiveWorkerCount,
  setWorkersAtHome,
} from '../../shared/domain/player'
import '../../shared/cards/E/E092_FieldDoctor'
import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/B/B081_Handcart'
import '../../shared/cards/E/E093_Motivator'
import '../../shared/cards/E/E094_Prophet'
import '../../shared/cards/E/E095_Miller'
import '../../shared/cards/E/E097_Beneficiary'
import '../../shared/cards/E/E130_Overachiever'
import '../../shared/cards/E/E132_VeggieLover'
import '../../shared/cards/E/E135_Pickler'
import '../../shared/cards/E/E147_AnimalDriver'
import '../../shared/cards/E/E164_MountainPlowman'
import '../../shared/cards/E/E165_MasterHuntsman'
import '../../shared/cards/E/E166_Roastmaster'
import { assertRejectedUnchanged, confirmNext } from './_helpers/negative-rule-audit'
import * as audit45Fielddoctor from './_helpers/audit/ae-negative-45-fielddoctor'

const CARD_ID = 'E092_FieldDoctor'
const SURROUNDING_FIELDS = [[0, 0], [0, 1], [1, 1], [2, 1]] as const

const setup = (
  spaceId: 'wish-children' | 'urgent-wish-children',
  fieldPositions: readonly (readonly [number, number])[],
) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = spaceId === 'urgent-wish-children' ? 5 : 2
  state.roundActionOrder = state.roundActionOrder.map((id) => id === spaceId ? null : id)
  state.roundActionOrder[0] = spaceId

  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  player.rooms = 2
  player.roomTiles = [{ row: 2, col: 0 }, { row: 1, col: 0 }]
  player.fields = fieldPositions.map(([row, col]) => ({ row, col, stacks: [] }))
  setActiveWorkerCount(player, 2)
  setWorkersAtHome(state, player, 2)

  const space = state.actionSpaces.find((entry) => entry.id === spaceId)
  if (!space) throw new Error(`${spaceId} space missing`)
  space.takenBy = []

  session.loadState(state)
  return session
}

describe('E092_FieldDoctor session', () => {
  it('does not unlock Wish for Children when four fields are in the wrong positions', () => {
    const session = setup('wish-children', [[0, 1], [1, 1], [2, 1], [0, 2]])

    expect(session.getState().actionAvailability?.['wish-children']).toBe(false)
    const response = session.takeAction(0, 'wish-children')
    expect(familySize(response.state.players[0]!)).toBe(2)
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(false)
  })

  it('uses the exact four surrounding fields to grow without room once', () => {
    const session = setup('wish-children', SURROUNDING_FIELDS)

    expect(session.getState().actionAvailability?.['wish-children']).toBe(true)
    const offered = session.takeAction(0, 'wish-children')
    expect(familySize(offered.state.players[0]!)).toBe(2)
    expect(offered.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
    expect(offered.interaction.request.options).toHaveLength(1)
    const replacement = offered.interaction.request.options!.find((option) => option.sourceCard === CARD_ID)!
    const response = session.resolveChoice(0, replacement.value)
    expect(response.ok).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(newbornCount(response.state.players[0]!)).toBe(1)
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(true)
  })

  it('does not consume Field Doctor on Urgent Wish for Children', () => {
    const session = setup('urgent-wish-children', SURROUNDING_FIELDS)

    expect(session.getState().actionAvailability?.['urgent-wish-children']).toBe(true)
    const response = session.takeAction(0, 'urgent-wish-children')
    expect(response.ok).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(false)
  })
})

describe('ae-negative-45-fielddoctor', () => {
  const { setupOccupation, sessions, it, optionsOf } = audit45Fielddoctor
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  describe('E092 Field Doctor parity', () => {
    const surrounding = [[0, 0], [0, 1], [1, 1], [2, 1]] as const
    const setup = (valid: boolean) => {
      const session = setupOccupation('E092_FieldDoctor', { played: true, round: 14 })
      const state = session.getState().state
      state.roundActionOrder = state.roundActionOrder.map((id) => id === 'wish-children' ? null : id)
      state.roundActionOrder[0] = 'wish-children'
      const player = state.players[0]!
      player.rooms = 2
      player.roomTiles = [{ row: 2, col: 0 }, { row: 1, col: 0 }]
      const fields = valid ? surrounding : [[0, 1], [1, 1], [2, 1], [0, 2]] as const
      player.fields = fields.map(([row, col]) => ({ row, col, stacks: [] }))
      setActiveWorkerCount(player, 2)
      setWorkersAtHome(state, player, 2)
      state.actionSpaces.find((space) => space.id === 'wish-children')!.takenBy = []
      session.loadState(state)
      return session
    }
    it('E092 S1: four surrounding fields allow one family growth without room', () => {
      const session = setup(true)
      const offered = session.takeAction(0, 'wish-children')
      expect(familySize(offered.state.players[0]!)).toBe(2)
      expect(isCardFlagged(offered.state.players[0]!, 'E092_FieldDoctor')).toBe(false)
      const replacement = optionsOf(offered).find((option) => option.sourceCard === 'E092_FieldDoctor')!
      const response = session.resolveChoice(0, replacement.value)
      expect(response.ok, response.error).toBe(true)
      expect(familySize(response.state.players[0]!)).toBe(3)
      expect(isCardFlagged(response.state.players[0]!, 'E092_FieldDoctor')).toBe(true)
    })
    it('E092 S2: rejects wrong-position fields at the authoritative action entry', () => {
      const session = setup(false)
      expect(session.getState().actionAvailability?.['wish-children']).toBe(false)
      const response = session.takeAction(0, 'wish-children')
      expect(response.ok).toBe(false)
      expect(response.error).toBe('space unavailable')
      expect(familySize(response.state.players[0]!)).toBe(2)
      expect(response.state.actionSpaces.find((space) => space.id === 'wish-children')?.takenBy).toHaveLength(0)
    })
    it('E092 N3 used once remains unavailable after real return home and next round', () => {
      const session = setup(true)
      session.state.round = 8
      session.state.players.forEach(p => p.resources.food = 20)
      session.loadState(session.state)
      let r = session.takeAction(0, 'wish-children')
      const replacement = optionsOf(r).find(o => o.sourceCard === 'E092_FieldDoctor')!
      expect(replacement).toBeDefined()
      r = session.resolveChoice(0, replacement.value)
      expect(r.ok, r.error).toBe(true)
      for (let n = 0; n < 16 && r.state.round === 8; n++) {
        if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
          r = confirmNext(session, r)
        else if (r.interaction.stateId === 'wait') {
          const o = optionsOf(r).find(o => ['__skip__', '__pass__', '__done__'].includes(o.value))
          expect(o, JSON.stringify(r.interaction)).toBeDefined()
          r = session.resolveChoice(r.interaction.playerIndex, o!.value)
        }
        else {
          const space = ['grain-seeds', 'clay-pit', 'forest', 'reed-bank'].find(id => !r.state.actionSpaces.find(a => a.id === id)!.takenBy.length)!
          r = session.takeAction(r.state.currentPlayerIndex, space)
        }
        expect(r.ok, r.error).toBe(true)
      }
      expect(r.state.round).toBe(9)
      expect(familySize(r.state.players[0]!)).toBe(3)
      expect(isCardFlagged(r.state.players[0]!, 'E092_FieldDoctor')).toBe(true)
      expect(session.getState().actionAvailability?.['wish-children']).toBe(false)
      const rejected = assertRejectedUnchanged(session, () => session.takeAction(0, 'wish-children'))
      expect(familySize(rejected.state.players[0]!)).toBe(3)
    })
  })
})
