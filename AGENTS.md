# Working in CalculationSourceObject

Generate documented formulas and numerical results from the same constrained
Python source. Keep inputs, units, assumptions, steps and results inspectable.
Source-to-document consistency is separate from independent numerical agreement
and human engineering approval.

## Read when relevant

- Before creating or updating a pull request, read [CONTRIBUTING.md](CONTRIBUTING.md).
- Before creating or modifying `.cso.py` sources, read [authoring](docs/authoring.md).
  It defines descriptive names, compact qualified glyphs, shared metadata and
  reference-rebinding rules. Apply the same notation to diagram labels.
- Before changing package ownership or execution flow, read [the code map](docs/code-map.md),
  [CONTEXT.md](CONTEXT.md) and the relevant [ADRs](docs/adr/).
- For document content, notation, layout or print changes, use
  [rendering](docs/rendering.md#choose-verification-by-change) to select HTML or PDF checks.
- For setup and verification commands, use [development](docs/development.md)
  and the owning package's scripts. CLI behavior is in [its guide](packages/cso-cli/README.md).
- For function support, cross-package verification, execution evidence or
  review-feedback work, use the [repository workflows](.agents/README.md).

## Package and test boundaries

Packages/apps build and test with their own files and declared dependencies.
Apps may depend on packages. Keep root examples and
shared fixtures out of package/app implementation, configuration and tests.
Generic user-supplied data paths remain supported.

Keep engineering examples in one canonical location. Cross-project checks belong in `tests/integration/`. Copy canonical inputs into
temporary consumers when mutation is needed. Package fixtures are small synthetic
behavior cases; generate their bindings in temporary directories.

## Calculation review

Use the maintained examples and synthetic fixtures to check document structure,
notation, detail and context. Account for every input, unit, formula, explanation,
figure and result when changing document generation.

Use the [inspection guide](docs/rendering.md#printing-and-inspection) for artifact
delivery. Report failed or uncompleted checks separately from successful checks.

## Keep guidance small

Keep rules in one owning guide and point to code/tests for implementation facts.
Use one shared `CONTEXT.md` glossary and `docs/adr/` for accepted decisions.
Keep local tickets and specs under `.scratch/`, following
`docs/agents/issue-tracker.md`. Record lasting decisions in their owning guide
or an ADR.

## Agent skills

### Issue tracker

Track local tickets and specs under `.scratch/`.
See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels.
See `docs/agents/triage-labels.md`.

### Domain docs

Use single-context documentation: root `CONTEXT.md` and `docs/adr/`.
See `docs/agents/domain.md`.
