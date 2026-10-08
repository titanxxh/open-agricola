import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { AcceptanceBudget, type BudgetState } from './budget'
import type { GenerationUsage } from '../../../shared/contract/workshop-generation'

/** One owner process holds the cross-worktree ledger. Persist reservations
 * before the browser is allowed to issue a POST, including after crashes. */
export class BudgetFile {
  readonly ledger: AcceptanceBudget
  private readonly path: string
  private readonly lock: number
  private closed = false
  constructor(path: string) {
    this.path = path
    mkdirSync(dirname(path), { recursive: true })
    try { this.lock = openSync(`${path}.lock`, 'wx', 0o600) } catch { throw new Error(`Acceptance budget is locked: ${path}.lock. Check its owner PID before recovering a crashed run.`) }
    writeFileSync(this.lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }))
    try {
      this.ledger = new AcceptanceBudget(existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as BudgetState : undefined)
      this.persist()
    } catch (error) { closeSync(this.lock); unlinkSync(`${path}.lock`); throw error }
  }
  private persist(): void {
    const temporary = `${this.path}.${process.pid}.tmp`
    const file = openSync(temporary, 'w', 0o600)
    try { writeFileSync(file, JSON.stringify(this.ledger.state, null, 2) + '\n'); fsyncSync(file) } finally { closeSync(file) }
    renameSync(temporary, this.path)
  }
  reserve(inputBytes: number, maxOutputTokens: number, task: string, sequence: number): string {
    if (this.closed) throw new Error('The budget is closed')
    const row = this.ledger.reserveRequest(inputBytes, maxOutputTokens, task, sequence)
    this.persist()
    return row.id
  }
  settle(id: string, usage: GenerationUsage, notPosted: boolean): void {
    if (this.closed) throw new Error('The budget is closed')
    // If a provider ever exceeds its reservation, keep the reported amount
    // before throwing; the next run must not lose the overage.
    try { this.ledger.settle(id, usage, notPosted) } finally { this.persist() }
  }
  close(): void {
    if (this.closed) return
    this.closed = true
    closeSync(this.lock)
    unlinkSync(`${this.path}.lock`)
  }
}
