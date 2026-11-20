/**
 * Builds a card implementation from an object literal written as source text,
 * with `CARD_ID`, `gainLeaf` and `payLeaf` in scope; a listener without an id
 * gets `<CARD_ID>-listener-<n>`. Session tests use it to
 * drive engine paths with a card that is not in the catalog; the card loads
 * through `loadTestCardImpls` / `createWorkSession({ cardImpls })`.
 */
import type { CardImpl } from '../../../shared/cards/registry'
import { gainLeaf, payLeaf } from '../../../shared/cards/helpers/pay-gain-node'

export function testCardImpl(cardId: string, implementation: string): CardImpl {
  const build = new Function('CARD_ID', 'gainLeaf', 'payLeaf', `'use strict'\nreturn (${implementation})`) as
    (id: string, gain: typeof gainLeaf, pay: typeof payLeaf) => CardImpl
  const impl = build(cardId, gainLeaf, payLeaf)
  impl.listeners = impl.listeners?.map((listener, index) => ({ ...listener, id: listener.id ?? `${cardId}-listener-${index + 1}` }))
  return impl
}
