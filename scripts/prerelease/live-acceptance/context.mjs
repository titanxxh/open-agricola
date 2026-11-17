// Owner-only live acceptance inputs. Every private file must be a regular, owner-only file and is never logged.
import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sha = /^[a-f0-9]{40}$/

/** Accepts only regular, non-symlinked files owned by the caller without group/other access. */
export function privatePath(path, label) {
  if (typeof path !== 'string' || !path) throw new Error(`${label} path is required`)
  const full = resolve(path), info = lstatSync(full)
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) throw new Error(`${label} must be an owner-private regular file`)
  return full
}

export function privateDirectory(path, label) {
  const full = resolve(path), info = lstatSync(full)
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) throw new Error(`${label} must be an owner-private directory`)
  return full
}

export function privateJson(path, label) {
  const full = privatePath(path, label)
  try { return JSON.parse(readFileSync(full, 'utf8')) } catch { throw new Error(`${label} is not valid JSON; contents are not logged`) }
}

/** Accounts carry `label` (A–E) so reports never need identifiers or usernames. */
export function loadAccounts(path, labels) {
  const value = privateJson(path, 'Acceptance accounts')
  const accounts = Array.isArray(value?.accounts) ? value.accounts : null
  if (!accounts || accounts.length !== labels.length) throw new Error(`Acceptance accounts must list exactly ${labels.length} accounts`)
  return accounts.map((account, index) => {
    for (const key of ['id', 'username', 'password']) if (typeof account?.[key] !== 'string' || !account[key]) throw new Error('Acceptance account is incomplete')
    return { id: account.id, username: account.username, password: account.password, label: labels[index] }
  })
}

/** Engines that may run concurrently; each then needs its own A–C accounts so a revocation cannot reach another. */
export const PARALLEL_ENGINES = ['chromium', 'firefox', 'webkit']

/**
 * Private config: { format: 1, targetConfig, ssh, candidate, candidateReceipt, formalBuild, accounts, teamAccounts?,
 *   engineAccounts?: { firefox?, webkit? }, ownerCookie, guardConfig, outputRoot }. `guardConfig` is the storage guard
 *   config path on the host. `accounts` (A–C) serve chromium and every engine without its own `engineAccounts` file.
 */
export function loadAcceptanceConfig(path) {
  const config = privateJson(path, 'Acceptance config')
  if (config?.format !== 1) throw new Error('Acceptance config format 1 is required')
  for (const key of ['targetConfig', 'ssh', 'candidate', 'candidateReceipt', 'formalBuild', 'accounts', 'ownerCookie', 'guardConfig', 'outputRoot']) {
    if (typeof config[key] !== 'string' || !config[key]) throw new Error(`Acceptance config needs ${key}`)
  }
  if (!sha.test(config.candidate) || !sha.test(config.formalBuild)) throw new Error('Candidate and formal build must be full SHAs')
  if (!/^[A-Za-z0-9._@-]+$/.test(config.ssh)) throw new Error('Invalid SSH destination')
  if (!/^\/[A-Za-z0-9._/-]+$/.test(config.guardConfig)) throw new Error('Invalid host guard config path')
  const target = privateJson(config.targetConfig, 'Target config')
  const receipt = privateJson(config.candidateReceipt, 'Candidate image receipt')
  if (receipt.purpose !== 'candidate' || receipt.channel !== 'prerelease' || receipt.sourceSha !== config.candidate || !sha.test(receipt.producerSha ?? '')) {
    throw new Error('Candidate image receipt does not match the configured candidate')
  }
  const accounts = loadAccounts(config.accounts, ['A', 'B', 'C'])
  const team = config.teamAccounts ? loadAccounts(config.teamAccounts, ['D', 'E']) : []
  const engineAccounts = { chromium: accounts }
  if (config.engineAccounts !== undefined) {
    if (!config.engineAccounts || typeof config.engineAccounts !== 'object' || Array.isArray(config.engineAccounts)) throw new Error('engineAccounts must map engines to account files')
    for (const [engine, file] of Object.entries(config.engineAccounts)) {
      if (!PARALLEL_ENGINES.includes(engine) || engine === 'chromium') throw new Error(`engineAccounts names an unsupported engine ${engine}; chromium uses accounts`)
      if (privatePath(file, `${engine} accounts`) === privatePath(config.accounts, 'Acceptance accounts')) throw new Error(`${engine} accounts must differ from the chromium accounts`)
      engineAccounts[engine] = loadAccounts(file, ['A', 'B', 'C'])
    }
    const ids = Object.values(engineAccounts).flat().map(account => account.id)
    if (new Set(ids).size !== ids.length) throw new Error('Each engine needs distinct accounts')
  }
  privatePath(config.ownerCookie, 'Formal owner cookie')
  return {
    path: resolve(path), config, target, producer: receipt.producerSha, accounts, team, engineAccounts,
    /** Every configured account, for leak checks and full logout. */
    allAccounts: [...Object.values(engineAccounts).flat(), ...team],
    origins: { pre: new URL(target.origin).origin, formalApp: new URL(target.formal.appOrigin).origin, formalApi: new URL(target.formal.apiOrigin).origin },
    outputRoot: privateDirectory(config.outputRoot, 'Acceptance output root'),
  }
}

/**
 * Engines of one suite run concurrently only when each has its own accounts: revocation logs every session of its A
 * out and revokes A's Beta, so a shared A would break the other engines' cases.
 */
export const runsInParallel = (ctx, engines) => engines.length > 1 && engines.every(engine => ctx.engineAccounts[engine])

/** Replaces every account value in free text, plus single-use URL secrets. */
export function scrub(accounts, text) {
  return accounts.reduce((value, account) => [account.username, account.password, account.id].reduce((t, v) => t.replaceAll(v, `<${account.label}>`), value), String(text))
    .replace(/([?&#](code|state|browserChallenge|token)=)[^&\s]+/g, '$1<redacted>')
}

/** Throws when serialized evidence would carry any account identifier, username or password. */
export function assertNoAccountValues(accounts, text, label) {
  for (const account of accounts) for (const value of [account.id, account.username, account.password]) {
    if (text.includes(value)) throw new Error(`${label} would leak an acceptance account value`)
  }
}
