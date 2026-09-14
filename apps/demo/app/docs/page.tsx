import { SiteNav } from '../SiteNav.tsx';

export const dynamic = 'force-static';
export const revalidate = false;

const workflowSteps = [
  {
    id: 'write',
    title: 'Agent writes',
    summary: 'Turn your requirements into a calculation.',
    detailTitle: 'Start with the engineering problem',
    paragraphs: [
      'You give the agent the problem, inputs, units and assumptions. The agent writes an annotated calculation in Python, with named quantities, formulas, explanations and results.',
      'The calculation source contains the steps that will appear in the document. When you change a formula, the agent updates that source.',
    ],
    output: 'A calculation source you can inspect and change.',
  },
  {
    id: 'verify',
    title: 'Agent verifies',
    summary: 'Check that the documented formulas match the calculated results.',
    detailTitle: 'Check the calculation before making the document',
    paragraphs: [
      'The agent runs the calculation for your inputs. The verifier evaluates the documented formulas and compares their values with the Python results. This is source-to-document consistency. The agent investigates failed checks and fixes the source before continuing.',
      'If you have an independent numerical reference case, the agent can also compare against its expected results. A consistency check alone does not establish that the engineering method fits your problem.',
    ],
    output:
      'A check report that states what passed, failed or was not checked.',
  },
  {
    id: 'compile',
    title: 'Agent compiles',
    summary:
      'Assemble the calculation and its results into a complete document.',
    detailTitle: 'Build the document from the calculation',
    paragraphs: [
      'Here, compile means assemble the calculation document. The agent uses the calculation source and its results to build the document, with inputs, formulas, substitutions, units, explanations and figures in source order.',
      'This happens before the document appears on screen or goes to print. PDF generation includes this step.',
    ],
    output: 'A document that shows how the calculation reaches its results.',
  },
  {
    id: 'print',
    title: 'Agent prints',
    summary: 'Create a PDF and check that every page is readable.',
    detailTitle: 'Make the PDF for review',
    paragraphs: [
      'The agent uses the PDF command to verify the calculation, compile the document and save it as a PDF. By default, the command also saves the check report and supporting records with the output.',
      'Before handing it over, the agent must inspect every page for missing content, unreadable formulas, clipped figures and poor page breaks. You can read the PDF on screen or print a paper copy.',
    ],
    output: 'A PDF and its check records, ready for human review.',
  },
  {
    id: 'review',
    title: 'Human reviews',
    summary:
      'Decide whether the assumptions, method and results fit the problem.',
    detailTitle: 'Review the engineering work',
    paragraphs: [
      'An engineer reads the document and checks the inputs, assumptions, method, units and results against the actual problem. The formulas and explanations make the reasoning available for that review.',
      'If something needs to change, send it back to the agent. The agent updates the source, repeats the checks and makes a new PDF for review. Record your review against the PDF version you checked.',
    ],
    output: 'A human review decision, with any changes needed.',
  },
  {
    id: 'export',
    title: 'Export',
    summary: 'Reuse the reviewed calculation in C# and other languages.',
    detailTitle: 'Use the calculation in other software',
    paragraphs: [
      'Planned exports would turn the reviewed calculation into code for C#, TypeScript and other languages. This would let you use the calculation in another application.',
      'C# and TypeScript export are not available yet. Python code generation is available now. Exported code still needs execution and checks in its target application.',
    ],
    output: 'Code for use in other applications.',
  },
] as const;

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[#f6f5f1] text-gray-950">
      <SiteNav active="docs" />
      <div className="mx-auto max-w-[1320px] px-4 py-6 min-md:px-8 min-md:py-10">
        <header className="max-w-[880px]">
          <p className="font-['Plus_Jakarta_Sans'] text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
            How to use CalculationSourceObject
          </p>
          <h1 className="mt-3 font-['Plus_Jakarta_Sans'] text-[34px] font-semibold leading-tight min-md:text-[44px]">
            An agent writes the calculation. You review the work.
          </h1>
          <p className="mt-4 max-w-[760px] text-[16px] leading-7 text-gray-600">
            Use CalculationSourceObject with your coding agent. The agent writes
            and checks the calculation, builds the document and makes a PDF. You
            can then read the inputs, formulas, assumptions and results, and
            decide whether the calculation is suitable.
          </p>
        </header>

        <nav aria-label="Calculation workflow" className="mt-8">
          <ol className="grid grid-cols-1 border-l border-t border-gray-300 min-md:grid-cols-3 min-xl:grid-cols-6">
            {workflowSteps.map((step, index) => (
              <li
                key={step.id}
                className="min-w-0 border-b border-r border-gray-300 bg-white"
              >
                <a
                  href={`#${step.id}`}
                  className="block h-full p-4 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gray-950"
                >
                  <div className="flex h-6 items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-gray-500">
                      {index + 1}
                    </span>
                    {step.id === 'export' ? (
                      <span className="border border-gray-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                        Planned
                      </span>
                    ) : (
                      <span aria-hidden="true" className="text-gray-400">
                        →
                      </span>
                    )}
                  </div>
                  <p className="mt-3 font-['Plus_Jakarta_Sans'] text-[16px] font-semibold">
                    {step.title}
                  </p>
                  <p className="mt-2 text-[13px] leading-5 text-gray-600">
                    {step.summary}
                  </p>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-8 border border-gray-300 bg-white">
          {workflowSteps.map((step, index) => (
            <section
              id={step.id}
              key={step.id}
              aria-labelledby={`${step.id}-heading`}
              className="grid scroll-mt-6 gap-5 border-b border-gray-300 px-5 py-7 last:border-b-0 min-md:grid-cols-[200px_minmax(0,1fr)] min-md:gap-8 min-md:px-8 min-md:py-8"
            >
              <div>
                <p className="font-mono text-[12px] text-gray-500">
                  Step {index + 1}
                  {step.id === 'export' && ' · Planned'}
                </p>
                <h2
                  id={`${step.id}-heading`}
                  className="mt-2 font-['Plus_Jakarta_Sans'] text-[23px] font-semibold leading-tight"
                >
                  {step.title}
                </h2>
              </div>
              <div className="max-w-[740px]">
                <h3 className="font-['Plus_Jakarta_Sans'] text-[18px] font-semibold leading-6">
                  {step.detailTitle}
                </h3>
                {step.paragraphs.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="mt-3 text-[15px] leading-7 text-gray-600"
                  >
                    {paragraph}
                  </p>
                ))}
                <p className="mt-5 border-l-2 border-gray-300 pl-4 text-[14px] leading-6 text-gray-800">
                  <span className="font-semibold">
                    {step.id === 'export' ? 'Planned output: ' : 'You get: '}
                  </span>
                  {step.output}
                </p>
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
