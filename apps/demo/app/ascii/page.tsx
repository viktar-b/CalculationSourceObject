import { AsciiMathView } from '@viktar-b/cso-react';
import {
  asciiMathObservedGroups,
  asciiMathShowcaseSummary,
  type AsciiMathObservedStatus,
  type AsciiMathReviewStatus,
} from '../../src/ascii-math/showcase.ts';
import { SiteNav } from '../SiteNav.tsx';
import { AsciiPlayground } from './AsciiPlayground.tsx';

export const dynamic = 'force-static';
export const revalidate = false;

const statusOrder: readonly AsciiMathReviewStatus[] = [
  'supported',
  'literal',
  'error',
];

const statusLabels: Record<AsciiMathReviewStatus, string> = {
  supported: 'Supported',
  literal: 'Literal fallback',
  error: 'Error fallback',
};

const statusClassNames: Record<AsciiMathReviewStatus, string> = {
  supported: 'border-emerald-600 text-emerald-700',
  literal: 'border-amber-500 text-amber-700',
  error: 'border-rose-600 text-rose-700',
};

const observedStatusOrder: readonly AsciiMathObservedStatus[] = [
  'rendered',
  'error',
];

const observedStatusLabels: Record<AsciiMathObservedStatus, string> = {
  rendered: 'Rendered',
  error: 'Parse error',
};

const observedStatusClassNames: Record<AsciiMathObservedStatus, string> = {
  rendered: 'border-emerald-600 text-emerald-700',
  error: 'border-rose-600 text-rose-700',
};

const groupId = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const formatExpression = (expression: string): string =>
  expression.length > 0 ? expression : '<empty>';

const statusSummary = statusOrder.map((status) => ({
  status,
  count: asciiMathShowcaseSummary.authored[status],
}));

const observedStatusSummary = observedStatusOrder.map((status) => ({
  status,
  count: asciiMathShowcaseSummary.observed[status],
}));

