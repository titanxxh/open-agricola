# Workshop Capability Contract is fail-closed and opened by fixed tests

- Status: Accepted
- Date: 2026-10-10

The Workshop Capability Contract is the one scope shared by model generation, source admission and execution. We reach that alignment by narrowing execution to the contract. Custom declarations and runtime return values that leave the contract, as scoped below, are rejected explicitly before they reach authoritative settlement, and native rule paths are not changed to make a custom capability safe. Before this decision the action allowlist only fed the prompt and its sync check, so a custom flow could dispatch an unlisted native action.

A name belongs to the contract only while at least one fixed behavior test drives it through a two-player GameSession on unmodified native paths. Names in the previously documented list are candidates: each one gets such a test or is removed. New capabilities open in demand-driven slices, each with its own issue and fixed test. Anything not listed is not open. Candidate capabilities are tracked in a GitHub issue; the sandbox reference does not enumerate unopened native interfaces with reasons.

## Scope of admission

Admission checks these things and nothing else:

- the listed names: effect hooks, listener actions, phases and scopes, leaf actions, and `special-effect` kinds;
- the listener and flow-node fields a card may set, and that each listener and returned node belongs to the card itself;
- the parameter keys each action documents;
- the field types of the card-local `special-effect` writes;
- the top-level type of a query hook result.

Admission does not check parameter values, cost structures, schedules, or the contents of a query result. Their native consumers validate them, as they do for native cards. Mirroring those rules on the host is the approach this decision rejects, so a review finding of that kind is answered by pointing here, not by adding another validator.

Admission serves honest authors and model mistakes. It must produce a clear error; it does not bound adversarial workloads beyond the isolate's existing time and memory limits. A hook failure or an out-of-contract result keeps the existing behavior: the first occurrence rejects and rolls back the command with the error, and a repeated identical failure skips that card's effect so a game containing a faulty card can continue. This is deliberate.

## Considered options

PR #1053 expanded the contract to every native mechanism that could be serialized across the isolation boundary (45 hooks, 31 listener identities, 25 leaf actions) and audited the whole surface at once. That needed a hand-written host-side mirror of native data semantics and changes to about 50 engine, payment and effect source files outside the sandbox modules. Ten review rounds produced 70 threads, with 11 new ones in the last round, each an admitted value whose native meaning differed from its declaration. A complete audit of that surface has no finite completion condition, so the PR was closed unmerged.

Constraining only the prompt while execution stays wider was also rejected: accepted source and executed behavior would then differ.

## Consequences

More requests receive an explicit capability-gap answer. We prefer that to a card that is admitted and behaves incorrectly. Possible native defects noticed during the expansion are fixed separately, and only with a failing test that uses an official card.
