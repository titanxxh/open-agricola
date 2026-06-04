import { getCustomMinorImprovement, getCustomOccupation } from './custom-registry'
import type { CardDefinition } from '../contract/cards'
import { majorCardDefinitionsList } from './major/generated'
import {
  minorImprovementCardsList,
  occupationCardsList,
} from './catalog.generated'

const isCommunityCard = (card: CardDefinition) => card.deck === 'community'
const isImplemented = (card: CardDefinition) => card.implemented !== false

export const minorImprovementCards = minorImprovementCardsList.filter((card) => !isCommunityCard(card))
export const occupationCards = occupationCardsList.filter((card) => !isCommunityCard(card))

const communityMinors = minorImprovementCardsList.filter(isCommunityCard)
const communityOccupations = occupationCardsList.filter(isCommunityCard)

export const allMinorImprovementCards = [...minorImprovementCards, ...communityMinors]
export const allOccupationCards = [...occupationCards, ...communityOccupations]

export const implementedMinorImprovementCards = minorImprovementCards.filter(isImplemented)
export const implementedOccupationCards = occupationCards.filter(isImplemented)
export const implementedCommunityMinors = communityMinors.filter(isImplemented)
export const implementedCommunityOccupations = communityOccupations.filter(isImplemented)

export const minorImprovementIds = implementedMinorImprovementCards.map((card) => card.id)
export const occupationIds = implementedOccupationCards.map((card) => card.id)

export const getMinorImprovementCard = (id: string) => {
  return allMinorImprovementCards.find((card) => card.id === id)
    ?? getCustomMinorImprovement(id)
}

export const getOccupationCard = (id: string) => {
  return allOccupationCards.find((card) => card.id === id)
    ?? getCustomOccupation(id)
}

export const getCardDefinition = (id: string): CardDefinition | undefined => {
  return (
    getMinorImprovementCard(id)
    ?? getOccupationCard(id)
    ?? majorCardDefinitionsList.find((c) => c.id === id)
  )
}

export const isFieldCard = (id: string): boolean => {
  return getCardDefinition(id)?.isField === true
}
