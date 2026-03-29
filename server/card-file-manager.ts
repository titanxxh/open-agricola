/**
 * Manages custom card .ts files on disk.
 *
 * Custom cards are written to data/custom-cards/CUSTOM_CardName.ts.
 * They are loaded via dynamic import() at game-session creation time,
 * executing side effects (registerCardEffect/registerCardListener)
 * just like official cards.
 */

import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { CardBase } from '../shared/cards/types.ts'

const CUSTOM_CARD_DIR = process.env.CUSTOM_CARD_DIR ?? join(process.cwd(), 'data', 'custom-cards')

function ensureDir(): void {
  mkdirSync(CUSTOM_CARD_DIR, { recursive: true })
}

function cardFilePath(cardId: string): string {
  // Sanitize: only allow alphanumeric + underscore
  const safe = cardId.replace(/[^a-zA-Z0-9_]/g, '')
  return join(CUSTOM_CARD_DIR, `${safe}.ts`)
}

/**
 * Write a .ts file for a custom card. Creates the directory if needed.
 * Returns the absolute file path.
 */
export function writeCardFile(cardId: string, content: string): string {
  ensureDir()
  const filePath = cardFilePath(cardId)
  writeFileSync(filePath, content, 'utf-8')
  return filePath
}

/**
 * Delete a custom card's .ts file. No-op if file doesn't exist.
 */
export function deleteCardFile(cardId: string): void {
  const filePath = cardFilePath(cardId)
  if (existsSync(filePath)) {
    unlinkSync(filePath)
  }
}

/**
 * Check if a custom card .ts file exists.
 */
export function cardFileExists(cardId: string): boolean {
  return existsSync(cardFilePath(cardId))
}

/**
 * Load a custom card module via dynamic import.
 *
 * The import executes the module's side effects (registerCardEffect,
 * registerCardListener), then returns the exported card instance.
 *
 * Uses a cache-busting query param to ensure fresh imports after edits.
 */
export async function loadCardFile(cardId: string): Promise<CardBase | null> {
  const filePath = cardFilePath(cardId)
  if (!existsSync(filePath)) return null

  try {
    // Cache bust: append timestamp so re-import after edit picks up changes
    const absPath = resolve(filePath)
    const mod = await import(`${absPath}?t=${Date.now()}`)

    // The module should export the card as a named export matching the card ID
    const card = mod[cardId] ?? mod.default ?? null
    return card as CardBase | null
  } catch (err) {
    console.warn(`[card-file-manager] failed to load ${cardId}:`, err)
    return null
  }
}

/**
 * Get the absolute path to the custom cards directory.
 */
export function getCustomCardDir(): string {
  ensureDir()
  return CUSTOM_CARD_DIR
}
