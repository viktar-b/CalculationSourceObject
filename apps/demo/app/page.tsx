import { CodeBlock, type CodeLanguage } from './CodePanel.tsx';
import { SiteNav } from './SiteNav.tsx';

export const dynamic = 'force-static';
export const revalidate = false;

const contractSignals = [
  [
    'Variables',
    'ASCII names, rendered symbols, and code identifiers stay tied to one field.',
  ],
  [
    'Formulas',
    'Value-tree nodes keep calculation steps explicit instead of hiding them in code.',
  ],
  [
    'Units',
    'Engineering units travel with the formula so reviewers see the context.',
  ],
  [
    'Context',
    'Descriptions, comments, assumptions, and results remain attached to the calculation.',
  ],
] as const;

const proofItems: readonly {
  readonly body: string;
  readonly language?: CodeLanguage;
  readonly title: string;
}[] = [
  {
    body: `@calculation(id="beam-check", title="Beam Check")
@section(title="Concrete", root=True)
def calculate_beam(b: float, h: float):
    area: Annotated[
        float,
        symbol(
            glyph="A_c",
            unit="mm^2",
            description="Concrete area",
        ),
    ] = b * h

    return {"area": area}`,
    language: 'python',
    title: 'Annotated Python',
  },
  {
    body: `{
  "id": "area",
  "glyph": "A_c",
  "valueTree": {
    "rootKey": "area",
    "result": { "kind": "number", "value": 150000 },
    "nodes": [
      { "key": "b", ... , "symbol": { "id": "b" } },
      { "key": "h", ... , "symbol": { "id": "h" } },
      {
        "key": "area",
        "mode": "FUNCTION",
        "funcSpec": { "id": "fg.multiply" },
        "funcArgs": [{ "key": "b" }, { "key": "h" }]
      }
    ]
  }
}`,
    language: 'json',
    title: 'Formula source',
  },
  {
    body: '',
    title: 'FormulaSheet row',
  },
];

const statusItems = [
  [
    'Available',
    'Zod validation',
    'Strict parsing rejects unknown public-source fields, duplicate ids, duplicate node keys, unresolved references, and unsupported functions.',
  ],
  [
    'Available',
    'FormulaSheet rendering',
    'Validated calculations render as transparent sheet rows with formulas, values, units, descriptions, and comments.',
  ],
  [
    'Available',
    'Python export',
    'The calculation graph exports to dependency-ordered Python from the same validated object.',
  ],
  [
    'Available',
    'FormulaSheet print/PDF',
    'Browser printing and repo PDF tooling keep sheets in the same transparent document lane.',
  ],
  [
    'Available',
    'Annotated Python input',
    'Author calculations in constrained Python, parse them into the contract, then export sheets and code through repo tooling.',
  ],
  [
    'Planned',
    'C# / TypeScript export',
    'Use the contract for future NuGet and npm language targets.',
  ],
  [
    'Planned',
    'Package-manager hosting',
    'Host reusable calculation packages natively on PyPI/pip, npm, and NuGet.',
  ],
] as const;

const HomeInfoCard = ({
  eyebrow,
  title,
  body,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly body?: string;
}) => (
  <div className="border border-gray-300 px-4 py-3 font-['Plus_Jakarta_Sans']">
    {eyebrow && (
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
        {eyebrow}
      </p>
    )}
    <h3
      className={`font-semibold text-gray-950 ${
        eyebrow ? 'mt-2 text-[15px]' : 'text-[16px]'
      }`}
    >
      {title}
    </h3>
    {body && <p className="mt-2 text-[13px] leading-5 text-gray-600">{body}</p>}
  </div>
);

