# Repository workflows

Read the matching workflow when the task reaches that part of the calculation
pipeline. These recipes point to the owning guides and executable checks.

| Task | Workflow |
| --- | --- |
| Add a function or operator, or change numerical behavior | [Function support](workflows/function-support.md) |
| Verify changes spanning Python and TypeScript | [Verification](workflows/verification.md) |
| Build a capture, export or document proof | [Execution evidence](workflows/execution-evidence.md) |
| Assess or address Cubic and human review findings | [Review feedback](workflows/review-feedback.md) |

Start architecture exploration with the [code map](../docs/code-map.md).
Keep implementation facts in code/tests, accepted decisions in
[ADRs](../docs/adr/), and session-specific findings under `.scratch/`.
