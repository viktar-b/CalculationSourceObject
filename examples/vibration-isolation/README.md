# Nonlinear vibration isolation

Two worked reports combine numerical adapters with documented symbolic methods.
They use only the Python standard library.

- `showcase.cso.py::compare` compares a linear spring, a hardening spring near resonance, and a hardening spring outside the chosen small-motion limit. Cases appear in columns.
- `showcase.cso.py::sweep` solves equilibrium once and reuses that displacement in five frequency cases. Cases appear in rows. All three data columns fit together in one print part.

The prescribed static force is 400 N and mass is 50 kg. The model is an educational single-degree-of-freedom study, with positive linear stiffness, nonnegative cubic stiffness and viscous damping. It does not assess strength, fatigue or installation safety.

## What the reports demonstrate

| Feature | Where to look |
| --- | --- |
| External numerical algorithm | `helpers/equilibrium.py` brackets and bisects F = k x + a x³ |
| Static external interface | `methods.py` declares typed quantities, complete outputs and authored method text |
| Reusable calculations and nested composition | `design.cso.py` combines equilibrium, stored energy and `response.cso.py` |
| Shared method explanation | `method(...)` displays the symbolic plan once, including the opaque external leaf |
| Both comparison orientations | Candidate columns and frequency rows, with print column caps |
| Normal indexed quantity cells | Every external input/output uses the ordinary variable/value/unit/comment layout |
| Complete diagnostics | Residual and iteration count remain visible even when omitted from comparison rows |
| Formula functions and units | Powers, square roots, pi, dimensional quantities and qualified glyphs |
| Engineering checks | Static travel and force-transmission targets retain Pass/Fail and the computed numbers |
| Applicability | Large dynamic motion marks the local response Not applicable while preserving its numerical result |
| Branch-aware formulas | Screening uses actual transmissibility within the chosen motion limit, otherwise unity, giving no isolation credit |
| Document structure | Assumptions, SVG schematic, captions, alt text and a named document subsection |
| Independent references | Exact equilibrium roots checked separately; residuals/iterations explicitly uncovered |
| Retained execution and reports | Verified HTML/PDF with source identities, evidence and explicit algorithm exclusions |

This covers the main authoring and report features. It does not attempt to place every supported mathematical operator in one calculation.

## Model and expected results

The spring law is F = k x + a x³. Integrating the restoring force gives stored energy U = k x²/2 + a x⁴/4. Its derivative gives tangent stiffness k_t = k + 3 a x². The response calculation uses f_n = sqrt(k_t/m)/(2 pi) and damping ratio c/(2 sqrt(k_t m)).

For harmonic force P acting on the local oscillator, the transmitted-force ratio is the magnitude of (k_t + i c omega)/(k_t - m omega² + i c omega). The authored real expression follows from that ratio. Dynamic motion is an independently prescribed qualification input, not a solved response amplitude.

At the default 400 N load the three unique equilibrium roots are independently established by substitution:

| Candidate | Exact displacement | Stored energy | Natural frequency | Force ratio |
| --- | --- | --- | --- | --- |
| Linear, 20 Hz | 0.010 m | 2.00 J | 4.502 Hz | 0.05702 |
| Hardening, 8 Hz | 0.010 m | 1.50 J | 6.366 Hz | 1.70071 |
| Large motion, 20 Hz | 0.008 m | 0.96 J | 8.115 Hz | 0.20133, outside the chosen local-model limit |

The first two cases fail the 9 mm static-travel criterion. The second fails the force-ratio target of 0.3. The third exceeds the explicitly chosen dynamic-motion limit of ten percent of static displacement; its screening value is therefore 1.0. This limit is an authored modeling choice, not a validated universal threshold.

The frequency sweep reaches a force ratio of about 9.94172 at 6.4 Hz and 0.11810 at 20 Hz. Numerical consistency does not establish the physical adequacy of these assumptions.

## Reproduce the reference-checked reports

After the repository development setup, use the selected installed interpreter
and build the CLI once:

```sh
npm run build:cli
node examples/vibration-isolation/render.mjs output/vibration-isolation
```

`PYTHON` must name the installed interpreter selected by the development setup.
The script generates fresh bindings, captures both calculations, binds the fixed
independent roots above, then writes checked HTML, PDF, reference JSON and
verification reports. Sibling evidence directories retain publication captures.
The reference expectations are fixed algebraic values, never observed answers.
The script checks the default 400 N cases. Changes to model inputs or equations
require separately reviewed expected values. Source/environment identity is
rebound while these independent expectations remain fixed.

The report follows the authored calculation order. Reusable calculations have
their own scope rule and explain the × used for values not yet defined in that
procedure. Every numerical input and limit stays inspectable. A Not applicable
label accompanies the raw computed value. Evidence directories identify the
captured source. PDF bytes may differ because of metadata and the rendering
environment.

## Individual commands

From the repository root after the development setup:

```sh
"$PYTHON" -m cso_python bindings examples/vibration-isolation
node packages/cso-cli/dist/cli.js verify examples/vibration-isolation/showcase.cso.py --function compare
node packages/cso-cli/dist/cli.js html examples/vibration-isolation/showcase.cso.py --function compare --out output/isolators.html --check-layout
node packages/cso-cli/dist/cli.js pdf examples/vibration-isolation/showcase.cso.py --function compare --out output/isolators.pdf
node packages/cso-cli/dist/cli.js pdf examples/vibration-isolation/showcase.cso.py --function sweep --out output/frequency-sweep.pdf
```

The public integration test `tests/integration/vibration-isolation.test.ts` constructs scoped independent references from the fixed exact roots above, checks both reports, and retains failed-check and applicability behavior. Verification without `--reference` establishes consistency, with independent coverage pending. Inspect every delivered PDF page separately from automated layout checks.
