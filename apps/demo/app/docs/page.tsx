import { CodePanel } from '../CodePanel.tsx';
import { SiteNav } from '../SiteNav.tsx';

export const dynamic = 'force-static';
export const revalidate = false;

const pipelineSteps = [
  {
    label: 'Author',
    title: 'Annotated Python',
    body: 'Engineers write constrained Python with metadata-bearing inputs and annotated calculation steps.',
  },
  {
    label: 'Capture and verify',
    title: 'CalculationSourceObject',
    body: 'Python captures source and runtime observations. Verified commands use core to evaluate the documented formulas independently.',
  },
  {
    label: 'Render',
    title: 'FormulaSheet',
    body: 'The source object becomes a sheet model with explicit rows for symbols, formulas, values, units, and comments.',
  },
  {
    label: 'Display',
    title: 'MathML',
    body: 'FormulaSheet renders symbols, units, and formula trees as native MathML so reviewers see real notation.',
  },
] as const;

const contentsLinks = [
  ['Motivation', '#motivation'],
  ['Authoring Layer', '#authoring-layer'],
  ['Source Object', '#source-object'],
  ['FormulaSheet', '#formulasheet'],
  ['MathML', '#mathml'],
] as const;

const pythonSnippet = `from typing import Annotated, TypeAlias
from cso_python import CalculationResults, calculation, section, symbol, text

ConcreteWidth: TypeAlias = Annotated[
    float, symbol(glyph="w_{c}", unit="mm", description="Concrete width")
]
ConcreteDepth: TypeAlias = Annotated[
    float, symbol(glyph="h_{c}", unit="mm", description="Concrete depth")
]

@calculation(id="beam-check", title="Beam Check")
@section(id="concrete", title="Concrete", root=True)
def calculate_beam(width: ConcreteWidth, depth: ConcreteDepth) -> CalculationResults:
    text(id="notation", content="Subscript c denotes concrete.")
    area: Annotated[
        float, symbol(glyph="A_{c}", unit="mm^2", description="Concrete area")
    ] = width * depth
    return {"area": area}`;

const sourceSnippet = `{
  "id": "area",
  "glyph": "A_{c}",
  "unit": "mm^2",
  "valueTree": {
    "rootKey": "area",
    "nodes": [
      { "key": "width", "mode": "SYMBOL", "symbol": { "id": "width" } },
      { "key": "depth", "mode": "SYMBOL", "symbol": { "id": "depth" } },
      {
        "key": "area",
        "mode": "FUNCTION",
        "funcSpec": { "id": "fg.multiply" },
        "funcArgs": [{ "key": "width" }, { "key": "depth" }]
      }
    ]
  }
}`;

const formulaSheetSnippet = `const source = parseCalculationSourceJson(json);
const calculation = createSheetFromCalculationSourceObject(source, {
  id: "beam-check",
  label: source.title,
});

<FormulaSheet sheet={calculation.sheet} />`;

const mathmlSnippet = `<math display="block">
  <mrow>
    <msub>
      <mi>A</mi>
      <mi>c</mi>
    </msub>
    <mo>=</mo>
    <msub><mi>w</mi><mi>c</mi></msub>
    <msub><mi>h</mi><mi>c</mi></msub>
  </mrow>
</math>`;

