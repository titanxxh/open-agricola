/** Presentation identity is outside rule values and raw Replay Frames. */
export type HistoryRecordIdentity = {
  recordId: string
  operationGroupId: string
  participantRoles: Record<string, string>
}

const identities = new WeakMap<object, HistoryRecordIdentity>()
const roles = new WeakMap<object, Record<string, string>>()
export const getHistoryRecordIdentity = (value: object): HistoryRecordIdentity | undefined => identities.get(value)
export const registerHistoryRecordIdentity = (value: object, identity: HistoryRecordIdentity): void => { identities.set(value, identity) }
export const inheritHistoryRecordIdentity = <T extends object>(source: object, target: T): T => {
  const identity = getHistoryRecordIdentity(source)
  if (identity) registerHistoryRecordIdentity(target, identity)
  return target
}
export const getHistoryParticipantRoles = (value: object): Record<string, string> | undefined => roles.get(value)
export const registerHistoryParticipantRoles = (value: object, participantRoles: Record<string, string>): void => { roles.set(value, participantRoles) }
