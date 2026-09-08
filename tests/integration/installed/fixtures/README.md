# Two-input acceptance source

`geometry.cso.py.txt` is an unchanged copy of the Python-owned
`examples/two-panel/geometry.cso.py` at
`f01925c3786273046ce9417445d9c04aa0d2f668`. The Python owner approved this
ordinary acceptance-input copy on 2026-09-06. Production authored sources
remain Python-owned. The runner copies these bytes to `rectangle input.cso.py`
outside the checkout and invokes the reviewed installed export module with
repeated `--input width=2 --input height=3`. Expected returned values are
width 2, height 3, area 6 and perimeter 10 from elementary rectangle arithmetic.
This fixture exercises the legacy exporter, independently of captured composition.

The review regression also creates a temporary identifier variant by renaming
function `rectangle` to `ορθογώνιο` and parameter `width` to `π`, including its
`given` reference. Other source bytes and expected returned values stay the same.
The checked-in fixture remains unchanged. This exercises the public Unicode
identifier contract through the actual installed exporter.

A second temporary variant uses `K` for both the function and first parameter.
Python normalizes this spelling to `K` while parsing source. Acceptance invokes
the authored spelling and verifies that the CLI normalizes forwarded names,
and that `K` and `K` cannot bypass duplicate-input detection.
