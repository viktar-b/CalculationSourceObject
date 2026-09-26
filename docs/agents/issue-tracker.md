# Issue tracker

Local tickets and specs live in `.scratch/`, which Git ignores. Use one
directory per effort. Keep its spec in `.scratch/<effort>/spec.md` and each
ticket in `.scratch/<effort>/issues/<NN>-<slug>.md`. Number tickets from `01`.
Create files only when the work needs them.

When a skill publishes a ticket, create a ticket file. When it fetches one,
read the referenced file. Give each ticket a stable identifier and record its
scope, status, blockers and completion evidence. Append conversation history
under `## Comments` when needed.

Record the state role in a `Triage:` field using
`docs/agents/triage-labels.md`. Keep execution status in a separate `Status:`
field. For triaged tickets, record `Category: bug` or
`Category: enhancement`.

## Wayfinding

Keep the map in `.scratch/<effort>/map.md`, with child tickets under that
effort's `issues/` directory. Use `Type: research`, `prototype`, `grilling`, or
`task` for each child. Record `Blocked by: NN, NN` for dependencies. A child
is available when it is open, unblocked and unclaimed. Claim it by setting
`Status: claimed`; resolve it by recording the answer and setting
`Status: resolved`. Add a short decision and link to the map. Move lasting
decisions into an owning guide or ADR.
