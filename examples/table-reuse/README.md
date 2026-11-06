# Table values reused downstream

Three axial spring cases return extension, strain and elastic energy. Their
comparison has three quantities across three cases, giving nine result cells.
The parent gives all nine values new review names, uses them in three sums,
then calculates a revised Alpha extension with an illustrative allowance.
These sums illustrate numerical reuse across independent cases; they do not
represent a combined mechanical system or a design assessment.

The reusable definition and its table identify `axial.cso.py::response` from
captured evidence. A report-local procedure reference links the table to the
definition. The case headings identify the qualifiers used downstream.
Renaming a result does not overwrite its original table value.

From the repository root after following `docs/development.md`:

```sh
node packages/cso-cli/dist/cli.js bindings examples/table-reuse
node packages/cso-cli/dist/cli.js pdf examples/table-reuse/demonstrate.cso.py \
  --function demonstrate --out output/table-reuse.pdf --format json
```

Expected result rows are:

| Quantity | Alpha, 1 kN | Beta, 2 kN | Gamma, 3 kN |
| --- | ---: | ---: | ---: |
| Extension, m | 0.001 | 0.002 | 0.003 |
| Strain | 0.0005 | 0.001 | 0.0015 |
| Elastic energy, J | 0.5 | 2 | 4.5 |

The sums are 0.006 m, 0.003 and 7 J. Revised Alpha extension is 0.0011 m.
The stiffness is 1,000,000 N/m and the gauge length is 2 m in every case.
The 10 percent allowance is illustrative. Inspect the final PDF separately
from numerical consistency and reference checks.
