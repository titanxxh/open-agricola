# 37. Scope routine verification and gate releases

- Status: Implemented
- Date: 2026-10-30

Routine changes use verification selected for their affected scope. Changes to shared mechanisms require the complete affected subsystem's tests before integration. When the impact cannot be bounded, verification expands to the whole repository. This replaces the requirement to run every test for every routine change.

The initial selection unit is a complete test file or a business test group. Cards have explicit test associations. UI changes select the relevant module's tests, and shared mechanisms select complete affected groups. Each pull request exposes the selected scope and the reasons for that selection. Unknown ownership expands verification.

Full verification is required for a release candidate. The standard release and frontend and backend deployment entry points must check successful full-verification evidence for the exact candidate commit before publication or deployment. Establish this machine gate before reducing the current routine checks.

The implementation adds a formal-candidate eligibility policy on 2026-10-31. The candidate must equal a freshly confirmed merged PR's final integration SHA on the requested repository's protected `main`, and be reachable from its explicitly resolved `refs/heads/main` commit. An associated intermediate ancestor, an open test merge, or an unmerged producer is ineligible. The complete admitted tree supplies the approved verification implementation; its configuration hash is only a compatibility key. An eligible older final snapshot remains usable after main or its producer implementation advances. The existing owner-selected repository option also applies this policy to forks.

Admission checks native repository/base/run/head repository IDs and active PR, linear-history, force-update, and deletion protections before dispatch or protected publication/deployment work. This boundary trusts current native integration governance, including authorized owner, administrator, and configured override authority. It does not prove historical protections or review diligence, and does not require privileged bypass metadata. Ordinary reusable PR verification remains available before formal eligibility.

The standard release command runs on an owner-controlled machine. It fixes the candidate commit, requests or reuses full GitHub Actions verification, and checks the results before creating the Release for that commit. The Pages workflow and backend deployment script each check the candidate's evidence independently before deployment. These checks also cover manual Pages workflow runs and direct use of the backend script. Backend deployment still runs from the owner's machine.

A Release created directly through GitHub's website or a bare CLI command can exist before verification. The deployment gates prevent that Release from deploying an unverified candidate through repository-supported entry points. The pre-publication guarantee applies to the standard release command.

GitHub Actions results are the authoritative evidence for integration and release. Local runs provide focused development feedback and browser reproduction. Running the same verification locally is not a prerequisite for its CI execution.

Full verification covers the union of the former CI, CI Full, and E2E checks: fast and slow tests, Workshop behavior regressions, architecture checks, lint, i18n, type checks, application and Replay Viewer builds, bundle budgets, community-deck checks, the Chromium suite, the browser-local sandbox, and the WebKit smoke tests. The legacy fixed LLM harness was retired on main before implementation of this policy. Its replacement Workshop behavior tests remain part of the current test projects. Paid model acceptance and performance benchmarks remain separate checks selected for the change.

Successful results may be combined across compatible runs for the same candidate commit and verification configuration. Retry failed tasks without repeating other successful tasks. Every required task must actually succeed. Missing, failed, cancelled, or skipped required tasks do not establish a successful release result.

Do not add scheduled full-verification runs. This saves routine execution at the cost of later discovery: a regression outside the selected scope may remain undetected until release-candidate verification. Shared-mechanism changes and unknown impact still require the broader checks described above.

The scope planner, always-running `verify` gate, canonical candidate catalog, and release/deployment gates implement this policy. The former automatic CI Full, E2E, and duplicate scope-preview workflows are retired. Commands and evidence requirements are in [CI checks operations](../operations/ci-checks.md).

## Precision refinement, 2026-10-31

Status: accepted on 2026-10-31, including the user's extension to shared rule subsystems. The following records the investigation and implementation contract; remote latency targets require measurement after delivery.

### Observed problem

The review used main `92efb51e2259caa44683fbbda072f40b2bab8668` and the retained plans and jobs for PRs #1534, #1540, #1541 and #1537. All four final PR plans selected the complete ten-task catalog. The final successful runs for #1540, #1541 and #1537 took 16m19s, 16m42s and 17m14s respectively. These are different changes, not a controlled performance comparison.

The previous planner classified changed browser tests but had no browser selection branch, so they requested full verification. It treated every expansion reason as a repository-wide requirement. Global path rules also captured all scripts, test helpers and fixtures before business ownership could apply. The frontend declaration omitted the game container, header and end-game controls. Architecture documentation, including Chinese mirrors that the Workshop reference reader rejects, selected the complete Workshop/rule group. These paths combined during ordinary code, test and documentation updates.

