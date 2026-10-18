# 30. Existing goods enter a supply through receive

- Status: Accepted
- Date: 2026-10-18

## Context

Issue #1288. Existing goods reached a player's supply through four paths: `take-from-card` deducted card counters and delegated the credit to `gain`, `pop-card-stack` and the `special-effect` farm goods token claims credited the goods themselves, and `receive` settled only scheduled future goods. A card reacting to every good the player gets had to subscribe to each path. E103 Wolf subscribed to both `take-from-card` and `gain`, so one take from a card reached it twice: after the player skipped or passed its claim, it asked again for the same good. The rule from 2026-08-27 that a resource listener never subscribes to both layers had been broken by a later subscription, and the other paths were missing from most resource listeners. The reference implementation moves any existing good off a card, space or round card with one `Receive` action, and keeps `Gain` for new goods from the general supply.

## Decision

- `gain` brings new goods from the general supply. `receive` is the only credit for existing goods entering a supply: scheduled future goods, card counters, card stack items and farm goods tokens.
- A source action removes the goods from its own source and emits its source event (`card.stackChanged`, token removal), then hands the credit to a `receive` child with `params.fromCard`. `take-from-card`, `pop-card-stack`, `claim-farmyard-goods-tokens` and `claim-field-goods-tokens` follow this; a non-goods stack item only changes the stack. The farm goods token claims are their own internal actions, so `special-effect` no longer credits goods.
- The credited `resource.moved` event keeps `from: { kind: 'card' }`, `reason: 'cardEffect'` and the source card, so logs, statistics and event readers see the same facts as before.
- A resource listener subscribes to the action that credits the goods (`gain`, `collect`, `receive`, `reap`, `exchange`), never to a source action, and reacts only to goods that reach its owner's supply. A listener about a card's own counters or stack may subscribe to the source action.
- When the first leaf of a selected XOR sequence branch runs on selection and returns a flow, the engine inserts that flow right after the leaf, so a source action's `receive` credit runs before the branch's later siblings.

## Consequences

- Wolf subscribes to `gain`, `collect`, `exchange`, `receive` and `reap`, and asks once per movement. Breed Registry counts a sheep taken from a card once through its `receive` listener.
- Goods popped from a card stack and farm goods tokens now reach existing Receive listeners such as Shaving Horse, Hayloft Barn and Agricultural Labourer, as their card text says they obtain goods. Goods taken from a card no longer reach Gain-only listeners; the current Gain-only listeners concern action spaces or specific spaces.
- Field goods tokens now record card resource statistics and work-phase building resources like the other card goods.
- Workshop listeners on `gain` no longer see goods moved off a card; they subscribe to `receive` for them.
- A card reacting to its own credited goods reacts at its `receive` child. With only one matching listener the reaction opens without a trigger selection.

## Alternatives considered

- Removing only `take-from-card` from Wolf's subscriptions: fixes the repeated question, but leaves `pop-card-stack` and the token claims outside every other resource listener.
- Crediting every card good through `gain`, as the 2026-08-27 change did for card counters: keeps Gain listeners seeing card goods, but merges two kinds of goods the card texts and the reference implementation keep apart.
- Letting `receive` debit the source itself, as the reference action does: needs one source contract per storage kind in `receive`; the source actions already own their storage and its events.
