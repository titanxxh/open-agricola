import { describe, expect, it } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import type { ActionHookPhase } from '../../actions/hooks'
import { setActiveWorkerCount, setWorkersAtHome } from '../../domain/player'
import { A171_Sidekick_impl } from '../A/A171_Sidekick'
import type { CardListenerContext } from '../card-listeners'

const CARD_ID = 'A171_Sidekick'

const setupContext = (options: {
  currentSpaceId?: string
  round?: number
  food?: number
  workersAtHome?: number
  targetOccupied?: boolean
  targetBlocked?: boolean
  targetExecutable?: boolean
  targetSpaceId?: string
  actionContext?: Record<string, unknown>
  missingLeftSlot?: boolean
} = {}): CardListenerContext => {
  const session = new GameSession(42, undefined, { playerCount: 5 })
  const state = session.getState().state
  state.round = options.round ?? 3
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'sheep-market'
  if (!options.missingLeftSlot) state.roundActionOrder[1] = 'vegetable-seeds'
  state.roundActionOrder[2] = 'pig-market'
  const owner = state.players[0]!
  owner.occupationPlayed.push(CARD_ID)
  owner.resources.food = options.food ?? 1
  setActiveWorkerCount(owner, 3)
  setWorkersAtHome(state, owner, options.workersAtHome ?? 2)
  const target = state.actionSpaces.find((space) => space.id === (options.targetSpaceId ?? 'vegetable-seeds'))!
  target.takenBy = options.targetOccupied ? [{ playerId: state.players[1]!.id, workerId: '1' }] : []
  target.blockedBy = options.targetBlocked ? [{ playerId: state.players[1]!.id, workerId: '1', sourceSpaceId: 'linked' }] : []
  target.strictCanExecute = true
  target.canBeExecutedByPlayer = () => options.targetExecutable ?? true
  const space = state.actionSpaces.find((candidate) => candidate.id === (options.currentSpaceId ?? 'pig-market'))!
  return {
    state,
    player: owner,
    ownerPlayer: owner,
    effectPlayer: owner,
    triggerPlayer: owner,
    space,
    actionId: 'place-farmer',
    phase: 'after' as ActionHookPhase,
    result: { type: 'ok' },
    actionContext: options.actionContext,
  } as CardListenerContext
}

const run = (context: CardListenerContext = setupContext()) =>
  A171_Sidekick_impl.listeners[0]!.handler!(context)

describe('A171 Sidekick listener', () => {
  it('offers a pay-and-place flow for the immediately-left revealed round action card', () => {
    expect(run()).toMatchObject({
      sourceCard: CARD_ID,
      flow: {
        type: 'seq',
        optional: true,
        children: [
          { actionId: 'pay', params: { food: 1 }, sourceCard: CARD_ID },
          {
            actionId: 'place-farmer-on-space',
            sourceCard: CARD_ID,
            params: { spaceId: 'vegetable-seeds', sourceCard: CARD_ID },
            actionContext: { sidekickChain: ['pig-market'] },
          },
        ],
      },
    })
  })

  it('does not chain from a fixed action', () => {
    expect(run(setupContext({ currentSpaceId: 'forest', targetSpaceId: 'grain-seeds' }))).toBeUndefined()
  })

  it('does not chain to a fixed action left of the first round slot', () => {
    expect(run(setupContext({ currentSpaceId: 'sheep-market', targetSpaceId: 'farm-expansion' }))).toBeUndefined()
  })

  it.each([
    ['no left neighbor', { currentSpaceId: 'lessons-56-2f' }],
    ['missing left slot', { missingLeftSlot: true }],
    ['no food', { food: 0 }],
    ['no worker', { workersAtHome: 0 }],
    ['occupied target', { targetOccupied: true }],
    ['blocked target', { targetBlocked: true }],
    ['unexecutable target', { targetExecutable: false }],
    ['loop chain already visited current', { actionContext: { sidekickChain: ['pig-market'] } }],
    ['loop chain already visited target', { actionContext: { sidekickChain: ['vegetable-seeds'] } }],
  ] as const)('does not trigger when %s', (_label, options) => {
    expect(run(setupContext(options))).toBeUndefined()
  })
})
