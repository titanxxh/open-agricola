import { describe, expect, it } from 'vitest'
import type { ActionChoiceOption, InteractionState } from '../../../shared/contract/types'
import type { ClientInteractionState } from '../../../shared/contract/protocol/game'

import { buildInteractionPresentationPlan } from '../interaction-presentation'

const option = (value: string, labelKey = value): ActionChoiceOption => ({
  value,
  labelKey,
})

const waitChoice = (
  options: ActionChoiceOption[],
  promptKey = 'ui.interactionChooseOne',
): InteractionState => ({
  stateId: 'wait',
  playerIndex: 0,
  promptKey: promptKey as never,
  request: { kind: 'choice', options },
  options,
  allowedCommands: ['resolveChoice', 'undoStep'],
  anytimeActions: [],
})

describe('Interaction Presentation', () => {
  it('routes generic choice waits to the choice bar surface', () => {
    const plan = buildInteractionPresentationPlan(waitChoice([option('take-wood')]))

    expect(plan.kind).toBe('choice-bar')
    if (plan.kind !== 'choice-bar') return
    expect(plan.pendingChoice.options.map((entry) => entry.value)).toEqual(['take-wood'])
    expect(plan.suppressChoiceOptions).toBe(false)
  })

  it('routes exchange choice waits to the exchange center surface', () => {
    const plan = buildInteractionPresentationPlan(
      waitChoice([option('trade:1:1'), option('cancel')], 'ui.interactionExchangeChoice'),
    )

    expect(plan.kind).toBe('exchange-center')
    if (plan.kind !== 'exchange-center') return
    expect(plan.pendingChoice.options.map((entry) => entry.value)).toEqual(['trade:1:1', 'cancel'])
  })

  it('routes Moor special-action choices to the card hot-zone surface', () => {
    const plan = buildInteractionPresentationPlan(waitChoice([
      option('card-action:moor-special-cut-peat:action:cut-peat'),
    ]))

    expect(plan.kind).toBe('moor-special-action')
    if (plan.kind !== 'moor-special-action') return
    expect(plan.pendingChoice.options).toHaveLength(1)
    expect(plan.choices.isActive).toBe(true)
    expect(plan.suppressChoiceOptions).toBe(true)
  })

  it('does not expose redacted private prompts as public interaction surfaces', () => {
    const redacted: ClientInteractionState = {
      stateId: 'wait',
      playerIndex: 1,
      promptKey: 'ui.interactionChooseOne' as never,
      request: {
        kind: 'private-prompt',
        playerIndex: 1,
        promptKind: 'choice',
        promptKey: 'ui.interactionChooseOne',
      },
      allowedCommands: [],
      anytimeActions: [],
    }

    expect(buildInteractionPresentationPlan(redacted)).toEqual({ kind: 'none' })
  })
})
