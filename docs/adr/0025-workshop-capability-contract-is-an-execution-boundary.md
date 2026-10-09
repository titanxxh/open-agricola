# Workshop capabilities are a shared generation and execution boundary

- Status: Accepted
- Date: 2026-10-08

Workshop will expand the card mechanisms that can be represented safely across its isolated execution boundary. Its deployed Capability Contract will describe the same supported surface enforced by source validation and execution. It is not the complete native CardEffect interface or a prompt-only recommendation. GitHub references remain pinned per generation attempt and may describe capabilities absent from the deployment.

This decision replaces the current split in which a documented list can be narrower than executable custom-card output. Supported declarations must survive manifest extraction and registration; unsupported declarations must produce an explicit error rather than silently losing their meaning. Custom-card output must not escape the capability boundary through an omitted listener filter, a nested flow, an undocumented action or an unrestricted special-effect variant. Trusted engine-generated work still uses the authoritative engine's own contracts.

Native functions that mutate their input or return callbacks must not be copied directly into the isolate contract. Corresponding game mechanisms may be supported through serializable queries or declarative contributions and named authoritative settlement operations. Whole-state replacement, arbitrary executable callbacks and card-specific branches in shared rule paths remain outside this design. Each deferred or excluded mechanism must have a concrete reason in the existing sandbox documentation.

The alternative was to constrain only model output while allowing handwritten cards to use a broader implicit engine surface. That would leave examples, accepted source and actual execution with different meanings. Capability admission checks enforce permission and data shape; game behavior is verified by fixed scenarios using the existing behavior and Session test infrastructure, without a separate behavior judge.

The user confirmed expansion of suitable real capabilities and one shared generation/validation/execution scope. The first implementation slice reuses reliable existing engine settlement; mechanisms needing new generic settlement are deferred with explicit reasons. The concrete admission list and fixed acceptance scenarios are recorded in `docs/CUSTOM_CARD_SANDBOX.md` section 9.4 with design confirmation before implementation. The first slice is implemented by shared admission definitions and both execution adapters; fixed Session and executor cases validate it. Deferred settlement mechanisms remain explicitly outside the deployed contract.
