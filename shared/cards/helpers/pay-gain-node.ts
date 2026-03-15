import type { Resource } from '../../game/types'
import type { ActionFlow } from '../../game/types'
import type { ActionHookResult } from '../../actions/hooks'
import { splitCardGain, type CardGain } from './card-gain'

type SequenceFlow = {
  type: 'seq'
  optional?: boolean
  promptKey?: string
  children: ActionFlow[]
}

type PayGainNodeOptions = {
  cardId: string
  cost: Partial<Resource>
  gain?: CardGain
  promptKey?: string
  choiceLabelKey?: string
  choiceLabelParams?: Record<string, string | number>
}

type PayThenActionFlowOptions = {
  cardId: string
  cost: Partial<Resource>
  promptKey?: string
  action: ActionFlow
  choiceLabelKey?: string
  choiceLabelParams?: Record<string, string | number>
}

type ReturnToSpaceThenGainFlowOptions = {
  cardId: string
  cost: Partial<Resource>
  gain: CardGain
  promptKey?: string
}

const buildSequenceNode = (
  promptKey: string | undefined,
  children: ActionFlow[],
  optional = false,
): SequenceFlow => ({
  type: 'seq',
  optional,
  promptKey,
  children,
})

export const gainLeaf = (
  cardId: string,
  gain: CardGain,
  choiceLabelKey?: string,
  choiceLabelParams?: Record<string, string | number>,
): ActionFlow => {
  const { resources } = splitCardGain(gain)
  return {
    type: 'leaf',
    actionId: 'gain',
    params: resources,
    sourceCard: cardId,
    choiceLabelKey,
    choiceLabelParams,
  }
}

export const payLeaf = ({
  cardId,
  cost,
  choiceLabelKey,
  choiceLabelParams,
}: Pick<PayGainNodeOptions, 'cardId' | 'cost' | 'choiceLabelKey' | 'choiceLabelParams'>): ActionFlow => ({
  type: 'leaf',
  actionId: 'pay-resources',
  params: cost,
  sourceCard: cardId,
  choiceLabelKey,
  choiceLabelParams,
})

const bonusVpLeaves = (cardId: string, gain?: CardGain): ActionFlow[] => {
  const { score } = splitCardGain(gain)
  return Array.from({ length: Math.max(0, score) }, () => ({
    type: 'leaf',
    actionId: 'bonus-vp',
    sourceCard: cardId,
  }))
}

export const payGainActionFlow = ({
  cardId,
  cost,
  gain,
  choiceLabelKey,
  choiceLabelParams,
}: PayGainNodeOptions): SequenceFlow =>
  buildSequenceNode(undefined, [
    payLeaf({ cardId, cost, choiceLabelKey, choiceLabelParams }),
    ...bonusVpLeaves(cardId, gain),
    ...(gain ? [gainLeaf(cardId, gain)] : []),
  ])

export const payGainNode = ({
  cardId,
  cost,
  gain,
  promptKey,
  choiceLabelKey,
  choiceLabelParams,
}: PayGainNodeOptions): ActionHookResult =>
  ({
    flow: buildSequenceNode(promptKey, payGainActionFlow({
      cardId,
      cost,
      gain,
      choiceLabelKey,
      choiceLabelParams,
    }).children, true),
  })

export const payThenGainActionFlow = ({
  cardId,
  cost,
  gain,
  choiceLabelKey,
  choiceLabelParams,
}: PayGainNodeOptions): SequenceFlow =>
  buildSequenceNode(undefined, [
    payLeaf({ cardId, cost, choiceLabelKey, choiceLabelParams }),
    gainLeaf(cardId, gain ?? {}),
  ])

export const payThenGainFlow = ({
  cardId,
  cost,
  gain,
  promptKey,
  choiceLabelKey,
  choiceLabelParams,
}: PayGainNodeOptions): ActionHookResult =>
  ({
    flow: buildSequenceNode(promptKey, payThenGainActionFlow({
      cardId,
      cost,
      gain,
      choiceLabelKey,
      choiceLabelParams,
    }).children, true),
  })

export const payThenActionActionFlow = ({
  cardId,
  cost,
  action,
  choiceLabelKey,
  choiceLabelParams,
}: PayThenActionFlowOptions): SequenceFlow =>
  buildSequenceNode(undefined, [
    payLeaf({ cardId, cost, choiceLabelKey, choiceLabelParams }),
    action,
  ])

export const payThenActionFlow = ({
  cardId,
  cost,
  promptKey,
  action,
  choiceLabelKey,
  choiceLabelParams,
}: PayThenActionFlowOptions): ActionHookResult =>
  ({
    flow: buildSequenceNode(promptKey, payThenActionActionFlow({
      cardId,
      cost,
      action,
      choiceLabelKey,
      choiceLabelParams,
    }).children, true),
  })

export const returnToSpaceThenGainActionFlow = ({
  cardId,
  cost,
  gain,
}: ReturnToSpaceThenGainFlowOptions): SequenceFlow =>
  buildSequenceNode(undefined, [
    { type: 'leaf', actionId: 'return-to-space', params: cost, sourceCard: cardId },
    gainLeaf(cardId, gain),
  ])

export const returnToSpaceThenGainFlow = ({
  cardId,
  cost,
  gain,
  promptKey,
}: ReturnToSpaceThenGainFlowOptions): ActionHookResult =>
  ({
    flow: buildSequenceNode(promptKey, returnToSpaceThenGainActionFlow({
      cardId,
      cost,
      gain,
    }).children, true),
  })
