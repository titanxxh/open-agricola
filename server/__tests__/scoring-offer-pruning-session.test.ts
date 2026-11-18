import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { rehydrateState, serializeSessionSnapshot, type PersistedSessionSnapshot } from '../../shared/session/serialization'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createGardenDesignerScoringSession } from './_helpers/garden-designer'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'

const cardId = 'C099_GardenDesigner'
const value = (food: number, score: number) => `${cardId}:food:${food}:score:${score}`
const expectedChoices = [value(0, 0), value(1, 1), value(2, 2), value(3, 3), value(6, 4), value(9, 5)]
const legacy: { producer: string; pending: PersistedSessionSnapshot; settled: PersistedSessionSnapshot } = JSON.parse(
  gunzipSync(readFileSync(new URL('./fixtures/legacy-garden-designer.json.gz', import.meta.url))).toString(),
)
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const track = (session: GameSession) => { sessions.push(session); return session }
const restore = (snapshot: PersistedSessionSnapshot) => track(new GameSession(rehydrateState(structuredClone(snapshot))))
const expectChoices = (response: SessionResponse) => {
  assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice')
  expect(response.interaction.sourceCard).toBe(cardId)
  expect(response.interaction.request.options.map(option => option.value)).toEqual(expectedChoices)
}
const expectSettlement = (response: SessionResponse, food: number, score: number) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.state.gameOver).toBe(true)
  expect(response.interaction.stateId).toBe('gameover')
  expect(response.state.players.map(player => player.resources.food)).toEqual([10 - food, 0])
  for (const [index, playerScore] of response.scores.entries()) {
    const bonuses = playerScore.categories.find(category => category.key === 'cardBonusVp')?.entries ?? []
    const bonus = bonuses.find(entry => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0
    expect(bonus).toBe(index === 0 ? score : 0)
  }
  const payments = response.state.log.filter(entry => entry.key === 'log.cardEffectPay' && entry.params?.cardId === cardId)
  expect(payments).toHaveLength(food === 0 ? 0 : 1)
  if (food > 0) expect(payments[0]).toMatchObject({ playerId: 'p1', params: { cost: { food } } })
  expect(response.state.log.filter(entry => entry.key === 'log.gameOver')).toHaveLength(1)
}

describe('scoring offer pruning through GameSession', () => {
  it.each([{ food: 0, score: 0 }, { food: 6, score: 4 }, { food: 9, score: 5 }])(
    'offers six investments and settles $food food for $score points once', ({ food, score }) => {
      const session = track(createGardenDesignerScoringSession())
      expectChoices(session.getState())
      expectSettlement(session.resolveChoice(0, value(food, score)), food, score)
    },
  )

  it('rejects dominated and invented offers without consuming the pending choice', () => {
    const session = track(createGardenDesignerScoringSession())
    for (const rejectedValue of [value(4, 2), value(5, 3), value(7, 3), value(8, 4), value(1, 5)]) {
      assertRejectedUnchanged(session, () => session.resolveChoice(0, rejectedValue))
    }
    expectSettlement(session.resolveChoice(0, value(6, 4)), 6, 4)
  })

  it('refreshes an unmodified predecessor pending and continues after another restore', () => {
    expect(legacy.producer).toBe('cabe56980e1a587a2b62efadf0413910acbd974f')
    const session = restore(legacy.pending)
    expectChoices(session.getState())
    const reconnected = restore(serializeSessionSnapshot(session.state, session))
    expectChoices(reconnected.getState())
    expectSettlement(reconnected.resolveChoice(0, value(9, 5)), 9, 5)
  })

  it('preserves an already settled predecessor payment and score through repeated recovery', () => {
    const session = restore(legacy.settled)
    const before = session.getState()
    expectSettlement(before, 9, 5)
    const reconnected = restore(serializeSessionSnapshot(session.state, session))
    expectSettlement(reconnected.getState(), 9, 5)
    expect(reconnected.getState().state.log).toEqual(before.state.log)
    expect(reconnected.getState().scores).toEqual(before.scores)
  })
})
