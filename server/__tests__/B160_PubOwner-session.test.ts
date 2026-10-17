import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardEffect } from '../../shared/cards/card-effects'

import { markAllWorkersUsed } from '../../shared/domain/player'
import '../../shared/cards/B/B160_PubOwner'
import type { ActionChoiceOption } from '../../shared/contract/types'
import type { ActionFlow } from '../../shared/contract/types'
import * as audit30Native from './_helpers/audit/ae-negative-30-native'

const CARD_ID = 'B160_PubOwner'

describe('B160_PubOwner session', () => {
  it('onBuy returns a gain-1-grain flow', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = session.withCtx(() => effect!.onBuy!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.grain).toBe(1)
  })

  it('onBeforeReturnHome gives 1 grain when forest, clay-pit, reed-bank all occupied', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.grain = 0

    // Mark all three spaces as taken
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (forest) forest.takenBy = [{ playerId: 'p2', workerId: '1' }]
    if (clayPit) clayPit.takenBy = [{ playerId: 'p1', workerId: '1' }]
    if (reedBank) reedBank.takenBy = [{ playerId: 'p2', workerId: '1' }]

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = session.withCtx(() => effect!.onBeforeReturnHome!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.grain).toBe(1)
  })

  it('onBeforeReturnHome does not trigger when forest is not occupied', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.grain = 0

    // Only clay-pit and reed-bank taken, forest not taken
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (clayPit) clayPit.takenBy = [{ playerId: 'p1', workerId: '1' }]
    if (reedBank) reedBank.takenBy = [{ playerId: 'p2', workerId: '1' }]

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onBeforeReturnHome!(state, player))
    expect(flow).toBeUndefined()
  })

  it('onBeforeReturnHome does not trigger when no spaces occupied', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.grain = 0

    // No spaces taken
    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onBeforeReturnHome!(state, player))
    expect(flow).toBeUndefined()
  })

  it('integration: end of work phase gives grain when all three spaces occupied', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      p.resources.food = 10
    })

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.grain = 2

    // Mark all three spaces as occupied
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (forest) forest.takenBy = [{ playerId: state.players[0]!.id, workerId: '1' }]
    if (clayPit) clayPit.takenBy = [{ playerId: state.players[1]!.id, workerId: '1' }]
    if (reedBank) reedBank.takenBy = [{ playerId: state.players[0]!.id, workerId: '2' }]

    session.loadState(state)

    let resp = session.performRoundEnd()

    // Drive through any pending choices
    let safety = 30
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      if (resp.interaction.stateId === 'wait') {
        const skipOpt = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
        if (skipOpt) {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
        } else {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, resp.interaction.request.options[0]!.value)
        }
      } else {
        break
      }
    }

    // After round end, PubOwner should have given 1 grain during return home phase
    expect(resp.state.players[0]!.resources.grain).toBe(2 + 1)
  })
})

describe('ae-negative-30-native', () => {
  const { sessions, commands, save, make, finish, play, res, phase, pub } = audit30Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); commands.splice(0); });
  it('B160 N1 real purchase and three actual occupied spaces grant two separate grain', () => { const s = make('B160_PubOwner', undefined, false), bought = finish(s, play(s, 'B160_PubOwner')); res(bought, { grain: 1 }); const x = phase(s, [[1, 'forest'], [2, 'clay-pit'], [3, 'reed-bank'], [0, 'fishing']]); res(x.before, { grain: 1 }); res(x.r, { grain: 2 }); save('B160-N1', { bought, ...x }); });
  it('B160 N2 every missing named space and held card prevents return-home grain', () => { for (const mode of ['forest', 'clay-pit', 'reed-bank', 'hand']) {
      const s = make('B160_PubOwner', undefined, mode !== 'hand'), places = pub.map(([a, space]): [
          number,
          string
      ] => [a, space === mode ? 'copse' : space]), x = phase(s, places, mode === 'hand' ? [] : [mode]);
      res(x.r, { grain: 1 });
      save(`B160-N2-${mode}`, x);
  } });
  it('B160 N3 three opponents alone can satisfy all occupied condition', () => { const s = make('B160_PubOwner'), x = phase(s, [[0, 'fishing'], [1, 'forest'], [2, 'clay-pit'], [3, 'reed-bank'], [0, 'copse']]); res(x.before, { grain: 0 }); res(x.r, { grain: 1 }); save('B160-N3', x); });
})
