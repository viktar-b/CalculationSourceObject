# Documented external functions

These examples keep an ordinary Python algorithm behind a static CSO declaration.
Both capture every declared input and output, including unused diagnostics, and
use the captured value in a later documented formula. The report distinguishes
external-result consistency from formula verification.

## Dependency-free loop

Generate bindings and verify the loop example with the installed Python package:

```sh
python -m cso_python bindings examples/external-functions/loop
node packages/cso-cli/dist/cli.js verify examples/external-functions/loop/calculate.cso.py --function calculate
```

With an upper limit of four and four intervals, the midpoints are 0.5, 1.5, 2.5
and 3.5. Their squared values sum to 21 and the interval width is one. The
captured estimate is therefore 21 and the downstream doubled value is 42.
This is an independently worked arithmetic expectation for the example, not a
claim that the midpoint rule produces an exact integral.

## Optional scientific adapter

Install the adapter's optional dependency explicitly, then generate bindings:

```sh
python -m pip install -r examples/external-functions/scientific/requirements.txt
python -m cso_python bindings examples/external-functions/scientific
node packages/cso-cli/dist/cli.js html examples/external-functions/scientific/calculate.cso.py --function calculate --out output/quadrature.html --check-layout
node packages/cso-cli/dist/cli.js pdf examples/external-functions/scientific/calculate.cso.py --function calculate --out output/quadrature.pdf
```

The antiderivative of x squared is x cubed divided by three. The independently
established expected integral for the default limit is therefore 64/3 and the
downstream doubled value is 128/3. The adapter also captures SciPy's estimated
absolute error. That diagnostic has no independent expectation in this example.

The adapter promotes convergence warnings to exceptions and converts library
values to native Python floats. See SciPy's [quad documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.quad.html)
for the tolerance and error-estimate contract. SciPy is not a CSO runtime
dependency. Binding generation and static description work without importing it.

External algorithms remain outside formula verification. Inspect every delivered
PDF page and review the assumptions and method separately from numerical checks.

## Check selected outputs independently

Keep the expected number and its derivation separate from a captured answer.
Core's `externalReferenceBindingFrom(execution)` records source, declarations,
adapter identity, resolved inputs and interpreter/distribution environment.
A reference file with `referenceVersion: "2"` can contain a case with
`kind: "externalOutputs"`, a reviewed `basis`, that binding, and an `expected`
entry selecting `externalCallId`, `outputName`, `value`, `numericKind` and `unit`.
For quadrature, select output `value` and use the independently established
64/3 expectation. Leave `absolute_error` uncovered unless a separate source
establishes an expectation for it. Pass the file with `--reference` to verify,
HTML or PDF commands. Do not use observed results to populate expected values.

A matching failed expectation blocks publication. Missing or invalidated
coverage stays pending; partial coverage lists both checked and uncovered
outputs. Source, adapter, input or recorded environment changes require an
explicit reviewed rebind. A new run ID or a changed observed answer does not
change reference identity, so a nondeterministic wrong answer is still compared.