In [PR #1540's final run](https://github.com/titanxxh/open-agricola/actions/runs/41169565026), the longest browser job took 906 seconds. Browser execution accounted for about 738 seconds, while dependency installation took eight seconds. Reducing unrelated test selection is the first performance question. Dependency caching alone cannot meet a five-minute routine-run target.

### Accepted selection principles

- Keep complete test files and complete affected business groups as the selection units. A business group declares production ownership, its behavior tests and its browser consumers. Mixed changes take the union.
- Distinguish bounded expansion to a complete business group or layer from uncertainty requiring the complete repository. Report both with affected paths and reasons.
- Select a changed browser spec in full for Chromium and retain its complete existing WebKit eligibility group (`@webkit`). Static engine eligibility is a declared business group; selection does not infer individual cases from changed lines. A shared browser fixture selects all established consumers. Incomplete consumer evidence widens to the complete browser layer; unresolved cross-layer impact still requires full verification.
- A new test in an established business group joins that group automatically. A new production Card Source retains the conservative availability and registration checks; adding a regression test for an existing card is a separate case.
- Ordinary documentation and Chinese mirrors select document constraints. Runtime-readable English documentation additionally selects its reference and behavior contracts. Its owning business scope must be explicit.
- Independently audit business ownership and consumer declarations. The existing test-project inventory and execution digest prove different properties and cannot establish selection sufficiency.
- Unknown ownership continues to request broader verification. A declared consumer that has disappeared is a plan error requiring its declaration to be updated; running a larger suite cannot execute a missing test.
- Retain complete-branch and merge-checkout changes, rename and deletion handling, exact source identity, selected-check completeness, and dedicated full candidate receipts. Cross-commit result reuse and per-test-case selection are outside this proposed first step.

### Required acceptance evidence

| Replay or counterexample | Required observation |
|---|---|
| #1540 frontend controls, documentation and browser changes | All changed tests and header, handoff, game-end, authentication and WS consumers remain selected; each additional subsystem has a concrete dependency reason. |
| #1537 monitoring and persistence changes | Monitoring, opening facts, database and recovery consumers remain selected, including `operations-openings.test.ts` and `operations-dashboard.spec.ts`. |
| #1534 payment and preparation changes; #1541 shared listener changes | Preserve complete affected rule and cross-card consumers. A genuine global dependency may still select full verification. |
| New test under a known business directory | The discovered test is automatically selected. |
| Changed shared helper; incomplete or dynamic consumer evidence | All established consumers remain selected; the uncertainty explicitly widens verification. |
| Missing declared consumer, source root or unparsable source | Planning fails instead of reporting successful selection. |
| Intentionally failing selected test or missing selected partition | The required `verify` result fails. |
| Lockfile, test discovery, scope planner or repository-wide configuration change | Full verification remains selected. |

Historical failures are retained when their dependency is within the affected scope. An unrelated historical flaky failure is not a requirement to run its entire subsystem on every PR. Full release-candidate verification retains the broader regression check accepted above.

### Accepted interview decisions

1. Target routine required-CI latency: a five-minute budget for ordinary frontend or single-card changes and eight minutes for bounded cross-module changes. Include setup and execution; exclude GitHub queueing and human retry delays. These are design targets requiring measurement, not demonstrated guarantees. Genuine full-verification changes may take longer.
2. Accept bounded expansion for browser tests, helpers, fixtures and documentation, with full verification reserved for global or unresolved impact.
3. Use complete business groups with directory ownership and independent coverage checks rather than source-file whitelists alone.

The user's answer, "OK", accepted decisions 1–3. A new module with unknown ownership retains full-verification fallback; a missing declared test or consumer fails planning. Existing release-candidate and deployment evidence requirements remain in force.

### Accepted implementation boundary

The implementation fixes selection for frontend controls, documentation, changed browser specs, local helpers and fixtures, new regression tests for existing cards, and monitoring ownership. It introduces independent consumer coverage checks and the distinction between bounded expansion and full verification.

The user additionally requested shared rule subsystems in this iteration. Payment, animals, scoring, farm/crop operations, and round/variant rules have explicit, overlapping ownership. A mechanism change selects its complete direct and cross-card behavior consumers, plus public rule safety consumers whose mechanism cannot be narrowed. Hook, action, helper and Card Source associations bridge production ownership to tests; shared test setup does not by itself make every Session test a consumer of every mechanism. Unknown rule seams retain the complete rule group. Protocol changes retain complete producer and consumer groups; repository-wide configuration and unresolved cross-layer impact retain full verification.

Measure selected test counts, setup and execution time, and the critical path for the accepted ordinary-change budgets. Historical PR replays must preserve required consumers and explain remaining broad selections; a genuine global change does not have to become narrow to pass acceptance. Share preparation once within a job where its environment is unchanged, while preserving writable-environment isolation between browser workers.

PR #1540 changes a widely shared browser fixture, so its complete diff may still select most or all browser tests. Its selection must retain the login and dual-player WS regressions without selecting all slow card tests solely because of frontend documentation. Validate the ordinary frontend budget separately with an explicitly identified narrow menu-change probe. Do not present that probe as the complete historical PR. Compare actual selected files, tasks and executed tests; `mode: scoped` alone is insufficient evidence of improvement.

The implementation PR itself changes the scope planner and therefore requires full verification. Likewise, historical #1534 changes verification tools, #1537 changes application startup and deployment inputs, and #1533 changes the package configuration; their complete diffs may legitimately retain full verification under the accepted global-input rules.

Cross-commit result reuse, selection of individual test cases, a new test runner, and broad test rewrites are outside this first implementation. Duration-based partition balancing can follow measurements if selection alone misses the ordinary-change budgets.

The user's request to include shared rule subsystems completes the implementation-boundary decision. Local validation must report actual selected files and execution evidence. It cannot establish the five/eight-minute hosted-CI targets without successful remote runs.
