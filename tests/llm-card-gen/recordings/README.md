# Historical LLM card-gen recordings

These frozen outputs support deterministic regression through `pnpm test:llm`. The historical replay explicitly adapts old fixture identities and metadata, including M1's frozen base and localized string-array prerequisites before compilation; it does not demonstrate current model quality or model admission.

The replay runner never calls a provider and refuses live/record flags. New generation acceptance must use the browser runner, retain unmodified generated source and authoritative metadata, and record a complete declared batch separately. See [the LLM test guide](../../../docs/test/llm-card-gen.md).