export default function AsciiMathPage() {
  return (
    <main className="min-h-screen bg-[#f6f5f1] text-gray-950">
      <SiteNav active="ascii" />
      <div className="mx-auto flex max-w-[1560px] flex-col gap-7 px-4 py-6 min-md:px-8 min-md:py-8">
        <header className="grid gap-5 border-b border-gray-300 pb-6 min-lg:grid-cols-[1fr_420px] min-lg:items-end">
          <div>
            <h1 className="mt-3 font-['Plus_Jakarta_Sans'] text-[34px] font-semibold leading-tight text-gray-950 min-md:text-[44px]">
              ASCII Variable Review Matrix
            </h1>
            <p className="mt-3 max-w-[760px] font-['Plus_Jakarta_Sans'] text-[14px] leading-6 text-gray-600">
              Review symbol and unit glyph inputs against the same parser path
              used by FormulaSheet rows. Authored expectations and observed
              parser results are reported separately.
            </p>
          </div>

          <dl className="grid grid-cols-3 border border-gray-300 bg-white">
            <div className="border-r border-gray-300 px-4 py-3">
              <dt className="font-['Plus_Jakarta_Sans'] text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                Cases
              </dt>
              <dd className="mt-1 font-mono text-[24px] text-gray-950">
                {asciiMathShowcaseSummary.total}
              </dd>
            </div>
            <div className="border-r border-gray-300 px-4 py-3">
              <dt className="font-['Plus_Jakarta_Sans'] text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                Groups
              </dt>
              <dd className="mt-1 font-mono text-[24px] text-gray-950">
                {asciiMathObservedGroups.length}
              </dd>
            </div>
            <div className="px-4 py-3">
              <dt className="font-['Plus_Jakarta_Sans'] text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                Matches
              </dt>
              <dd className="mt-1 font-mono text-[24px] text-gray-950">
                {asciiMathShowcaseSummary.matches}/
                {asciiMathShowcaseSummary.total}
              </dd>
            </div>
          </dl>
        </header>

        <AsciiPlayground />

        <section className="grid gap-4 min-xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="min-xl:sticky min-xl:top-6 min-xl:self-start">
            <div className="border border-gray-300 bg-white">
              <div className="border-b border-gray-300 px-4 py-3">
                <h2 className="font-['Plus_Jakarta_Sans'] text-[13px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                  Authored expectations
                </h2>
              </div>

              <div className="divide-y divide-gray-200">
                {statusSummary.map(({ status, count }) => (
                  <div
                    key={status}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <span
                      className={`border-l-2 pl-2 font-['Plus_Jakarta_Sans'] text-[13px] font-semibold ${statusClassNames[status]}`}
                    >
                      {statusLabels[status]}
                    </span>
                    <span className="font-mono text-[14px] text-gray-700">
                      {count}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-y border-gray-300 px-4 py-3">
                <h2 className="font-['Plus_Jakarta_Sans'] text-[13px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                  Observed outcomes
                </h2>
              </div>

              <div className="divide-y divide-gray-200">
                {observedStatusSummary.map(({ status, count }) => (
                  <div
                    key={status}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <span
                      className={`border-l-2 pl-2 font-['Plus_Jakarta_Sans'] text-[13px] font-semibold ${observedStatusClassNames[status]}`}
                    >
                      {observedStatusLabels[status]}
                    </span>
                    <span className="font-mono text-[14px] text-gray-700">
                      {count}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-3">
                  <span
                    className={`border-l-2 pl-2 font-['Plus_Jakarta_Sans'] text-[13px] font-semibold ${
                      asciiMathShowcaseSummary.mismatches === 0
                        ? 'border-emerald-600 text-emerald-700'
                        : 'border-rose-600 text-rose-700'
                    }`}
                  >
                    Mismatches
                  </span>
                  <span className="font-mono text-[14px] text-gray-700">
                    {asciiMathShowcaseSummary.mismatches}
                  </span>
                </div>
              </div>
            </div>

            <nav className="mt-4 border border-gray-300 bg-white">
              <div className="border-b border-gray-300 px-4 py-3">
                <h2 className="font-['Plus_Jakarta_Sans'] text-[13px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                  Groups
                </h2>
              </div>
              <div className="divide-y divide-gray-200">
                {asciiMathObservedGroups.map((group) => (
                  <a
                    key={group.title}
                    href={`#${groupId(group.title)}`}
                    className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 font-['Plus_Jakarta_Sans'] text-[13px] text-gray-700 hover:bg-gray-50 hover:text-gray-950"
                  >
                    <span>{group.title}</span>
                    <span className="font-mono text-[12px] text-gray-500">
                      {group.examples.length}
                    </span>
                  </a>
                ))}
              </div>
            </nav>
          </aside>

          <div className="min-w-0 border border-gray-300 bg-white">
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[1200px] table-fixed border-collapse text-left">
                <thead className="bg-gray-950 text-white">
                  <tr>
                    <th className="w-[170px] px-4 py-3 font-['Plus_Jakarta_Sans'] text-[11px] font-semibold uppercase tracking-[0.08em]">
                      Case
                    </th>
                    <th className="w-[210px] px-4 py-3 font-['Plus_Jakarta_Sans'] text-[11px] font-semibold uppercase tracking-[0.08em]">
                      Input
                    </th>
                    <th className="w-[210px] px-4 py-3 font-['Plus_Jakarta_Sans'] text-[11px] font-semibold uppercase tracking-[0.08em]">
                      ASCII Render
                    </th>
                    <th className="w-[180px] px-4 py-3 font-['Plus_Jakarta_Sans'] text-[11px] font-semibold uppercase tracking-[0.08em]">
                      Authored expectation
                    </th>
                    <th className="w-[210px] px-4 py-3 font-['Plus_Jakarta_Sans'] text-[11px] font-semibold uppercase tracking-[0.08em]">
                      Observed outcome
                    </th>
                    <th className="px-4 py-3 font-['Plus_Jakarta_Sans'] text-[11px] font-semibold uppercase tracking-[0.08em]">
                      Review Focus
                    </th>
                  </tr>
                </thead>

                {asciiMathObservedGroups.map((group) => (
                  <tbody key={group.title} id={groupId(group.title)}>
                    <tr>
                      <th
                        colSpan={6}
                        className="scroll-mt-6 border-y border-gray-300 bg-[#ebe7dd] px-4 py-2.5"
                      >
                        <div className="flex flex-col gap-1 min-md:flex-row min-md:items-end min-md:justify-between">
                          <span className="font-['Plus_Jakarta_Sans'] text-[15px] font-semibold text-gray-950">
                            {group.title}
                          </span>
                          <span className="font-['Plus_Jakarta_Sans'] text-[12px] font-normal text-gray-600">
                            {group.description}
                          </span>
                        </div>
                      </th>
                    </tr>

                    {group.examples.map(
                      ({ example, matchesExpectation, observed }) => (
                        <tr
                          key={`${group.title}-${example.label}-${example.expression}`}
                          className="border-b border-gray-200 align-top hover:bg-gray-50"
                          data-authored-status={example.status}
                          data-observed-status={observed.status}
                          data-expectation-match={matchesExpectation}
                        >
                          <td className="px-4 py-4">
                            <div className="font-['Plus_Jakarta_Sans'] text-[13px] font-semibold text-gray-950">
                              {example.label}
                            </div>
                            {example.consumer === 'optional-unit' && (
                              <div className="mt-2 font-mono text-[11px] text-gray-500">
                                Unit preview
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <code className="flex h-[52px] w-[190px] max-w-full items-center overflow-x-auto whitespace-pre border border-gray-200 bg-gray-50 px-2.5 font-mono text-[12px] text-gray-800">
                              {formatExpression(example.expression)}
                            </code>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex h-[52px] w-[190px] max-w-full items-center overflow-x-auto overflow-y-hidden border border-gray-200 bg-white px-2.5">
                              <math className="text-[18px] text-gray-950">
                                <AsciiMathView
                                  expression={example.expression}
                                  identifierMathVariant={
                                    example.consumer === 'optional-unit'
                                      ? 'normal'
                                      : undefined
                                  }
                                  optional={
                                    example.consumer === 'optional-unit'
                                  }
                                />
                              </math>
                            </div>
                          </td>
                          <td className="px-4 py-4 font-['Plus_Jakarta_Sans'] text-[13px] leading-5 text-gray-700">
                            <div
                              className={`mb-2 border-l-2 pl-2 text-[12px] font-semibold ${statusClassNames[example.status]}`}
                            >
                              {statusLabels[example.status]}
                            </div>
                            <div>{example.expected}</div>
                          </td>
                          <td className="px-4 py-4 font-['Plus_Jakarta_Sans'] text-[13px] leading-5 text-gray-700">
                            <div
                              className={`mb-2 border-l-2 pl-2 text-[12px] font-semibold ${observedStatusClassNames[observed.status]}`}
                            >
                              {observedStatusLabels[observed.status]}
                            </div>
                            <div className="font-mono text-[11px] text-gray-600">
                              {observed.status === 'rendered'
                                ? matchesExpectation
                                  ? 'Matches the expected notation'
                                  : 'Differs from the expected notation'
                                : `${observed.diagnostic.code} at ${observed.diagnostic.offset}`}
                            </div>
                            {!matchesExpectation && (
                              <div className="mt-2 text-[12px] font-semibold text-rose-700">
                                Does not match the authored outcome
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 font-['Plus_Jakarta_Sans'] text-[13px] leading-5 text-gray-600">
                            {example.review}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                ))}
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
