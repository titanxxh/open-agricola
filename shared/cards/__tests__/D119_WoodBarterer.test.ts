import { describe, expect, it } from 'vitest'
import { D119_WoodBarterer_impl } from '../D/D119_WoodBarterer'
import type { ActionFlow } from '../../contract/types'

const getFlow = (): ActionFlow => {
  const result = D119_WoodBarterer_impl.listeners[0]!.handler({
    trueAction: true,
    space: { flow: { type: 'leaf', actionId: 'construct' } },
    doable: true,
  } as never)
  expect(result?.flow).toBeDefined()
  return result!.flow!
}

const collectChoiceLabelKeys = (flow: ActionFlow): string[] => {
  if (flow.type === 'leaf') return flow.choiceLabelKey ? [flow.choiceLabelKey] : []
  return [
    ...(flow.choiceLabelKey ? [flow.choiceLabelKey] : []),
    ...flow.children.flatMap(collectChoiceLabelKeys),
  ]
}

describe('D119_WoodBarterer', () => {
  it('uses automatic descriptions for gain and pay-gain options', () => {
    expect(collectChoiceLabelKeys(getFlow())).toEqual([])
  })
})
