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
