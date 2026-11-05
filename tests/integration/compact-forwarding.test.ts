import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BoundPreparedDocumentSchema,
  ExecutionResponseSchema,
  verifyExecution,
} from '@cs-object/core';
import {
  prepareExecutionDocument,
  PreparedFormulaSheet,
} from '@cs-object/react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import { expect, test } from 'vitest';

test('forwarding stays inspectable in quantity rows while authored aliases and calculations retain derivations', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cso-forwarding-'));
  const run = (...args: string[]) => {
    const result = spawnSync(
      process.env.PYTHON ?? 'python3',
      ['-I', '-m', 'cso_python', ...args],
      { encoding: 'utf8' },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    return result.stdout;
  };
  const browser = await chromium.launch();
  try {
    writeFileSync(
      join(root, 'leaf.cso.py'),
      `from typing import Annotated
from cso_python import calculation, section, symbol
@calculation(id="leaf", title="Area")
@section(title="Area", root=True)
def leaf(length: Annotated[float, symbol(glyph="l", description="Length", unit="m")], factor: Annotated[int, symbol(glyph="n", description="Factor", unit="")]):
    area: Annotated[float, symbol(glyph="A", description="Area", unit="m^2")] = length * length
    return {"area": area}
`,
    );
    writeFileSync(
      join(root, 'wrapper.cso.py'),
      `from typing import Annotated
from cso_python import calculation, section, symbol
from _cso_bindings.leaf import leaf
@calculation(id="wrapper", title="Composition")
@section(title="Composition", root=True)
def wrapper(length: Annotated[float, symbol(glyph="l", description="Length", unit="m")]):
    first = leaf(length=length, factor=2)
    longer: Annotated[float, symbol(glyph="l_{long}", description="Longer length", unit="m")] = length + 1
    second = leaf(length=longer, factor=3)
    renamed: Annotated[float, symbol(glyph="B", description="Review area", unit="m^2")] = first["area"]
    converted: Annotated[float, symbol(glyph="C", description="Area in square millimetres", unit="mm^2")] = renamed * 1000000
    __return_0: Annotated[float, symbol(glyph="D", description="Explicit legacy-looking name", unit="m^2")] = first["area"]
    return {"first": first["area"], "second": second["area"], "supplied": length, "renamed": renamed, "converted": converted, "declared": __return_0}
`,
    );
    writeFileSync(
      join(root, 'compare.cso.py'),
      `from cso_python import calculation, section, method, table
from _cso_bindings.wrapper import wrapper
@calculation(id="compare", title="Compare")
@section(title="Compare", root=True)
def compare():
    method(id="procedure", title="Procedure", calculation=wrapper)
    first = wrapper(length=2)
    second = wrapper(length=2)
    table(id="cases", method="procedure", title="Cases", cases={"First": first, "Second": second})
    return {"area": first["first"]}
`,
    );
    writeFileSync(
      join(root, 'empty.cso.py'),
      `from typing import Annotated
from cso_python import calculation, section, method, table, symbol
from _cso_bindings.wrapper import wrapper
@calculation(id="empty", title="Empty")
@section(title="Empty", root=True)
def empty():
    method(id="procedure", title="Procedure", calculation=wrapper)
    table(id="cases", method="procedure", title="Cases", cases={})
    ready: Annotated[int, symbol(glyph="r", description="Ready", unit="")] = 1
    return {"ready": ready}
`,
    );
    run('bindings', root);
    const response = ExecutionResponseSchema.parse(
      JSON.parse(
        run(
          'execute',
          join(root, 'compare.cso.py'),
          '--function',
          'compare',
          '--supported-execution-protocol',
          '5',
        ),
      ),
    );
    if (!response.ok) throw new Error(JSON.stringify(response.diagnostics));
    expect(verifyExecution({ execution: response.execution }).ok).toBe(true);
    const document = prepareExecutionDocument({
      execution: response.execution,
      assets: [],
    });
    expect(
      BoundPreparedDocumentSchema.safeParse({
        execution: response.execution,
        document,
      }).success,
    ).toBe(true);
    const html = renderToStaticMarkup(
      createElement(PreparedFormulaSheet, { document }),
    );
    const page = await browser.newPage();
    await page.setContent(html);
    for (const name of ['first', 'second', 'supplied']) {
      const row = page.locator(`.cso-method [data-quantity="${name}"]`);
      await expect(row.locator('[data-binding-origin]').count()).resolves.toBe(
        1,
      );
      await expect(row.locator('[data-derivation]').count()).resolves.toBe(0);
      await expect(row.locator('.cso-symbolic-value').count()).resolves.toBe(1);
    }
    for (const name of ['renamed', 'converted', 'declared', 'longer'])
      await expect(
        page
          .locator(`.cso-method [data-quantity="${name}"] [data-derivation]`)
          .count(),
      ).resolves.toBe(1);
    await expect(
      page.locator('[data-call="first"] .cso-formula-term').count(),
    ).resolves.toBe(0);
    await expect(
      page.locator('[data-call="second"] .cso-formula-term').count(),
    ).resolves.toBe(0);
    await expect(
      page
        .locator(
          '[data-helper="leaf"] [data-quantity="length"] [data-binding-call]',
        )
        .count(),
    ).resolves.toBe(2);
    await expect(
      page.locator('[data-binding-origin="literal"]').allTextContents(),
    ).resolves.toEqual(['First: Given 2', 'Second: Given 3']);
    const table = document.sections
      .flatMap((section) => section.items)
      .find((item) => item.kind === 'table');
    if (table?.kind !== 'table') throw new Error('Missing cases');
    const forwarded = table.groups
      .flatMap((group) => group.rows)
      .find((row) => row.quantity === 'first');
    expect(forwarded?.cells.map((cell) => cell.value)).toEqual([4, 4]);
    expect(new Set(forwarded?.cells.map((cell) => cell.symbolId)).size).toBe(2);
    const empty = ExecutionResponseSchema.parse(
      JSON.parse(
        run(
          'execute',
          join(root, 'empty.cso.py'),
          '--function',
          'empty',
          '--supported-execution-protocol',
          '5',
        ),
      ),
    );
    if (!empty.ok) throw new Error(JSON.stringify(empty.diagnostics));
    expect(empty.execution.invocations).toHaveLength(1);
    const emptyDocument = prepareExecutionDocument({
      execution: empty.execution,
      assets: [],
    });
    const emptyHtml = renderToStaticMarkup(
      createElement(PreparedFormulaSheet, { document: emptyDocument }),
    );
    expect(emptyHtml).toContain('data-binding-origin=');
    expect(emptyHtml).toContain('No cases evaluated');
  } finally {
    await browser.close();
    rmSync(root, { recursive: true, force: true });
  }
});
