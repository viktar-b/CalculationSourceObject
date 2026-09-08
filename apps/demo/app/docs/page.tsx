import { CodePanel } from '../CodePanel.tsx';
import { SiteNav } from '../SiteNav.tsx';
import {
  pipelineSteps,
  pythonSnippet,
  sourceSnippet,
} from '../calculation-story.ts';

export const dynamic = 'force-static';
export const revalidate = false;

const contentsLinks = [
  ['Motivation', '#motivation'],
  ['Authoring layer', '#authoring-layer'],
  ['Source object', '#source-object'],
  ['FormulaSheet', '#formulasheet'],
  ['Prepared documents', '#prepared-documents'],
  ['Printing and checks', '#printing'],
  ['Python code generation', '#python-codegen'],
  ['MathML', '#mathml'],
] as const;

const formulaSheetSnippet = `import {
  parseCalculationSourceJson,
  createSheetFromCalculationSourceObject,
} from '@viktar-b/cso-core';
import { FormulaSheet } from '@viktar-b/cso-react';
import '@viktar-b/cso-react/style.css';

export function CalculationSheet({ json }: { json: unknown }) {
  const source = parseCalculationSourceJson(json);
  const calculation = createSheetFromCalculationSourceObject(source, {
    id: 'calculation-sheet',
    label: source.title,
  });
  return <FormulaSheet sheet={calculation.sheet} />;
}`;

const preparedDocumentSnippet = `import {
  type ExecutionPayload,
  type ResolvedAsset,
  verifyExecution,
} from '@viktar-b/cso-core';
import {
  prepareExecutionDocument,
  PreparedFormulaSheet,
} from '@viktar-b/cso-react';
import '@viktar-b/cso-react/style.css';

// The host supplies captured execution and validated assets.
export function ExecutionDocument({ execution, assets }: {
  execution: ExecutionPayload;
  assets: readonly ResolvedAsset[];
}) {
  const report = verifyExecution({ execution });
  if (!report.ok) throw new Error('Execution verification failed');
  const document = prepareExecutionDocument({ execution, assets });
  return <PreparedFormulaSheet document={document} />;
}`;

const pythonCodegenSnippet = `import {
  type SheetDocument,
  createPythonFromSheetDocument,
} from '@viktar-b/cso-core';

export function generatePython(sheet: SheetDocument) {
  return createPythonFromSheetDocument(sheet);
}`;

