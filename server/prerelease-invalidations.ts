export type InvalidationSubject = { userId: string; grantId?: string; tokenHash?: string }
type Scope = { kind: 'user' | 'grant' | 'token'; id: string }

/** Older checkpoints fail closed once their scoped history is no longer retained. */
export class PrereleaseInvalidations {
  private sequence = 0
  private floor = 0
  private readonly latest = new Map<string, number>()

  private readonly capacity: number

  constructor(capacity = 4096) { this.capacity = capacity }

  checkpoint(): number { return this.sequence }

  record(scope: Scope): void {
    const key = `${scope.kind}:${scope.id}`
    this.latest.delete(key)
    this.latest.set(key, ++this.sequence)
    if (this.latest.size > this.capacity) {
      const oldest = this.latest.entries().next().value
      if (oldest) { this.latest.delete(oldest[0]); this.floor = oldest[1] }
    }
  }

  changedSince(checkpoint: number, subject: InvalidationSubject): boolean {
    return checkpoint < this.floor
      || (this.latest.get(`user:${subject.userId}`) ?? 0) > checkpoint
      || subject.grantId !== undefined && (this.latest.get(`grant:${subject.grantId}`) ?? 0) > checkpoint
      || subject.tokenHash !== undefined && (this.latest.get(`token:${subject.tokenHash}`) ?? 0) > checkpoint
  }
}
