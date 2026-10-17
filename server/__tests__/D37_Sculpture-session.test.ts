import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getAllTilePositions, positionKey } from '../../shared/domain/farm'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/D/D037_Sculpture'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit35Resources from './_helpers/audit/ae-negative-35-resources'

const CARD_ID = 'D037_Sculpture'

const setup = ({ round, unused, stone }: { round: number; unused: number; stone: number }) => {
  const session = new GameSession(1)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationHand = ['__test_placeholder__']
  player.resources.stone = stone
  const occupied = new Set(player.roomTiles.map(positionKey))
  player.fields = getAllTilePositions()
    .filter((tile) => !occupied.has(positionKey(tile)))
    .slice(0, 13 - unused)
    .map((tile) => ({ ...tile, stacks: [] }))
  const improvement = state.actionSpaces.find((space) => space.id === 'major-improvement')
  if (!improvement) throw new Error('major-improvement missing')
  improvement.takenBy = []
  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const action = response.interaction.request.options?.find((candidate) => {
    return candidate.value.startsWith('action-improvement-')
  })
  if (action) response = session.resolveChoice(0, action.value)
  return response
}

const cardOption = (session: GameSession) => {
  const response = enterImprovementChoice(session)
  if (response.interaction.stateId !== 'wait') return { response, option: undefined }
  return {
    response,
    option: response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID),
  }
}

describe('D037 Sculpture parity', () => {
  it('D037 S1: two rounds left and one unused farm space allow Sculpture for one stone', () => {
    const session = setup({ round: 12, unused: 1, stone: 1 })
    const { response: offered, option } = cardOption(session)

    const response = option ? session.resolveChoice(0, option.value) : offered

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.stone).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('D037 S2: equality between rounds left and unused spaces keeps Sculpture unavailable', () => {
    const { response, option } = cardOption(setup({ round: 12, unused: 2, stone: 1 }))
    expect(option).toBeUndefined()
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('D037 S3: more unused spaces than rounds left keeps Sculpture unavailable', () => {
    const { response, option } = cardOption(setup({ round: 2, unused: 13, stone: 1 }))
    expect(option).toBeUndefined()
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('D037 S4: no stone keeps an otherwise legal Sculpture unavailable', () => {
    const { response, option } = cardOption(setup({ round: 12, unused: 1, stone: 0 }))
    expect(option).toBeUndefined()
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })
})

describe('ae-negative-35-resources', () => {
  const { sessions, save, finish, action, buy, printed, sculpture } = audit35Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D037 N1 two complete rounds left and one unused connected farm space permit actual purchase for one stone and two printed points', () => { const s = sculpture(), r = finish(s, buy(s, 'D037_Sculpture')); assert.ok(r.state.players[0]!.minorPlayed.includes('D037_Sculpture')); assert.equal(r.state.players[0]!.resources.stone, 0); assert.equal(printed(r, 'D037_Sculpture'), 2); save('D037-N1', r); });
  it('D037 N2 equal or more unused spaces and zero complete rounds with even a full farm cannot satisfy strict more rounds left', () => {
      const rows = [];
      for (const [unused, round] of [[2, 12], [3, 12], [0, 14]] as const) {
          const s = sculpture(unused, round), p = buy(s, 'D037_Sculpture'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'D037_Sculpture'));
          assert.ok(p.state.players[0]!.minorHand.includes('D037_Sculpture'));
          assert.equal(p.state.players[0]!.resources.stone, 1);
          rows.push({ p, bad });
      }
      save('D037-N2', rows);
  });
  it('D037 N3 otherwise eligible but no stone cannot build and a held card gives no printed points', () => { const s = sculpture(1, 12, 0), p = buy(s, 'D037_Sculpture'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'D037_Sculpture')); assert.equal(printed(p, 'D037_Sculpture'), 0); const t = sculpture(), hand = action(t, 0, 'reed-bank'); assert.equal(printed(hand, 'D037_Sculpture'), 0); save('D037-N3', { p, bad, hand }); });
})
