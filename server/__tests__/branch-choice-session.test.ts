import { describe, expect, it } from 'vitest'
import type { SessionResponse } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { createWorkSession } from './_helpers/session-fixtures'

const CARD = '__test_branch_occupation__'
const PLAYED = 'B103_FieldMerchant'

const choiceOptions = (response: SessionResponse) =>
  response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'
    ? response.interaction.request.options
    : []

describe('completion choice of a leaf selected through an XOR branch', () => {
  it('keeps the leaf’s own submission as the choice when the leaf asks for one', () => {
    const session = createWorkSession({ configure: (state) => {
      const player = state.players[0]!
      player.minorPlayed = [CARD]
      player.occupationHand = [PLAYED, 'B100_Clutterer']
      player.resources = { ...player.resources, wood: 0, reed: 0, clay: 0 }
    } })
    const seen: Array<string | undefined> = []
    session.withCtx(() => {
      const registry = requireActiveCardRegistry('branch occupation')
      registry.registerListener({
        id: `${CARD}:after-day-laborer`, cardIds: [CARD], phases: ['after'], actions: ['place-farmer'], mandatory: true,
        handler: (context) => context.space?.id !== 'day-laborer' ? undefined : {
          sourceCard: CARD,
          flow: { type: 'xor', children: [
            { type: 'leaf', actionId: 'occupation', sourceCard: CARD, params: { exactCost: {} } },
            { type: 'leaf', actionId: 'gain', sourceCard: CARD, params: { clay: 1 } },
          ] },
        },
      })
      registry.registerListener({
        id: `${CARD}:occupation-after`, cardIds: [CARD], phases: ['after'], actions: ['occupation'],
        handler: (context) => { seen.push(context.choice); return undefined },
      })
    })

    let response = session.takeAction(0, 'day-laborer')
    const branch = choiceOptions(response).find((option) => option.labelKey === 'actions.lessons.name')
    expect(branch).toBeDefined()
    response = session.resolveChoice(0, branch!.value)
    expect(choiceOptions(response).map((option) => option.value)).toContain(PLAYED)

    response = session.resolveChoice(0, PLAYED)
    // Field Merchant's on-play reaction is offered in the reaction menu.
    const trigger = response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger'
      ? response.interaction.request.options.find((option) => option.value === PLAYED)
      : undefined
    expect(trigger).toBeDefined()
    response = session.resolveChoice(0, trigger!.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(PLAYED)
    // Listeners read the submitted card, not the branch that offered the action;
    // Field Merchant's own on-play reward depends on it.
    // Reaction previews also call the handler; every call sees the same choice.
    expect(new Set(seen)).toEqual(new Set([PLAYED]))
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, reed: 1, clay: 0 })
  })
})
