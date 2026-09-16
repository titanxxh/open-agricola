import { majorCardDefinitionsList } from './generated'

const majorMetadata = new Map(majorCardDefinitionsList.map(card => [card.id, card]))

export const getMajorCardMetadata = (id: string) => majorMetadata.get(id)
