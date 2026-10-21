import { describe, expect, it } from 'vitest'
import type { ActionFlow, Resource } from '../../contract/types'
import { D180_PartTimeWorker_impl } from '../D/D180_PartTimeWorker'
import type { CardListenerContext } from '../card-listeners'
import { mkActionSpace } from './fixtures'

const run = (
  resources: Partial<Resource>,
  { gainPerRound = { wood: 1 }, actionContext }: { gainPerRound?: Partial<Resource>; actionContext?: Record<string, unknown> } = {},
) => {
  const space = mkActionSpace({ id: 'forest', resources: resources as Resource, gainPerRound })
  return D180_PartTimeWorker_impl.listeners[0]!.handler!({
    state: { actionSpaces: [space] },
    space,
    actionId: 'collect',
    phase: 'computeReplace',
    actionContext,
    transactionEvents: [],
  } as unknown as CardListenerContext)
}

/** What each offered branch takes from the space (left goods are the rest). */
const takes = (flow: ActionFlow | undefined): Partial<Resource>[] => {
  const branches = flow?.type === 'xor' ? flow.children : flow ? [flow] : []
  return branches.map(branch => Object.fromEntries((branch.type === 'seq' ? branch.children : [])
    .filter(leaf => leaf.type === 'leaf' && leaf.actionId === 'collect')
    .map(leaf => [leaf.actionContext!.resource, leaf.actionContext!.amount])))
}

describe('D180 Part-Time Worker collect replacement', () => {
  it('offers to take all but 1/2/3 goods from 2/4/6 goods as an alternative to the collect', () => {
    expect(run({ wood: 2 })).toMatchObject({ decline: true, sourceCard: 'D180_PartTimeWorker' })
    expect(takes(run({ wood: 2 })?.alternativeFlow)).toEqual([{ wood: 1 }])
    expect(takes(run({ wood: 6 })?.alternativeFlow)).toEqual([{ wood: 3 }])
    expect(takes(run({ wood: 2, clay: 2 })?.alternativeFlow)).toEqual([{ wood: 2 }, { wood: 1, clay: 1 }, { clay: 2 }])
  })

  it('ignores other totals, non-accumulation spaces, card partial takes and the declined original', () => {
    expect(run({ wood: 3 })).toBeUndefined()
    expect(run({ wood: 5, clay: 0 })).toBeUndefined()
    expect(run({ wood: 2 }, { gainPerRound: {} })).toBeUndefined()
    expect(run({ wood: 4 }, { actionContext: { spaceId: 'forest', resource: 'wood', amount: 1 } })).toBeUndefined()
    expect(run({ wood: 4 }, { actionContext: { spaceId: 'forest', resourceTypes: ['wood'] } })).toBeUndefined()
    expect(run({ wood: 4 }, { actionContext: { checkedReplaceAction: true } })).toBeUndefined()
  })
})
