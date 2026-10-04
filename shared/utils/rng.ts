import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

import type { GameSeed } from '../contract/types'

export type { GameSeed }

const WIDE_SEED_BYTES = 16

/** A fresh wide seed. Used whenever no Explicit Seed is given. */
export const createSeed = (): string =>
  bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(WIDE_SEED_BYTES)))

/** Keeps a finite Explicit Seed or a non-empty wide seed; otherwise draws a wide seed. */
export const resolveSeed = (seed: GameSeed | null | undefined): GameSeed => {
  if (typeof seed === 'number' && Number.isFinite(seed)) return Math.floor(seed)
  if (typeof seed === 'string' && seed.length > 0) return seed
  return createSeed()
}

/** The Explicit Seed generator. Its output for a given number must never change. */
export const createRng = (seed: number) => {
  let value = seed
  return () => {
    value += 0x6d2b79f5
    let result = Math.imul(value ^ (value >>> 15), value | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

const BYTES_PER_DRAW = 8

/**
 * HMAC-SHA256 in counter mode, keyed by the wide seed. Each label is an
 * independent stream, and every draw is a 53-bit fraction in [0, 1).
 */
const createWideRng = (seed: string, label: string) => {
  const key = utf8ToBytes(seed)
  const prefix = utf8ToBytes(`${label}\u0000`)
  const message = new Uint8Array(prefix.length + 4)
  message.set(prefix)
  const counterView = new DataView(message.buffer, prefix.length)
  let counter = 0
  let block = new Uint8Array(0)
  let offset = 0
  return () => {
    if (offset + BYTES_PER_DRAW > block.length) {
      counterView.setUint32(0, counter)
      counter += 1
      block = hmac(sha256, key, message)
      offset = 0
    }
    const view = new DataView(block.buffer, block.byteOffset + offset, BYTES_PER_DRAW)
    offset += BYTES_PER_DRAW
    const high = view.getUint32(0) >>> 5
    const low = view.getUint32(4) >>> 6
    return (high * 67108864 + low) / 9007199254740992
  }
}

/**
 * The random stream for one use of a seed. A wide seed is separated by `label`.
 * An Explicit Seed ignores the label and goes through `explicitSeed`, which
 * reproduces the arithmetic each call site used before wide seeds existed.
 */
export const createSeededRng = (
  seed: GameSeed,
  label: string,
  explicitSeed: (seed: number) => number = (value) => value,
) =>
  typeof seed === 'number'
    ? createRng(explicitSeed(seed))
    : createWideRng(seed, label)

export const shuffleWithRng = (values: string[], rng: () => number) => {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    const temp = result[index]
    result[index] = result[swapIndex]
    result[swapIndex] = temp
  }
  return result
}
