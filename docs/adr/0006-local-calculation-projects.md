# ADR-0006: Run generated calculation projects on localhost

**Status**: Accepted
**Date**: 2026-09-27
**Authors**: viktar-b, Codex

## Context

The first initializer was discussed as an agent workflow that deploys reports to
Vercel. The user changed the first release goal to a generated project used as a
local application. A coding agent authors the calculation from a brief and
references; the user edits numeric inputs and obtains a report through a browser.

Python already owns calculation definitions and execution. Core verifies captured
execution, and the CLI coordinates processes, assets and HTML/PDF generation.
Creating a second server package would duplicate that coordination or require a
new public runtime API before the local experience has been established.

## Decision

Ship a public initializer that creates one local report project with versioned
package dependencies and agent-neutral guidance. Keep its server in the existing
CLI as `cso dev`. The generated project supplies its source and selected function
at startup; HTTP callers supply only declared numeric inputs. Bind the server to
loopback. Deployment and Vercel access are outside the first local workflow.

Derive the form and request validation from a static calculation definition.
Verify captured execution in core before returning calculation outputs. Retain a
run's captured execution, assets, prepared document and HTML, and generate its PDF
from that same retained report. A subsequent source edit or calculation cannot
change an earlier run. Runs are temporary and bounded, rather than a durable
report archive.

Apply ADR-0004's on-demand PDF review policy to the local application. Automated
checks and PDF identity accompany a download, while human visual inspection and
engineering approval remain separate. A missing independent numerical reference
remains pending. Terminal calculation responses contain only selected outputs;
review evidence is available separately.

## Consequences

### Positive

- A generated project runs without cloud credentials or a hosting account.
- Browser and terminal callers share core verification and one Python definition.
- The CLI retains its existing process and document ownership.
- Editing inputs produces a PDF tied to the same run shown in the browser.

### Negative / Trade-offs

- Users install Node, Python and Chromium; npm coordinates setup but does not
  replace the Python runtime.
- The application is for local use, with bounded temporary runs and no accounts,
  public sharing or durable storage.
- Publishing versioned dependencies on npm and PyPI remains a separate release
  operation. Archive acceptance does not establish public registry availability.

## Alternatives Considered

### Vercel as the initial delivery target

The user chose to establish the local application first. Hosting topology,
credentials and deployment confirmation do not determine the local workflow.
ADR-0004 still governs verification and review claims for future hosted delivery.

### A separate local server package

This would add package ownership and a public coordination API while the CLI
already owns Python execution, verification and PDF rendering. Reconsider that
boundary when another consumer needs the server independently of the CLI.

## Related

- [ADR-0001: Package ownership and the CSO handoff](0001-package-ownership-and-cso-handoff.md)
- [ADR-0004: Verify hosted results and label on-demand PDF review](0004-hosted-verification-and-pdf-review.md)
- [Initializer guide](../../apps/create-cs-object/README.md)
- [CLI guide](../../apps/cso-cli/README.md)
