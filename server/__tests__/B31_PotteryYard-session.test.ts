import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { PlayerState } from '../../shared/contract/types'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B031_PotteryYard'
import '../../shared/cards/D/D060_LargePottery'

const CARD_ID = 'B031_PotteryYard'

const setupPurchase = (pottery: 'none' | 'major' | 'upgrade') => {
  const session = new GameSession(31, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.improvements = pottery === 'major' ? ['Major_Pottery'] : []
  player.minorPlayed = pottery === 'upgrade' ? ['D060_LargePottery'] : []
  session.loadState(state)
  return session
}

const enterMinorChoice = (session: GameSession) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId !== 'wait') return resp
  const improvement = resp.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) resp = session.resolveChoice(0, improvement.value)
  return resp
}

const setFarmWithTwoFreeSpaces = (
  player: PlayerState,
  freeSpaces: ReadonlyArray<{ row: number; col: number }>,
) => {
  const free = new Set(freeSpaces.map(({ row, col }) => `${row},${col}`))
  player.rooms = 2
  player.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
  player.fields = []
  player.pastures = []
  player.stableTiles = []
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      if ((row === 0 && (col === 0 || col === 1)) || free.has(`${row},${col}`)) continue
      player.fields.push({ row, col, stacks: [] })
    }
  }
}

const setupScoring = (freeSpaces: ReadonlyArray<{ row: number; col: number }>) => {
  const session = new GameSession(31, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  const player = state.players[0]!
  player.minorPlayed = [CARD_ID]
  setFarmWithTwoFreeSpaces(player, freeSpaces)
  session.loadState(state)
  return session.getState()
}

const scoreCategory = (resp: ReturnType<GameSession['getState']>, key: string) =>
  resp.scores[0]!.categories.find((category) => category.key === key)

describe('B031_PotteryYard session', () => {
  it('cannot be played without Pottery or an upgrade', () => {
    const session = setupPurchase('none')
    const scoreBefore = session.getState().scores[0]!.total
    const resp = enterMinorChoice(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false).toBe(false)
    expect(resp.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(resp.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(resp.state.log.some((entry) =>
      entry.key === 'log.playMinorImprovement' && entry.params?.improvements === CARD_ID,
    )).toBe(false)
    expect(resp.scores[0]!.total).toBe(scoreBefore)
  })

  it.each(['major', 'upgrade'] as const)('can be played with %s Pottery identity', (pottery) => {
    const session = setupPurchase(pottery)
    const scoreBefore = session.getState().scores[0]!.total
    const resp = enterMinorChoice(session)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId)
      .toBe('confirm-next-player')
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(resp.state.log).toContainEqual(expect.objectContaining({
      key: 'log.playMinorImprovement',
      params: expect.objectContaining({ improvements: CARD_ID }),
    }))
    expect(resp.scores[0]!.total).toBe(scoreBefore + 3)
  })

  it('scores 2 bonus VP for two orthogonally adjacent unused spaces and keeps their penalty', () => {
    const resp = setupScoring([{ row: 2, col: 3 }, { row: 2, col: 4 }])
    expect(scoreCategory(resp, 'cardBonusVp')?.total).toBe(2)
    expect(scoreCategory(resp, 'empty')?.quantity).toBe(2)
    expect(scoreCategory(resp, 'empty')?.total).toBe(-2)
    expect(scoreCategory(resp, 'cards')?.total).toBe(1)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.log.some((entry) =>
      entry.key === 'log.cardEffectGain' && entry.params?.cardId === CARD_ID,
    )).toBe(false)
  })

  it('does not score for two unused spaces that touch only diagonally', () => {
    const resp = setupScoring([{ row: 1, col: 2 }, { row: 2, col: 3 }])
    expect(scoreCategory(resp, 'cardBonusVp')?.total ?? 0).toBe(0)
    expect(scoreCategory(resp, 'empty')?.total).toBe(-2)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.log.some((entry) =>
      entry.key === 'log.cardEffectGain' && entry.params?.cardId === CARD_ID,
    )).toBe(false)
  })
})
