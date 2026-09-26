# ADR-0004: Verify hosted results and label on-demand PDF review

**Status**: Accepted
**Date**: 2026-09-25
**Authors**: viktar-b

## Context

The disposable hosted prototype verifies captured calculations in the browser,
but its public API returns Python outputs without server-side core verification.
The first public agent-created report also requires a PDF for arbitrary edited
inputs. Requiring human visual inspection before every hosted download would
prevent immediate PDF delivery, while omitting review status would imply more
assurance than the system has established.

## Decision

A successful public calculation API response requires server-side core
verification of the captured Python execution. Public requests may vary only
declared numeric inputs of the bundled calculation source. Show a missing
independent numerical reference as pending; a failing matching reference blocks
a verified success. None of these checks implies human engineering approval.

An on-demand hosted PDF uses a server-verified execution for its selected
inputs. Before offering the download, run automated page checks and bind their
findings to the exact PDF bytes. Label human visual inspection as pending until
a reviewer records findings for those bytes. This permits a hosted download
with pending human review and narrows ADR-0002's delivery rule for this
generated artifact. A report described as human-reviewed still requires
inspection of its exact PDF bytes.

## Consequences

### Positive

- Browser and terminal callers share the same server verification boundary.
- A hosted user can download a PDF for edited inputs with traceable automated
  findings and an honest human-review status.
- Independent numerical agreement and human approval remain separate claims.

### Negative / Trade-offs

- Verification and PDF checks add server work, latency and hosting complexity.
- Automated checks do not establish human visual inspection or engineering
  approval; those statuses stay pending until separate review.
- The Vercel service layout is still unproven and requires a hosted prototype.

## Alternatives Considered

### Browser-only verification

That leaves terminal and other API callers dependent on a check they never run.

### Human inspection before every hosted download

That prevents immediate PDFs for arbitrary edited inputs. Automated checks
allow the download while keeping human review visibly pending.

## Related

- [ADR-0002: Evidence and engineering presentation](0002-evidence-and-engineering-presentation.md)
- [Code map](../code-map.md)
- [Rendering guide](../rendering.md)
