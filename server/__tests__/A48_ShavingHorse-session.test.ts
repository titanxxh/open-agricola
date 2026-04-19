import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/A/A48_ShavingHorse'

const CARD_ID = 'A48_ShavingHorse'

type SetupOptions = {
  forestWood?: number
  playerWood?: number
  playerFood?: number
  cardPlayed?: boolean
}

const setup = (options: SetupOptions = {}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  if (options.cardPlayed !== false) {
    player.minorPlayed.push(CARD_ID)
  }
  player.resources.wood = options.playerWood ?? 0
  player.resources.food = options.playerFood ?? 0

  const forest = state.actionSpaces.find((s) => s.id === 'forest')!
  forest.resources.wood = options.forestWood ?? 3

  session.loadState(state)
  return session
}

describe('A48_ShavingHorse session', () => {
  it('does not trigger when card not played', () => {
    const session = setup({ forestWood: 3, playerWood: 4, cardPlayed: false })
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).not.toBe('choice')
    expect(resp.state.players[0]!.resources.wood).toBe(7)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('does not trigger when total wood < 5 after collect', () => {
    const session = setup({ forestWood: 3, playerWood: 1 })
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).not.toBe('choice')
    expect(resp.state.players[0]!.resources.wood).toBe(4)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('does not trigger when collect returns 0 wood (empty space)', () => {
    const session = setup({ forestWood: 0, playerWood: 6 })
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).not.toBe('choice')
    expect(resp.state.players[0]!.resources.wood).toBe(6)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('offers optional exchange when wood reaches 5', () => {
    const session = setup({ forestWood: 3, playerWood: 2 }) // after collect: 5
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.options).toHaveLength(2)
    // player resources not yet charged
    expect(resp.state.players[0]!.resources.wood).toBe(5)
    expect(resp.state.players[0]!.resources.food).toBe(0)

    // Accept (first option is the action node; '__skip__' is the decline option)
    const acceptOption = resp.pending.options.find((o) => o.value !== '__skip__')!
    const resp2 = session.resolveChoice(0, acceptOption.value)
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.resources.wood).toBe(4)
    expect(resp2.state.players[0]!.resources.food).toBe(3)
  })

  it('decline option keeps wood and grants no food', () => {
    const session = setup({ forestWood: 3, playerWood: 2 })
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    const resp2 = session.resolveChoice(0, '__skip__')
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.resources.wood).toBe(5)
    expect(resp2.state.players[0]!.resources.food).toBe(0)
  })

  it('forces mandatory exchange when wood reaches 7', () => {
    const session = setup({ forestWood: 3, playerWood: 4 }) // after collect: 7
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    // No choice prompt — mandatory flow runs through automatically
    expect(resp.pending.type).not.toBe('choice')
    expect(resp.state.players[0]!.resources.wood).toBe(6)
    expect(resp.state.players[0]!.resources.food).toBe(3)
  })

  it('has cost { wood: 1 } aligned with BGA', async () => {
    const mod = await import('../../shared/cards/A/A48_ShavingHorse')
    expect(mod.A48_ShavingHorse.cost).toEqual({ wood: 1 })
  })
})
