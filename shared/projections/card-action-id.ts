/**
 * Card-owned ad-hoc actions are registered as `card_<CardId>_<action>` (`registerAdHocAction` requires the
 * `card_` prefix). Displays name such an action by its card when no action name exists.
 */
const CARD_ACTION_ID = /^card_([A-Za-z0-9]+_[A-Za-z0-9]+)_[A-Za-z0-9_-]+$/

export const cardActionSourceCardId = (actionId: string): string | undefined => CARD_ACTION_ID.exec(actionId)?.[1]
