# Review feedback

Use this workflow for Cubic or human review findings. Keep the working ledger
under the task's `.scratch/` directory using the
[local tracker](../../docs/agents/issue-tracker.md).

1. Record the PR head and local revision, then collect review threads and check
   results. Filter tool responses to the needed IDs, locations, messages and
   states before printing them. Done when each finding is tied to a revision
   and the checkout under review matches it.
2. Reproduce each actionable finding through the public interface it affects.
   Classify it as an implementation defect, a retained source-formula defect,
   a presentation defect, or an unsupported claim. For a transcription, compare
   the retained source and its hash before changing formulas. Done when the
   failing behavior and its owner are identified.
3. Keep [source-to-document consistency](../../CONTEXT.md) separate from
   independent numerical agreement and engineering approval. Correct a source
   formula through an explicit source/reference revision; preserve independently
   established expected values. The [evidence decision](../../docs/adr/0002-evidence-and-engineering-presentation.md)
   owns those distinctions.
4. Fix the owning module, add a regression at the affected interface, and run
   [verification](verification.md). For document findings, follow
   [execution evidence](execution-evidence.md). Done when the original failure
   is closed and the regression exercises it.
5. Report local fixes separately from committed/pushed fixes. When GitHub updates
   are requested, link each response to the relevant commit and evidence, then
   refresh review/check state for that head. Done when every finding has an
   explicit disposition and any new review findings remain visible.

Use the active PR-writing skill for a requested submission rather than copying
its template here. A fresh review may add findings after earlier threads are
resolved; a previous green check belongs to the revision it actually checked.
