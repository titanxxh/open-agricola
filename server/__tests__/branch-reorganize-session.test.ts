import { describe, expect, it } from 'vitest'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { createWorkSession } from './_helpers/session-fixtures'

const CARD = '__test_branch_reorganize__'

describe('reorganization chosen through an XOR branch', () => {
  it('opens the reorganization before any completion reaction of that branch', () => {
    const session = createWorkSession({ configure: (state) => {
      const player = state.players[0]!
      player.minorPlayed = [CARD]
      player.resources = { ...player.resources, sheep: 1, wood: 0 }
    } })
    const seen: Array<string | undefined> = []
    session.withCtx(() => {
      const registry = requireActiveCardRegistry('branch reorganize')
      registry.registerListener({
        id: `${CARD}:after-day-laborer`, cardIds: [CARD], phases: ['after'], actions: ['place-farmer'], mandatory: true,
        handler: (context) => context.space?.id !== 'day-laborer' ? undefined : {
          sourceCard: CARD,
          flow: { type: 'xor', children: [
            { type: 'leaf', actionId: 'reorganize', sourceCard: CARD },
            { type: 'leaf', actionId: 'gain', sourceCard: CARD, params: { wood: 1 } },
          ] },
        },
      })
      registry.registerListener({
        id: `${CARD}:reorganize-completion`, cardIds: [CARD], phases: ['immediatelyAfter', 'after'], actions: ['reorganize'], mandatory: true,
        handler: (context) => { seen.push(context.result?.type); return undefined },
      })
    })

    let response = session.takeAction(0, 'day-laborer')
    const branch = response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'
      ? response.interaction.request.options.find((option) => option.labelKey === 'actions.reorganize.name')
      : undefined
    expect(branch).toBeDefined()
    response = session.resolveChoice(0, branch!.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('animal-reorg')
    expect(response.interaction.stateId === 'wait' && response.interaction.playerIndex).toBe(0)
    // The branch's request is pending; completion reactions must not run on it.
    expect(seen).toEqual([])
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })
})
