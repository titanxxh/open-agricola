import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/D/D83_Pigswill'

const CARD_ID = 'D83_Pigswill'

const setup = (opts?: { food?: number; grain?: number }) => {
  const session = new GameSession(/* seed */ 1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    food: opts?.food ?? 2,
    grain: opts?.grain ?? 0,
  }
  if (!player.minorHand.includes(CARD_ID)) {
    player.minorHand.push(CARD_ID)
  }
  state.players[1]!.workersAvailable = 2

  const majorImprovement = state.actionSpaces.find((space) => space.id === 'major-improvement')
  if (!majorImprovement) throw new Error('major-improvement missing')
  majorImprovement.takenBy = []

  session.loadState(state)
  return session
}

describe('D83_Pigswill session — altCosts', () => {
  it('food=2, grain=0 → auto-pay food (single solution)', () => {
    const session = setup({ food: 2, grain: 0 })
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') return
    resp = session.resolveChoice(0, `minor:${CARD_ID}`)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('food=0, grain=1 → auto-pay grain', () => {
    const session = setup({ food: 0, grain: 1 })
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') return
    resp = session.resolveChoice(0, `minor:${CARD_ID}`)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })

  it('food=2, grain=1 → multi-solution → selectPayment choice', () => {
    const session = setup({ food: 2, grain: 1 })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.interaction.stateId !== 'wait') return
    resp = session.resolveChoice(0, `minor:${CARD_ID}`)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    expect(resp.interaction.options?.length).toBeGreaterThanOrEqual(2)
  })

  it('food=1, grain=0 → not buyable', () => {
    const session = setup({ food: 1, grain: 0 })
    const resp = session.takeAction(0, 'major-improvement')
    if (resp.interaction.stateId !== 'wait') return
    const d83Option = resp.interaction.options?.find((o) => o.value === `minor:${CARD_ID}`)
    expect(d83Option).toBeUndefined()
  })
})
