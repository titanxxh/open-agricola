import type { WorkshopCardType } from './workshop'

/** Public source input, never a compiler artifact or author workspace. */
export type WorkshopPublicCardInput = {
  protocolVersion: 1
  source: {
    kind: 'workshop-public'
    authority: 'titanxxh/open-agricola'
    workshopCardId: string
    versionId: string
  }
  cardJson: Record<string, unknown>
  effectCode: string | null
  art: { sha256: string; contentType: string; sizeBytes: number; base64: string } | null
}

export type WorkshopPublicCardSnapshot = {
  /** SHA-256 of canonicalJson(input), including the exact image byte identity. */
  sha256: string
  input: WorkshopPublicCardInput
}

/** Discovery does not grant permission to create or continue execution. */
export type WorkshopPublicCardCatalogEntry = {
  source: WorkshopPublicCardInput['source']
  cardId: string
  name: string
  cardType: WorkshopCardType
}

export type WorkshopPublicCardCatalog = {
  protocolVersion: 1
  cards: WorkshopPublicCardCatalogEntry[]
  nextCursor: string | null
}

/** checkedAt is the source read start; consumers never restart this deadline. */
export type WorkshopPublicCardStatus = {
  protocolVersion: 1
  sha256: string
  checkedAt: number
  validUntil: number
  access:
    | { kind: 'current'; allowNew: true; allowExisting: true }
    | { kind: 'offline' | 'superseded'; allowNew: false; allowExisting: true }
    | { kind: 'disabled' | 'not_public' | 'content_mismatch'; allowNew: false; allowExisting: false }
}