const mathmlSnippet = `<math display="block">
  <mrow>
    <msub>
      <mi>A</mi>
      <mi>rect</mi>
    </msub>
    <mo>=</mo>
    <msub><mi>w</mi><mi>pan</mi></msub>
    <msub><mi>h</mi><mi>pan</mi></msub>
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
              Developer docs
            </p>
            <h1 className="mt-3 max-w-[920px] font-['Plus_Jakarta_Sans'] text-[34px] font-semibold leading-tight text-gray-950 min-md:text-[44px]">
              From constrained Python to reviewable documents
            </h1>
            <p className="mt-4 max-w-[860px] font-['Plus_Jakarta_Sans'] text-[15px] leading-7 text-gray-600">
              Capture source and execution observations, check documented
              formulas, then prepare a document for review. Source-to-document
              consistency, independent numerical agreement and visual inspection
              each answer a different question. Human engineering approval
              remains separate.
            </p>
          </div>

          <div className="grid grid-cols-3 border border-gray-300 bg-white">
            {[
              ['Input', 'Python'],
              ['Contract', 'CSO'],
              ['Display', 'MathML'],
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
          className="grid border border-gray-300 bg-white min-xl:grid-cols-5"
        >
          {pipelineSteps.map((step, index) => (
            <div
              key={step.title}
              className="relative border-b border-gray-300 px-4 py-4 last:border-b-0 min-xl:border-r min-xl:border-b-0 min-xl:last:border-r-0"
            >
              <p className="font-mono text-[11px] uppercase text-gray-500">
                Step {index + 1}
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
                  className="absolute right-3 top-4 hidden font-mono text-[18px] text-gray-300 min-xl:block"
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
                title="Keep calculations inspectable"
                body="A CalculationSourceObject records formulas, symbols, units, explanations, ordered content and source metadata. FormulaSheet is its reviewable mathematical presentation, not the complete calculation source."
              />
            </section>

            <section
              id="authoring-layer"
              className="grid scroll-mt-6 gap-4 min-lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
            >
              <div className="border border-gray-300 bg-white px-4 py-5 min-md:px-6">
                <SectionHeading
                  eyebrow="Authoring layer"
                  title="Calculation inputs carry reusable metadata"
                  body="Signature annotations define inputs. Shared Annotated aliases keep their metadata reusable. This panel-area fragment uses the maintained two-panel notation: pan means panel and rect means rectangle. It is illustration-only, not a captured execution or the full maintained calculation."
                />
              </div>
              <CodePanel
                title="Annotated Python illustration"
                language="python"
              >
                {pythonSnippet}
              </CodePanel>
            </section>

            <section
              id="source-object"
              className="grid scroll-mt-6 gap-4 min-lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
            >
              <div className="border border-gray-300 bg-white px-4 py-5 min-md:px-6">
                <SectionHeading
                  eyebrow="Source object"
                  title="Capture and execute produce CSO plus evidence"
                  body="The captured execution pairs a CalculationSourceObject with source hashes, input bindings, assignment observations and public outputs. Core verifyExecution checks source-to-document consistency; execution success alone is not a verification pass. Legacy export and dev-export remain unverified development paths. The adjacent JSON is a formula fragment with illustrative values, not a complete CSO or execution record."
                />
              </div>
              <CodePanel title="CSO fragment" language="json">
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
                  body="FormulaSheet receives a sheet model derived from CalculationSourceObject. Its columns show descriptions, symbols, values, units and comments, with formula and substitution details. This mathematical projection omits figures and standalone prose; rendering does not verify supplied values."
                />
              </div>
              <CodePanel title="Mathematical sheet rendering" language="tsx">
                {formulaSheetSnippet}
              </CodePanel>
            </section>

            <section
              id="prepared-documents"
              className="grid scroll-mt-6 gap-4 min-lg:grid-cols-2"
            >
              <div className="border border-gray-300 bg-white px-4 py-5 min-md:px-6">
                <SectionHeading
                  eyebrow="Prepared documents"
                  title="Preserve ordered engineering content"
                  body="prepareExecutionDocument binds supplied execution and captured assets to a PreparedDocument. PreparedFormulaSheet displays its ordered inputs, formulas, prose, figures and results. The host captures assets; React does not fetch files or execute Python. The example checks consistency without supplying an independent reference case, so it establishes no independent agreement."
                />
              </div>
              <CodePanel title="Prepare a supplied execution" language="tsx">
                {preparedDocumentSnippet}
              </CodePanel>
            </section>

            <section
              id="printing"
              className="scroll-mt-6 border border-gray-300 bg-white px-4 py-5 min-md:px-6"
            >
              <SectionHeading
                eyebrow="Printing and checks"
                title="Browser print and verified PDF publication"
                body="printFormulaSheet is development browser printing. Its boolean result means the print request was accepted; deferred failures use onError. It does not run verification or publish CLI evidence. cso pdf verifies a captured execution and uses that same execution for document preparation and PDF publication, with evidence by default."
              />
              <p className="mt-4 text-[14px] leading-6 text-gray-600">
                Optional independent references compare separately established
                expected values bound to the source, function and resolved
                inputs. No matching case means not applicable, not a pass.
                Document preservation accounts for every input, formula,
                explanation, figure, unit and result. Inspect every PDF page for
                missing content, notation, clipping and pagination, and bind
                findings to the exact PDF bytes. Generation leaves inspection
                pending and establishes no human engineering approval.
              </p>
            </section>

            <section
              id="python-codegen"
              className="grid scroll-mt-6 gap-4 min-lg:grid-cols-2"
            >
              <div className="border border-gray-300 bg-white px-4 py-5 min-md:px-6">
                <SectionHeading
                  eyebrow="Python code generation"
                  title="Generate source from a validated sheet"
                  body="Core createPythonFromSheetDocument orders assignments by dependency and generates Python. It does not execute or verify the generated code. C# and TypeScript export and package-manager hosting remain planned."
                />
              </div>
              <CodePanel title="Core code generation" language="tsx">
                {pythonCodegenSnippet}
              </CodePanel>
            </section>

            <section
              id="mathml"
              className="grid scroll-mt-6 gap-4 min-lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
            >
              <div className="border border-gray-300 bg-white px-4 py-5 min-md:px-6">
                <SectionHeading
                  eyebrow="MathML notation"
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
                          <mi>rect</mi>
                        </msub>
                        <mo>=</mo>
                        <msub>
                          <mi>w</mi>
                          <mi>pan</mi>
                        </msub>
                        <msub>
                          <mi>h</mi>
                          <mi>pan</mi>
                        </msub>
                      </mrow>
                    </math>
                  </div>
                </div>
              </div>
              <CodePanel title="MathML output" language="html">
                {mathmlSnippet}
              </CodePanel>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
