const GUEST_ID_PREFIX = 'guest:'

/** A Guest's person id; it is never numeric, so it cannot collide with a family token. */
export const guestWorkerId = (index: number): string => `${GUEST_ID_PREFIX}${index}`

export const isGuestWorkerId = (workerId: unknown): workerId is string =>
  typeof workerId === 'string' && workerId.startsWith(GUEST_ID_PREFIX)

/** The numeric part of a Guest id, or 0 for anything else. */
export const guestWorkerIndex = (workerId: string): number => {
  const index = isGuestWorkerId(workerId) ? Number(workerId.slice(GUEST_ID_PREFIX.length)) : Number.NaN
  return Number.isFinite(index) ? index : 0
}