const SectionHeading = ({
  eyebrow,
  title,
  body,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
}) => (
  <div>
    <p className="font-['Plus_Jakarta_Sans'] text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
      {eyebrow}
    </p>
    <h2 className="mt-2 font-['Plus_Jakarta_Sans'] text-[24px] font-semibold leading-tight text-gray-950">
      {title}
    </h2>
    <p className="mt-3 max-w-[820px] font-['Plus_Jakarta_Sans'] text-[14px] leading-6 text-gray-600">
      {body}
    </p>
  </div>
);

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[#f6f5f1] text-gray-950">
      <SiteNav active="docs" />
      <div className="mx-auto flex max-w-[1560px] flex-col gap-7 px-4 py-6 min-md:px-8 min-md:py-8">
        <header className="grid gap-5 border-b border-gray-300 pb-6 min-xl:grid-cols-[minmax(0,1fr)_440px] min-xl:items-end">
          <div>
            <p className="font-['Plus_Jakarta_Sans'] text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
              Developer Docs
            </p>
            <h1 className="mt-3 max-w-[920px] font-['Plus_Jakarta_Sans'] text-[34px] font-semibold leading-tight text-gray-950 min-md:text-[44px]">
              Transparent backend calculations for engineering review
            </h1>
            <p className="mt-4 max-w-[860px] font-['Plus_Jakarta_Sans'] text-[15px] leading-7 text-gray-600">
              In structural engineering and similar fields, calculation logic
              often lives in backend code while the people approving the work
              need a readable calculation sheet. This architecture keeps the
              code path and the review path tied to the same validated source.
            </p>
          </div>

          <div className="grid grid-cols-3 border border-gray-300 bg-white">
            {[
              ['Input', 'Python'],
              ['Contract', 'CSO'],
              ['Review', 'MathML'],
            ].map(([label, value]) => (
              <div
                key={label}
                className="border-r border-gray-300 px-4 py-3 last:border-r-0"
              >
                <p className="font-['Plus_Jakarta_Sans'] text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                  {label}
                </p>
                <p className="mt-1 font-mono text-[22px] text-gray-950">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </header>

        <section
          aria-label="Architecture pipeline"
          className="grid border border-gray-300 bg-white min-lg:grid-cols-4"
        >
          {pipelineSteps.map((step, index) => (
            <div
              key={step.title}
              className="relative border-b border-gray-300 px-4 py-4 last:border-b-0 min-lg:border-r min-lg:border-b-0 min-lg:last:border-r-0"
            >
              <p className="font-mono text-[11px] uppercase text-gray-500">
                {step.label}
              </p>
              <h2 className="mt-2 font-['Plus_Jakarta_Sans'] text-[17px] font-semibold text-gray-950">
                {step.title}
              </h2>
              <p className="mt-2 font-['Plus_Jakarta_Sans'] text-[13px] leading-5 text-gray-600">
                {step.body}
              </p>
              {index < pipelineSteps.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute right-3 top-4 hidden font-mono text-[18px] text-gray-300 min-lg:block"
                >
                  →
                </span>
              )}
            </div>
          ))}
        </section>

        <div className="grid gap-5 min-xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="min-xl:sticky min-xl:top-6 min-xl:self-start">
            <nav className="border border-gray-300 bg-white">
              <div className="border-b border-gray-300 px-4 py-3">
                <h2 className="font-['Plus_Jakarta_Sans'] text-[13px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                  Contents
                </h2>
              </div>
              <div className="divide-y divide-gray-200">
                {contentsLinks.map(([label, href]) => (
                  <a
                    key={href}
                    href={href}
                    className="block px-4 py-3 font-['Plus_Jakarta_Sans'] text-[13px] font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-950"
                  >
                    {label}
                  </a>
                ))}
              </div>
            </nav>
          </aside>

          <div className="grid min-w-0 gap-5">
            <section
              id="motivation"
              className="scroll-mt-6 border border-gray-300 bg-white px-4 py-5 min-md:px-6"
            >
              <SectionHeading
                eyebrow="Motivation"
                title="Keep code-backed calculations inspectable"
                body="Backend calculations remain traceable to formulas, symbols, units, comments, and runtime results that non-programming reviewers can inspect."
              />
            </section>

            <section
              id="authoring-layer"
              className="grid scroll-mt-6 gap-4 min-lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
            >
              <div className="border border-gray-300 bg-white px-4 py-5 min-md:px-6">
                <SectionHeading
                  eyebrow="Authoring Layer"
                  title="Calculation inputs carry reusable metadata"
                  body="Signature annotations define inputs. Annotated assignments define calculation steps, including intermediates omitted from public returns. Shared metadata follows quantities through composed calls."
                />
              </div>
              <CodePanel title="Annotated Python" language="python">
                {pythonSnippet}
              </CodePanel>
            </section>

            <section
              id="source-object"
              className="grid scroll-mt-6 gap-4 min-lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
            >
              <div className="border border-gray-300 bg-white px-4 py-5 min-md:px-6">
                <SectionHeading
                  eyebrow="Source Object"
                  title="The exporter emits CalculationSourceObject JSON"
                  body="The captured execution pairs a CalculationSourceObject with source hashes, input bindings, assignment observations and public outputs. Core checks formulas and outputs separately; execution success alone is not a verification pass."
                />
              </div>
              <CodePanel title="Formula Graph" language="json">
                {sourceSnippet}
              </CodePanel>
            </section>

            <section
              id="formulasheet"
              className="grid scroll-mt-6 gap-4 min-lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
            >
              <div className="border border-gray-300 bg-white px-4 py-5 min-md:px-6">
                <SectionHeading
                  eyebrow="FormulaSheet"
                  title="The source object becomes a review sheet"
                  body="FormulaSheet receives a sheet model derived from CalculationSourceObject. It renders rows for the same symbols and formula graph, without becoming a calculation engine."
                />
              </div>
              <CodePanel title="Render Boundary" language="tsx">
                {formulaSheetSnippet}
              </CodePanel>
            </section>

            <section
              id="mathml"
              className="grid scroll-mt-6 gap-4 min-lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
            >
              <div className="border border-gray-300 bg-white px-4 py-5 min-md:px-6">
                <SectionHeading
                  eyebrow="MathML Architecture"
                  title="FormulaSheet renders notation with native MathML"
                  body="Glyphs and units pass through the ASCII math parser, value-tree functions pass through structured renderers, and the row output uses MathML elements for notation that remains inspectable in HTML."
                />
                <div className="mt-5 border border-gray-300 bg-[#f6f5f1] px-4 py-5">
                  <p className="font-['Plus_Jakarta_Sans'] text-[12px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                    Rendered notation
                  </p>
                  <div className="mt-4 overflow-x-auto bg-white px-4 py-5">
                    <math display="block" className="text-[30px]">
                      <mrow>
                        <msub>
                          <mi>A</mi>
                          <mi>c</mi>
                        </msub>
                        <mo>=</mo>
                        <msub>
                          <mi>w</mi>
                          <mi>c</mi>
                        </msub>
                        <msub>
                          <mi>h</mi>
                          <mi>c</mi>
                        </msub>
                      </mrow>
                    </math>
                  </div>
                </div>
              </div>
              <CodePanel title="MathML Output" language="html">
                {mathmlSnippet}
              </CodePanel>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
