import type { ChoiceEffectPreview, Resource } from '../../contract/types'
import type { ActionFlow } from '../../contract/types'
import type { PromptKey } from '../../game/prompt-keys'
import type { ActionHookResult } from '../../actions/hooks'
import { splitCardGain, type CardGain } from './card-gain'

type SequenceFlow = {
  type: 'seq'
  optional?: boolean
  promptKey?: PromptKey
  children: ActionFlow[]
}

type PayGainNodeOptions = {
  cardId: string
  cost: Partial<Resource>
  gain?: CardGain
  promptKey?: PromptKey
  choiceLabelKey?: string
  choiceLabelParams?: Record<string, unknown>
  followUp?: ActionFlow[]
}

type PayThenActionFlowOptions = {
  cardId: string
  cost: Partial<Resource>
  promptKey?: PromptKey
  action: ActionFlow
  choiceLabelKey?: string
  choiceLabelParams?: Record<string, unknown>
}

type ReturnToSpaceThenGainFlowOptions = {
  cardId: string
  cost: Partial<Resource>
  gain: CardGain
  promptKey?: PromptKey
  choiceLabelKey?: string
}

const buildSequenceNode = (
  promptKey: PromptKey | undefined,
  children: ActionFlow[],
  optional = false,
): SequenceFlow => ({
  type: 'seq',
  optional,
  promptKey,
  children,
})

const resolveChoiceLabelParams = (
  cost: Partial<Resource>,
  gain: CardGain | undefined,
  choiceLabelKey?: string,
  choiceLabelParams?: Record<string, unknown>,
) => {
  if (choiceLabelParams) return choiceLabelParams
  if (choiceLabelKey !== 'ui.interactionResourceExchange') return undefined
  const { resources, score } = splitCardGain(gain)
  return {
    resourcesPaid: cost,
    resourcesGained: resources,
    bonusVp: score > 0 ? score : undefined,
  }
}

const resolveChoiceLabelKey = (
  gain: CardGain | undefined,
  choiceLabelKey?: string,
) => {
  if (choiceLabelKey) return choiceLabelKey
  const { resources, score } = splitCardGain(gain)
  if (Object.keys(resources).length > 0 || score > 0) {
    return 'ui.interactionResourceExchange'
  }
  return undefined
}

const buildEffectPreview = (
  cost: Partial<Resource>,
  gain: CardGain | undefined,
): ChoiceEffectPreview => {
  const { resources, score } = splitCardGain(gain)
  if (Object.keys(resources).length > 0 || score > 0) {
    return {
      kind: 'resourceExchange',
      resourcesPaid: cost,
      resourcesGained: Object.keys(resources).length > 0 ? resources : undefined,
      bonusVp: score > 0 ? score : undefined,
    }
  }
  return {
    kind: 'payment',
    resourcesPaid: cost,
  }
}

export const gainLeaf = (
  cardId: string,
  gain: CardGain,
  choiceLabelKey?: string,
  choiceLabelParams?: Record<string, unknown>,
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
  effectPreview,
}: Pick<PayGainNodeOptions, 'cardId' | 'cost' | 'choiceLabelKey' | 'choiceLabelParams'> & {
  effectPreview?: ChoiceEffectPreview
}): ActionFlow => ({
  type: 'leaf',
  actionId: 'pay',
  params: cost,
  sourceCard: cardId,
  choiceLabelKey,
  choiceLabelParams,
  effectPreview,
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
  followUp,
}: PayGainNodeOptions): SequenceFlow => {
  const { resources } = splitCardGain(gain)
  const resolvedChoiceLabelKey = resolveChoiceLabelKey(gain, choiceLabelKey)
  return buildSequenceNode(undefined, [
    payLeaf({
      cardId,
      cost,
      choiceLabelKey: resolvedChoiceLabelKey,
      choiceLabelParams: resolveChoiceLabelParams(cost, gain, resolvedChoiceLabelKey, choiceLabelParams),
      effectPreview: buildEffectPreview(cost, gain),
    }),
    ...bonusVpLeaves(cardId, gain),
    ...(Object.keys(resources).length > 0 && gain ? [gainLeaf(cardId, gain)] : []),
    ...(followUp ?? []),
  ])
}

export const payGainFlow = ({
  cardId,
  cost,
  gain,
  promptKey,
  choiceLabelKey,
  choiceLabelParams,
  followUp,
}: PayGainNodeOptions): ActionFlow =>
  buildSequenceNode(promptKey, payGainActionFlow({
    cardId,
    cost,
    gain,
    choiceLabelKey,
    choiceLabelParams,
    followUp,
  }).children, true)

export const payGainNode = (options: PayGainNodeOptions): ActionHookResult =>
  ({ flow: payGainFlow(options) })

export const payThenGainActionFlow = ({
  cardId,
  cost,
  gain,
  choiceLabelKey,
  choiceLabelParams,
  followUp,
}: PayGainNodeOptions): SequenceFlow => {
  const resolvedGain = gain ?? {}
  const { resources } = splitCardGain(resolvedGain)
  const resolvedChoiceLabelKey = resolveChoiceLabelKey(gain, choiceLabelKey)
  return buildSequenceNode(undefined, [
    payLeaf({
      cardId,
      cost,
      choiceLabelKey: resolvedChoiceLabelKey,
      choiceLabelParams: resolveChoiceLabelParams(cost, gain, resolvedChoiceLabelKey, choiceLabelParams),
      effectPreview: buildEffectPreview(cost, gain),
    }),
    ...(Object.keys(resources).length > 0 ? [gainLeaf(cardId, resolvedGain)] : []),
    ...(followUp ?? []),
  ])
}

const payThenActionActionFlow = ({
  cardId,
  cost,
  action,
  choiceLabelKey,
  choiceLabelParams,
}: PayThenActionFlowOptions): SequenceFlow =>
  buildSequenceNode(undefined, [
    payLeaf({
      cardId,
      cost,
      choiceLabelKey,
      choiceLabelParams,
      effectPreview: buildEffectPreview(cost, undefined),
    }),
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

const returnToSpaceThenGainActionFlow = ({
  cardId,
  cost,
  gain,
  choiceLabelKey,
}: ReturnToSpaceThenGainFlowOptions): SequenceFlow =>
  buildSequenceNode(undefined, [
    { type: 'leaf', actionId: 'return-to-space', params: cost, sourceCard: cardId, choiceLabelKey },
    gainLeaf(cardId, gain),
  ])

export const returnToSpaceThenGainFlow = ({
  cardId,
  cost,
  gain,
  promptKey,
  choiceLabelKey,
}: ReturnToSpaceThenGainFlowOptions): ActionHookResult =>
  ({
    flow: buildSequenceNode(promptKey, returnToSpaceThenGainActionFlow({
      cardId,
      cost,
      gain,
      choiceLabelKey,
    }).children, true),
  })
