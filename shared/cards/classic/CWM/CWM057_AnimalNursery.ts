import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { fixedCardAnimals } from '../../helpers/fixed-card-animals'
import { writeCardExtraData, ensureCardState } from '../../helpers/card-state'
import { writeAnimalHolderCounts } from '../../../domain/animal-holder-state'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { createEventQuery } from '../../../events/query'
import type { AnimalKey } from '../../../contract/animals'

const CARD_ID = 'CWM057_AnimalNursery'

const fixed = fixedCardAnimals(CARD_ID)
const STORE = 'card_' + CARD_ID + '_store'
registerAdHocAction({
  id: STORE,
  nameKey: 'actions.store-on-card.name',
  descriptionKey: 'actions.store-on-card.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, eventSink }) => {
    const animals = params?.animals as Partial<Record<AnimalKey, number>> | undefined
    if (!animals) return { type: 'fail', errorKey: 'log.action' }
    const next = { ...fixed.counts(player) }
    for (const animal of ['sheep', 'boar', 'cattle'] as const)
      next[animal] = (next[animal] ?? 0) + (animals[animal] ?? 0)
    writeCardExtraData(player, CARD_ID, 'fixedAnimals', next)
    writeAnimalHolderCounts(ensureCardState(player, CARD_ID).extraData!, next)
    eventSink?.emit<'resource.moved'>({
      type: 'resource.moved',
      resources: animals,
      from: { kind: 'player', playerId: player.id },
      to: { kind: 'card', cardId: CARD_ID, playerId: player.id },
      reason: 'cardEffect',
      sourceCardId: CARD_ID,
    })
    return { type: 'ok' }
  },
})
const cardImpl = {
  effect: { id: CARD_ID, ...fixed.effect },
  listeners: [
    {
      id: CARD_ID + '-newborns',
      cardIds: [CARD_ID],
      actions: ['breed'],
      phases: ['immediatelyAfter'],
      handler: (context) => {
        const born = createEventQuery(context.actionEvents ?? [])
          .filter('farm.animalBred')
          .filter((e) => e.actorPlayerId === undefined || e.actorPlayerId === context.player.id)
          .reduce<Partial<Record<AnimalKey, number>>>((total, e) => {
            for (const animal of ['sheep', 'boar', 'cattle'] as const)
              total[animal] = (total[animal] ?? 0) + (e.animals[animal] ?? 0)
            return total
          }, {})
        let choices: Partial<Record<AnimalKey, number>>[] = [{}]
        for (const animal of ['sheep', 'boar', 'cattle'] as const)
          choices = choices.flatMap((choice) =>
            Array.from({ length: (born[animal] ?? 0) + 1 }, (_, count) => ({
              ...choice,
              [animal]: count,
            })),
          )
        choices = choices.filter((choice) => Object.values(choice).some((count) => count > 0))
        return choices.length
          ? {
              sourceCard: CARD_ID,
              flow: {
                type: 'xor',
                optional: true,
                children: choices.map((animals) => ({
                  type: 'leaf',
                  actionId: STORE,
                  sourceCard: CARD_ID,
                  params: { animals },
                  choiceLabelKey: 'actions.store-on-card.name',
                  choiceLabelParams: { resources: animals },
                })),
              },
            }
          : undefined
      },
    },
  ],
} satisfies CardImpl

export const CWM057_AnimalNursery = defineMinorCard({
  meta: {
    id: 'CWM057_AnimalNursery',
    name: "Animal Nursery",
    deck: 'CWM',
    number: 57,
    desc: ["You may immediately house newborn animals on this card. They count for breeding, scoring, and animal counts, but cannot be moved or used for any other purpose."],
    cost: {
      wood: 1,
    },
    vp: 0,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM057.png',
  },
  impl: cardImpl,
})

export const CWM057_AnimalNursery_impl = CWM057_AnimalNursery.impl
