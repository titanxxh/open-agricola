import type { ChoiceDescriptionPreview, ChoiceEffectPreview } from '../../../shared/contract/types'

export const descriptionEffects = (description?: ChoiceDescriptionPreview): ChoiceEffectPreview[] => {
  if (!description) return []
  switch (description.kind) {
    case 'group': return description.parts.flatMap(descriptionEffects)
    case 'conditional': return descriptionEffects(description.body)
    case 'action': return description.effectPreview?.kind === 'rule' ? descriptionEffects(description.effectPreview.description)
      : description.effectPreview ? [description.effectPreview] : []
  }
}
