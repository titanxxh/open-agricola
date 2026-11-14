import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { canonicalJson } from './authoritative-command'
import type { WorkshopPublicCardInput, WorkshopPublicCardSnapshot, WorkshopPublicCardStatus } from './workshop-public-cards'

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const object = (value: unknown): Record<string, unknown> => {
  if (!isObject(value)) throw new Error('Invalid public card input')
  return value
}
const hash = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid public input hash')
  return value
}
export function publicCardId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error('Invalid public card identity')
  return value
}

export function parsePublicCardSnapshot(value: unknown, cardId: string): WorkshopPublicCardSnapshot {
  const packet = object(value), input = object(packet.input), source = object(input.source), cardJson = object(input.cardJson)
  if (input.protocolVersion !== 1 || source.kind !== 'workshop-public' || source.authority !== 'titanxxh/open-agricola'
    || publicCardId(source.workshopCardId) !== cardId || typeof input.effectCode !== 'string' && input.effectCode !== null
    || typeof input.effectCode === 'string' && input.effectCode.length > 1_048_576
    || Object.keys(cardJson).some(key => key.startsWith('_'))) throw new Error('Invalid fixed public input')
  let art: WorkshopPublicCardInput['art'] = null
  if (input.art !== null) {
    const image = object(input.art)
    if (typeof image.base64 !== 'string' || image.base64.length > 2_796_204
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.base64)
      || typeof image.sizeBytes !== 'number' || !Number.isSafeInteger(image.sizeBytes) || image.sizeBytes < 1 || image.sizeBytes > 2_097_152
      || typeof image.contentType !== 'string' || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(image.contentType)) throw new Error('Invalid public image')
    const bytes = Uint8Array.from(atob(image.base64), char => char.charCodeAt(0))
    if (bytes.length !== image.sizeBytes || bytesToHex(sha256(bytes)) !== hash(image.sha256)) throw new Error('Public image checksum mismatch')
    art = { sha256: hash(image.sha256), contentType: image.contentType, sizeBytes: image.sizeBytes, base64: image.base64 }
  }
  const parsed: WorkshopPublicCardInput = { protocolVersion: 1,
    source: { kind: 'workshop-public', authority: 'titanxxh/open-agricola', workshopCardId: cardId, versionId: publicCardId(source.versionId) },
    cardJson, effectCode: input.effectCode, art }
  const identity = hash(packet.sha256)
  if (bytesToHex(sha256(utf8ToBytes(canonicalJson(parsed)))) !== identity) throw new Error('Public input checksum mismatch')
  return { sha256: identity, input: parsed }
}

export function parsePublicCardStatus(value: unknown, expectedHash: string): WorkshopPublicCardStatus {
  const packet = object(value), access = object(packet.access)
  if (packet.protocolVersion !== 1 || hash(packet.sha256) !== expectedHash
    || typeof packet.checkedAt !== 'number' || !Number.isSafeInteger(packet.checkedAt) || packet.checkedAt < 0
    || typeof packet.validUntil !== 'number' || !Number.isSafeInteger(packet.validUntil)
    || packet.validUntil <= packet.checkedAt || packet.validUntil > packet.checkedAt + 30_000) throw new Error('Invalid public source deadline')
  let parsed: WorkshopPublicCardStatus['access']
  if (access.kind === 'current' && access.allowNew === true && access.allowExisting === true) parsed = { kind: 'current', allowNew: true, allowExisting: true }
  else if ((access.kind === 'offline' || access.kind === 'superseded') && access.allowNew === false && access.allowExisting === true) parsed = { kind: access.kind, allowNew: false, allowExisting: true }
  else if ((access.kind === 'disabled' || access.kind === 'not_public' || access.kind === 'content_mismatch') && access.allowNew === false && access.allowExisting === false) parsed = { kind: access.kind, allowNew: false, allowExisting: false }
  else throw new Error('Invalid public source permission')
  return { protocolVersion: 1, sha256: expectedHash, checkedAt: packet.checkedAt, validUntil: packet.validUntil, access: parsed }
}
