# 51. Deploy the prerelease application from source

- Status: Accepted
- Date: 2026-11-19

The prerelease application image currently packages the runtime, game source, dependencies, hosted frontend and Replay Viewer together. Updating a single card requires a new image build, transfer and import.

The owner will use one update command. It resolves the selected prerelease revision to a fixed Git commit and prepares that revision in a separate directory on the backend host while the installed application serves players. The revision declares its runtime image by digest. The command reuses that image when available and obtains it before cutover when missing. GitHub builds new runtime images when the runtime changes. A pinned runtime update can also deliver a security fix between application changes.

Dependencies belong to the prepared revision. A lockfile change installs its locked dependencies for the target architecture and Node ABI. Preparation checks native modules and builds the hosted frontend, language packs and Replay Viewer for the selected application. Archive tooling has a separate image lifecycle.

For routine prerelease updates, the owner command uses passing affected checks for the exact application commit and runs missing checks before cutover. A card or UI update can proceed without a full candidate run or a GitHub prerelease. Changes to identity, access, retained storage, deployment tooling or the runtime image require checks covering the changed boundary.

Downloads, dependency installation, builds and a trial startup with isolated data run while the installed application serves players. At cutover the operator command closes admission, drains acknowledged writes, stops the old process, applies required migrations and starts the prepared application. Before reopening, it reads the frontend and API build identities through the real entry and checks that a Beta acceptance account can reconnect over WebSocket and read its existing acceptance game. The command records the observed interruption.

The installation records both the application commit and runtime digest. If startup fails before reopening and the retained data is compatible with the previous application, the command restores that application's prepared dependencies and matching runtime. After an incompatible migration it keeps maintenance active and identifies the recovery point.

A stable deployment can advance independently. The prerelease gateway keeps admission open across formal commits when the live formal identity/access fingerprint matches the one accepted for the current prerelease generation. A changed contract requires renewed acceptance. Missing fingerprints use the previously accepted exact formal SHA. Revocation, account deletion and the formal capability expiry continue to apply.
