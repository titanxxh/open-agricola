export interface Gate { state: 'pass' | 'fail' | 'unknown' | 'conflict'; reasons: string[]; evidence: unknown[] }
export interface ReviewStatus { pr: number; head: string; identity: Gate; codeReview: Gate; securityReview: Gate; physicalThumb: Gate; threads: Gate; summary?: string | null; thumbHeadBinding?: string }
export interface PullRequestIdentity { number: number; head: { sha: string; repo?: { full_name: string } }; state: string; draft: boolean; base: { ref: string; repo?: { full_name: string } }; merged?: boolean; merge_commit_sha?: string }
export function github(root: string, args: string[]): unknown
export function pullIdentity(input: { pull: PullRequestIdentity; pr: number; head: string; repository?: string; merged?: boolean }): Gate
export function deriveReview(input: { pr: PullRequestIdentity; expectedHead: string; expectedPr?: number; repository?: string; merged?: boolean; comments: Array<{ id: number; user: { login: string }; body: string; updated_at: string; html_url: string }>; reactions: Array<{ id: number; user: { login: string }; content: string; created_at: string; url?: string }>; threads: Array<{ id: string; isResolved: boolean }> }): ReviewStatus
export function inspectReviews(input: { root: string; repository?: string; pr: number; head: string; merged?: boolean }): ReviewStatus
export function inspectCi(input: { root: string; repository?: string; head: string; event: string; names: string[] }): Gate
export function inspectMergeProtection(input: { root: string; repository?: string; branch?: string }): Gate
