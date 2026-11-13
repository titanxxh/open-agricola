const limit = (value: string | undefined, name: string, minimum: number, maximum: number): number => {
  if (value === undefined) return maximum
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`)
  }
  return parsed
}

export const readSessionCapacity = (env: NodeJS.ProcessEnv) => ({
  rooms: limit(env.APP_ROOM_CAPACITY, 'APP_ROOM_CAPACITY', 1, 30),
  customWorkers: limit(env.CUSTOM_SESSION_WORKER_CAPACITY, 'CUSTOM_SESSION_WORKER_CAPACITY', 0, 15),
})

export const sessionCapacity = Object.freeze(readSessionCapacity(process.env))
