import type { ActionChoiceOption, PaymentResourceMap } from '../../contract/types'

export const paymentChoiceOption = (option: Omit<ActionChoiceOption, 'effectPreview'>, cost: PaymentResourceMap): ActionChoiceOption => ({
  ...option, effectPreview: { kind: 'payment', resourcesPaid: cost },
})
