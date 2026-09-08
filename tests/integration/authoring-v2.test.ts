import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { ExecutionResponseSchema, verifyExecution } from "@viktar-b/cso-core";


function fixture(name = "composed") {
  const response = ExecutionResponseSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(`../fixtures/authoring-v2/${name}.json`, import.meta.url),
        "utf8",
      ),
    ),
  );
  if (!response.ok || !response.execution.authoring)
    throw new Error("Expected v2 fixture");
  return {
    execution: response.execution,
    authoring: response.execution.authoring,
  };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Fixture item missing");
  return value;
}

it("rejects duplicate glyphs even when values and units happen to agree", () => {
  const { execution } = fixture();
  const symbols = execution.cso.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.kind === "symbol" ? [item.symbol] : [],
    ),
  );
  const first = required(symbols[0]);
  const second = required(symbols[1]);
  second.glyph = first.glyph;
  const report = verifyExecution({ execution });
  expect(report.ok).toBe(false);
  expect(report.diagnostics.some((d) => d.code === "DUPLICATE_GLYPH")).toBe(
    true,
  );
});

it("rejects tampering with a qualified glyph or its invocation scope", () => {
  for (const change of ["glyph", "scope"]) {
    const { execution } = fixture();
    const symbol = required(
      execution.cso.sections
        .flatMap((section) =>
          section.items.flatMap((item) =>
            item.kind === "symbol" ? [item.symbol] : [],
          ),
        )
        .find((item) => item.metadata?.authoredGlyph),
    );
    if (change === "glyph") symbol.glyph = "Q";
    else symbol.metadata = { ...symbol.metadata, glyphScope: "wrong" };
    const report = verifyExecution({ execution });
    expect(report.ok).toBe(false);
    expect(
      report.diagnostics.some((d) => d.code === "GLYPH_SCOPE_MISMATCH"),
    ).toBe(true);
  }
});

it("verifies shared v2 fixtures, including hidden intermediates and inherited outputs", () => {
  for (const name of ["valid", "composed"]) {
    const { execution } = fixture(name);
    const report = verifyExecution({ execution });
    expect(report.ok, JSON.stringify(report.diagnostics)).toBe(true);
    expect(report.checks.outputConsistency?.status).toBe("passed");
    expect(report.checks.independentReferenceAgreement.status).toBe(
      "not_applicable",
    );
  }
  const { execution } = fixture();
  expect(execution.observations.filter((o) => o.kind === "input")).toHaveLength(
    2,
  );
  expect(
    execution.observations.filter((o) => o.kind === "formula"),
  ).toHaveLength(5);
});

it("compares returned values independently of assignments and cached results", () => {
  const { execution, authoring } = fixture();
  required(authoring.outputs.find((o) => o.name === "total")).value = 999;
  const report = verifyExecution({ execution });
  expect(report.checks.formulaConsistency.status).toBe("passed");
  expect(report.checks.outputConsistency?.status).toBe("failed");
  expect(report.checks.sourceToDocumentConsistency.status).toBe("failed");
  expect(
    report.diagnostics.find((d) => d.code === "OUTPUT_MISMATCH")?.comparison,
  ).toBeDefined();
});

it("rejects a wrong hidden assignment without substituting the expected value", () => {
  const { execution } = fixture();
  const observation = required(
    execution.observations.find((o) => o.symbolId.includes("perimeter")),
  );
  observation.value = 999;
  const report = verifyExecution({ execution });
  expect(report.ok).toBe(false);
  expect(report.checks.formulaConsistency.status).toBe("failed");
  expect(observation.value).toBe(999);
});

it.each(["assignment", "output", "parameter", "use"])(
  "rejects missing %s observations or provenance",
  (kind) => {
    const { execution, authoring } = fixture();
    if (kind === "assignment") execution.observations.pop();
    if (kind === "output") authoring.outputs.pop();
    if (kind === "parameter") authoring.parameters.pop();
    if (kind === "use") authoring.uses.pop();
    expect(verifyExecution({ execution }).checks.executionValidity.status).toBe(
      "failed",
    );
  },
);

it("rejects forged operand bindings even when two inputs have equal values", () => {
  const { execution, authoring } = fixture();
  const use = required(authoring.uses.find((u) => u.parameterName === "width"));
  use.parameterName = "height";
  expect(verifyExecution({ execution }).checks.executionValidity.status).toBe(
    "failed",
  );
});

it("rejects skipped forwarding steps and unit changes", () => {
  const { execution, authoring } = fixture();
  const parameter = required(
    authoring.parameters.find(
      (p) => p.invocationId === "root/second" && p.parameterName === "width",
    ),
  );
  parameter.origin = {
    kind: "parameter",
    invocationId: "root/first",
    parameterName: "width",
  };
  expect(verifyExecution({ execution }).checks.executionValidity.status).toBe(
    "failed",
  );
  parameter.origin = {
    kind: "output",
    invocationId: "root/first",
    outputName: "width",
  };
  parameter.unit = "cm";
  expect(verifyExecution({ execution }).checks.executionValidity.status).toBe(
    "failed",
  );
});

it("rejects private output access and missing nonlocal operand provenance", () => {
  for (const removeProvenance of [false, true]) {
    const { execution } = fixture();
    const total = required(
      execution.cso.sections
        .flatMap((s) => s.items)
        .find(
          (item) => item.kind === "symbol" && item.symbol.id.includes("total"),
        ),
    );
    if (total.kind !== "symbol") throw new Error("Expected total symbol");
    const operand = required(
      total.symbol.valueTree.nodes.find((node) => node.metadata?.outputName),
    );
    if (removeProvenance) operand.metadata = {};
    else operand.metadata = { ...operand.metadata, outputName: "perimeter" };
    expect(verifyExecution({ execution }).checks.executionValidity.status).toBe(
      "failed",
    );
  }
});
