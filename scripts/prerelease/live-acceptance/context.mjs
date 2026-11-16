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

/**
 * Private config: { format: 1, targetConfig, ssh, candidate, candidateReceipt, formalBuild, accounts, teamAccounts?,
 *   ownerCookie, guardConfig, outputRoot }. `guardConfig` is the storage guard config path on the host.
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
  privatePath(config.ownerCookie, 'Formal owner cookie')
  return {
    path: resolve(path), config, target, producer: receipt.producerSha, accounts, team,
    origins: { pre: new URL(target.origin).origin, formalApp: new URL(target.formal.appOrigin).origin, formalApi: new URL(target.formal.apiOrigin).origin },
    outputRoot: privateDirectory(config.outputRoot, 'Acceptance output root'),
  }
}

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
