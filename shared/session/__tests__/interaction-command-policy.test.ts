import { describe, expect, it } from 'vitest'
import type { InteractionCommand, InteractionRequest } from '../../contract/types'
import {
  interactionSubmitChannel,
  waitInteractionInputCommands,
} from '../interaction-command-policy'

type Case = {
  channel: ReturnType<typeof interactionSubmitChannel>
  commands: InteractionCommand[]
}

const cases = {
  choice: { channel: 'resolveChoice', commands: ['resolveChoice'] },
  'animal-reorg': { channel: 'resolveChoice', commands: ['resolveChoice'] },
  'confirm-next-player': { channel: 'resolveChoice', commands: ['resolveChoice'] },
  'confirm-player-switch': { channel: 'resolveChoice', commands: ['resolveChoice'] },
  feed: { channel: 'resolveChoice', commands: ['resolveChoice'] },
  heating: { channel: 'resolveChoice', commands: ['resolveChoice'] },
  'select-trigger': { channel: 'resolveChoice', commands: ['resolveChoice'] },
  'farm-select': { channel: 'commitSelection', commands: ['commitSelection'] },
  selection: { channel: 'commitSelection', commands: ['commitSelection'] },
  'resource-quantity-select': { channel: 'commitSelection', commands: ['commitSelection'] },
  'resource-batch-exchange-select': { channel: 'commitSelection', commands: ['commitSelection'] },
  'card-draft': { channel: 'none', commands: [] },
  'engine-blocked': { channel: 'none', commands: [] },
} satisfies Record<InteractionRequest['kind'], Case>

describe('interaction command policy', () => {
  it.each(Object.entries(cases))('maps %s', (kind, { channel, commands }) => {
    expect(interactionSubmitChannel(kind)).toBe(channel)
    expect(waitInteractionInputCommands(kind)).toEqual(commands)
  })
})