const FormulaSheetProofRow = () => (
  <div className="px-4 py-4 font-['Plus_Jakarta_Sans']">
    <div className="min-w-0">
      <h4 className="text-[16px] font-semibold text-black">Calculations</h4>
      <div className="mt-2 border-t border-gray-300">
        <div className="grid grid-cols-[120px_minmax(0,1fr)] border-b border-gray-300">
          <div className="py-[5px] pr-3 text-[12px] text-black/50">
            Description
          </div>
          <div className="py-[5px] text-[12px] text-black/50">
            Concrete area
          </div>
        </div>
        <div className="grid grid-cols-[120px_minmax(0,1fr)] border-b border-gray-300">
          <div className="py-[5px] pr-3 text-[12px] text-black/50">
            Symbol Name
          </div>
          <div className="py-[5px] font-['KaTeX_Main'] text-[16.335px]">
            <math>
              <msub>
                <mi>A</mi>
                <mi>c</mi>
              </msub>
            </math>
          </div>
        </div>
        <div className="grid grid-cols-[120px_minmax(0,1fr)] border-b border-gray-300">
          <div className="py-[5px] pr-3 text-[12px] text-black/50">Formula</div>
          <div className="py-[5px] font-['KaTeX_Main'] text-[16.335px]">
            <math>
              <msub>
                <mi>A</mi>
                <mi>c</mi>
              </msub>
              <mo>=</mo>
              <mi>b</mi>
              <mi>h</mi>
            </math>
          </div>
        </div>
        <div className="grid grid-cols-[120px_minmax(0,1fr)] border-b border-gray-300">
          <div className="py-[5px] pr-3 text-[12px] text-black/50">Value</div>
          <div className="py-[5px] font-['KaTeX_Main'] text-[16.335px]">
            150000
          </div>
        </div>
        <div className="grid grid-cols-[120px_minmax(0,1fr)] border-b border-gray-300">
          <div className="py-[5px] pr-3 text-[12px] text-black/50">Unit</div>
          <div className="py-[5px]">
            <math>
              <msup>
                <mi>mm</mi>
                <mn>2</mn>
              </msup>
            </math>
          </div>
        </div>
        <div className="grid grid-cols-[120px_minmax(0,1fr)]">
          <div className="py-[5px] pr-3 text-[12px] text-black/50">Comment</div>
          <div className="py-[5px] text-[12px] text-black/50">
            Area from section width and depth
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f6f5f1] text-gray-950">
      <SiteNav active="home" />
      <div className="mx-auto flex max-w-[1560px] flex-col gap-7 px-4 py-6 min-md:px-8 min-md:py-8">
        <header className="grid gap-5 border-b border-gray-300 pb-6 min-lg:grid-cols-[minmax(0,1fr)_470px] min-lg:items-stretch">
          <div className="min-lg:flex min-lg:items-center">
            <h1 className="max-w-[860px] font-['Plus_Jakarta_Sans'] text-[34px] font-semibold leading-tight text-gray-950 min-md:text-[48px]">
              Make Back-End Calculation Logic{' '}
              <span className="inline-block bg-gray-950 px-2 text-white">
                Transparent
              </span>{' '}
              To Everyone
            </h1>
          </div>

          <section
            aria-label="Calculation object output flow"
            className="border border-gray-300 bg-white p-4 font-['Plus_Jakarta_Sans']"
          >
            <h2 className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
              From calculation logic to trusted outputs
            </h2>

            <div className="border-2 border-gray-950 px-4 py-3 text-center">
              <p className="text-[18px] font-semibold leading-snug text-gray-950">
                Source of calculation logic
              </p>
              <p className="mt-1 text-[12px] leading-5 text-gray-500">
                CalculationSourceObject JSON and annotated Python.
              </p>
            </div>

            <div
              aria-hidden="true"
              className="grid h-7 place-items-center text-[20px] leading-none text-gray-400"
            >
              &darr;
            </div>

            <div className="border-2 border-gray-950 px-4 py-3 text-center">
              <p className="text-[18px] font-semibold leading-snug text-gray-950">
                Zod validation
              </p>
              <p className="mt-1 text-[12px] leading-5 text-gray-500">
                Validate symbols, formulas, units, and results.
              </p>
            </div>

            <div
              aria-hidden="true"
              className="grid h-7 place-items-center text-[20px] leading-none text-gray-400"
            >
              &darr;
            </div>

            <div className="grid place-items-center border-2 border-gray-950 px-5 py-4 text-center">
              <div>
                <p className="text-[18px] font-semibold leading-snug text-gray-950">
                  CalculationSourceObject
                </p>
                <p className="mt-2 text-[12px] leading-5 text-gray-600">
                  symbols · formulas · units · descriptions · results
                </p>
              </div>
            </div>

            <div className="mt-1 grid gap-3 min-sm:grid-cols-[1.15fr_0.85fr]">
              <div className="grid gap-2">
                <div
                  aria-hidden="true"
                  className="grid h-7 place-items-center text-[20px] leading-none text-gray-400"
                >
                  &darr;
                </div>
                <div className="grid place-items-center border-2 border-gray-950 px-3 py-3 text-center">
                  <p className="text-[18px] font-semibold leading-snug text-gray-950">
                    FormulaSheet print/PDF
                  </p>
                </div>
              </div>
              <div className="grid gap-2">
                <div
                  aria-hidden="true"
                  className="grid h-7 place-items-center text-[20px] leading-none text-gray-400"
                >
                  &darr;
                </div>
                <div className="grid place-items-center border-2 border-gray-950 px-3 py-3 text-center">
                  <p className="text-[18px] font-semibold leading-snug text-gray-950">
                    Any Code Export
                  </p>
                </div>
              </div>
            </div>
          </section>
        </header>

        <section className="border border-gray-300 bg-white px-4 py-5 min-md:px-6">
          <p className="font-['Plus_Jakarta_Sans'] text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
            Proof
          </p>
          <h2 className="mt-2 font-['Plus_Jakarta_Sans'] text-[24px] font-semibold leading-tight text-gray-950">
            Annotated Python becomes formula source
          </h2>
          <p className="mt-3 max-w-[820px] font-['Plus_Jakarta_Sans'] text-[14px] leading-6 text-gray-600">
            The Python authoring layer keeps the calculation executable while
            giving the exporter enough metadata to build a transparent formula
            graph for review.
          </p>
          <div className="mt-5 grid gap-3 min-xl:grid-cols-3">
            {proofItems.map(({ body, language, title }) => (
              <div key={title} className="min-w-0 border border-gray-300">
                <h3 className="border-b border-gray-300 px-4 py-3 font-mono text-[13px] text-gray-950">
                  {title}
                </h3>
                {language ? (
                  <CodeBlock language={language}>{body}</CodeBlock>
                ) : (
                  <FormulaSheetProofRow />
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="border border-gray-300 bg-white px-4 py-5 min-md:px-6">
          <p className="font-['Plus_Jakarta_Sans'] text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
            Why It Matters
          </p>
          <h2 className="mt-2 font-['Plus_Jakarta_Sans'] text-[24px] font-semibold leading-tight text-gray-950">
            A small contract for real calculations
          </h2>
          <p className="mt-3 max-w-[760px] font-['Plus_Jakarta_Sans'] text-[14px] leading-6 text-gray-600">
            FormulaSheet keeps the calculation object deliberately compact:
            enough structure to validate engineering logic, make it inspectable,
            and translate it without dragging along application workspace
            baggage.
          </p>
          <div className="mt-5 grid gap-3 min-md:grid-cols-2 min-xl:grid-cols-4">
            {contractSignals.map(([title, body]) => (
              <HomeInfoCard key={title} title={title} body={body} />
            ))}
          </div>
        </section>

        <section className="border border-gray-300 bg-white px-4 py-5 min-md:px-6">
          <p className="font-['Plus_Jakarta_Sans'] text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
            Current status
          </p>
          <h2 className="mt-2 font-['Plus_Jakarta_Sans'] text-[24px] font-semibold leading-tight text-gray-950">
            What works today
          </h2>
          <div className="mt-5 grid gap-3 min-md:grid-cols-2 min-xl:grid-cols-3">
            {statusItems.map(([status, title, body]) => (
              <HomeInfoCard
                key={title}
                eyebrow={status}
                title={title}
                body={body}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
