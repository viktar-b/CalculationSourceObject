import {
  type CalculationDefinition,
  CalculationDefinitionSchema,
} from '@cs-object/core';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const CatalogSchema = z.array(z.object({ id: z.string(), title: z.string() }));
type Report = z.infer<typeof CatalogSchema>[number];

const CheckSchema = z.object({ status: z.string() });
const RunSchema = z.object({
  id: z.uuid(),
  outputs: z.record(z.string(), z.number()),
  checks: z.object({
    sourceToDocumentConsistency: CheckSchema,
    independentReferenceAgreement: CheckSchema,
    rendering: CheckSchema,
    visualInspection: CheckSchema,
  }),
  html: z.string(),
  pdf: z.string(),
  evidence: z.string(),
});
type Run = z.infer<typeof RunSchema>;

function apiPath(report: Report, route: string): string {
  if (!route.startsWith('/api/'))
    throw new Error('Unexpected calculation API path');
  return `/api/reports/${encodeURIComponent(report.id)}${route.slice(4)}`;
}

async function readJson(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = z
      .object({
        error: z.string(),
        diagnostics: z.array(z.object({ message: z.string() })).optional(),
      })
      .safeParse(body);
    throw new Error(
      parsed.success
        ? [
            parsed.data.error,
            ...(parsed.data.diagnostics ?? []).map(({ message }) => message),
          ].join('\n')
        : `Request failed (${response.status})`,
    );
  }
  return body;
}

function numericText(value: number): string {
  return Object.is(value, -0) ? '-0.0' : String(value);
}

function numericJson(value: number): string {
  if (Object.is(value, -0)) return '-0.0';
  if (Number.isInteger(value) && !Number.isSafeInteger(value))
    return value.toExponential();
  return String(value);
}

function requestBody(
  definition: CalculationDefinition,
  values: Record<string, string>,
): string {
  const entries = definition.inputs.map((input) => {
    const raw = values[input.name]?.trim() ?? '';
    const number = Number(raw);
    if (!raw || !Number.isFinite(number))
      throw new Error(`Enter a finite value for ${input.name}`);
    if (input.numericType === 'int' && !Number.isSafeInteger(number))
      throw new Error(`${input.name} requires a safe integer`);
    return `${JSON.stringify(input.name)}:${numericJson(number)}`;
  });
  return `{"inputs":{${entries.join(',')}}}`;
}

type ShellFragment = {
  text: string;
  kind: 'command' | 'option' | 'url' | 'string' | 'plain';
};

const syntaxColor = {
  command: 'font-semibold text-primary',
  option: 'text-sky-700 dark:text-sky-300',
  url: 'text-violet-700 dark:text-violet-300',
  string: 'text-amber-700 dark:text-amber-300',
  plain: 'text-foreground',
} satisfies Record<ShellFragment['kind'], string>;

function curlPreview(
  report: Report | undefined,
  definition: CalculationDefinition | undefined,
  values: Record<string, string>,
):
  | { kind: 'ready'; command: string; fragments: ShellFragment[] }
  | { kind: 'unavailable'; message: string } {
  if (!report || !definition)
    return {
      kind: 'unavailable',
      message: 'Load a report to show the command.',
    };
  try {
    const body = requestBody(definition, values).replaceAll("'", "'\\''");
    const fragments: ShellFragment[] = [
      { kind: 'command', text: 'curl' },
      { kind: 'plain', text: ' ' },
      { kind: 'option', text: '-sS --fail-with-body' },
      { kind: 'plain', text: ' \\\n  ' },
      {
        kind: 'url',
        text: `${location.origin}${apiPath(report, '/api/calculate')}`,
      },
      { kind: 'plain', text: ' \\\n  ' },
      { kind: 'option', text: '-H' },
      { kind: 'plain', text: ' ' },
      { kind: 'string', text: "'Content-Type: application/json'" },
      { kind: 'plain', text: ' \\\n  ' },
      { kind: 'option', text: '-d' },
      { kind: 'plain', text: ' ' },
      { kind: 'string', text: `'${body}'` },
    ];
    return {
      kind: 'ready',
      command: fragments.map(({ text }) => text).join(''),
      fragments,
    };
  } catch {
    return {
      kind: 'unavailable',
      message: 'Enter valid input values to show the command.',
    };
  }
}

const visibleChecks = [
  ['sourceToDocumentConsistency', 'Source-to-document'],
  ['independentReferenceAgreement', 'Independent reference'],
  ['rendering', 'PDF layout'],
  ['visualInspection', 'Human inspection'],
] as const satisfies ReadonlyArray<readonly [keyof Run['checks'], string]>;

function checkText(status: string | undefined): string {
  if (status === undefined) return 'Not run';
  if (status === 'passed') return 'Passed';
  if (status === 'failed') return 'Failed';
  if (status === 'pending' || status === 'not_applicable') return 'WIP';
  return status;
}

const previewStyles = `
  @media screen {
    html, body { min-height: 100%; background: #fff; }
    body.cso-standalone-report [data-formula-sheet-print-root] {
      box-sizing: border-box;
      width: 100%;
      min-height: 141.4286vw;
      margin: 0;
      padding: 10mm;
      background: #fff;
    }
    body.cso-standalone-report [data-formula-sheet] {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      padding: 0;
      margin: 0;
    }
  }
`;

function ReportPreview({ htmlUrl }: { htmlUrl?: string }) {
  const [html, setHtml] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!htmlUrl) {
      setHtml(undefined);
      setError(undefined);
      return;
    }
    const controller = new AbortController();
    setHtml(undefined);
    setError(undefined);
    void (async () => {
      try {
        const response = await fetch(htmlUrl, { signal: controller.signal });
        if (!response.ok)
          throw new Error(`Preview failed (${response.status})`);
        const document = new DOMParser().parseFromString(
          await response.text(),
          'text/html',
        );
        const style = document.createElement('style');
        style.textContent = previewStyles;
        document.head.append(style);
        if (!controller.signal.aborted)
          setHtml(`<!doctype html>${document.documentElement.outerHTML}`);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Preview failed');
      }
    })();
    return () => controller.abort();
  }, [htmlUrl]);

  return (
    <section
      aria-label="Formula sheet preview"
      className="flex min-h-[calc(100dvh-4rem)] min-w-0 justify-center overflow-x-auto bg-muted/40 p-4 sm:p-8"
    >
      {html ? (
        <iframe
          id="report"
          title="Formula sheet"
          sandbox=""
          src={htmlUrl}
          srcDoc={html}
          className="block aspect-[210/297] h-auto w-full max-w-[794px] shrink-0 border-0 bg-white shadow-lg"
        />
      ) : (
        <div className="flex min-h-[600px] items-center text-sm text-muted-foreground">
          {error ??
            (htmlUrl
              ? 'Loading formula sheet…'
              : 'Calculate to preview the report.')}
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report>();
  const [definition, setDefinition] = useState<CalculationDefinition>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [run, setRun] = useState<Run>();
  const [status, setStatus] = useState('Loading calculation…');
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [activeSheet, setActiveSheet] = useState<'inputs' | 'api' | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<{
    kind: 'copied' | 'failed';
    command: string;
  }>();
  const revision = useRef(0);
  const curl = curlPreview(selected, definition, values);

  async function copyCurl() {
    if (curl.kind !== 'ready') return;
    try {
      await navigator.clipboard.writeText(curl.command);
      setCopyFeedback({ kind: 'copied', command: curl.command });
    } catch {
      setCopyFeedback({ kind: 'failed', command: curl.command });
    }
  }

  async function calculate(
    report: Report,
    activeDefinition: CalculationDefinition,
    activeValues: Record<string, string>,
  ) {
    const started = ++revision.current;
    setBusy(true);
    setRun(undefined);
    setStatus('Calculating…');
    setProblem(undefined);
    try {
      const next = RunSchema.parse(
        await readJson(
          await fetch(apiPath(report, '/api/runs'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody(activeDefinition, activeValues),
          }),
        ),
      );
      if (started !== revision.current) return;
      setRun(next);
      setStatus('Report ready. Review its assumptions and results.');
    } catch (error) {
      if (started === revision.current) {
        const message =
          error instanceof Error ? error.message : 'Calculation failed';
        setStatus(message);
        setProblem(message);
      }
    } finally {
      if (started === revision.current) setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const catalog = CatalogSchema.parse(
          await readJson(await fetch('/api/reports')),
        );
        if (!active) return;
        setReports(catalog);
        setSelected(catalog[0]);
        if (catalog.length === 0) {
          setStatus('No runnable reports are configured.');
          setProblem('No runnable reports are configured.');
        }
      } catch (error) {
        if (active) {
          const message =
            error instanceof Error ? error.message : 'Cannot load report list';
          setStatus(message);
          setProblem(message);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    revision.current += 1;
    setDefinition(undefined);
    setValues({});
    setRun(undefined);
    setBusy(false);
    setStatus(`Loading ${selected.title}…`);
    setProblem(undefined);
    void (async () => {
      try {
        const parsed = CalculationDefinitionSchema.parse(
          await readJson(await fetch(apiPath(selected, '/api/definition'))),
        );
        if (!active) return;
        setDefinition(parsed);
        const defaults = Object.fromEntries(
          parsed.inputs.map((input) => [
            input.name,
            input.default === undefined ? '' : numericText(input.default),
          ]),
        );
        setValues(defaults);
        setStatus('Enter inputs and calculate.');
        if (parsed.inputs.every((input) => input.default !== undefined))
          void calculate(selected, parsed, defaults);
      } catch (error) {
        if (active) {
          const message =
            error instanceof Error ? error.message : 'Cannot load calculation';
          setStatus(message);
          setProblem(message);
        }
      }
    })();
    return () => {
      active = false;
      revision.current += 1;
    };
  }, [selected]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (definition && selected) void calculate(selected, definition, values);
  }
  function edit(name: string, value: string) {
    revision.current += 1;
    setValues((current) => ({ ...current, [name]: value }));
    setRun(undefined);
    setBusy(false);
    setStatus('Inputs changed. Calculate again to update the report.');
    setProblem(undefined);
  }
  async function downloadPdf() {
    if (!run || !selected) return;
    const current = run;
    const report = selected;
    const started = revision.current;
    const refreshChecks = async () => {
      const latest = await readJson(
        await fetch(apiPath(report, `/api/runs/${current.id}`)),
      );
      const checks = RunSchema.omit({
        html: true,
        pdf: true,
        evidence: true,
      }).parse(latest).checks;
      if (started === revision.current) setRun({ ...current, checks });
    };
    setBusy(true);
    setStatus('Preparing PDF…');
    setProblem(undefined);
    try {
      const response = await fetch(current.pdf);
      if (!response.ok) await readJson(response);
      const url = URL.createObjectURL(await response.blob());
      if (started !== revision.current) {
        URL.revokeObjectURL(url);
        return;
      }
      const link = document.createElement('a');
      link.href = url;
      link.download = 'calculation.pdf';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      await refreshChecks();
      if (started !== revision.current) return;
      setStatus('PDF ready. Human review remains pending.');
    } catch (error) {
      if (started === revision.current) {
        try {
          await refreshChecks();
        } catch {
          // Keep the original PDF error if the run is unavailable.
        }
        if (started === revision.current) {
          const message = error instanceof Error ? error.message : 'PDF failed';
          setStatus(message);
          setProblem(message);
          setActiveSheet('inputs');
        }
      }
    } finally {
      if (started === revision.current) setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-60 flex min-h-16 min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-background px-4 py-2 sm:flex-nowrap sm:px-6 sm:py-0">
        <span className="shrink-0 font-heading text-lg font-semibold">CSO</span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                aria-label="Choose report"
                disabled={reports.length === 0}
                className="min-w-0 max-w-[calc(100vw-6rem)] justify-between gap-2 sm:max-w-[min(42vw,24rem)]"
              />
            }
          >
            <span className="truncate">
              {selected?.title ?? 'Select report'}
            </span>
            <span aria-hidden="true" className="text-muted-foreground">
              ⌄
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={16}
            className="w-max! min-w-64! max-w-[calc(100vw-2rem)] bg-popover!"
          >
            {reports.map((report) => (
              <DropdownMenuItem
                key={report.id}
                onClick={() => {
                  setSelected(report);
                  setActiveSheet(null);
                }}
              >
                {report.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex w-full items-center justify-end gap-2 sm:w-auto sm:shrink-0">
          <Button variant="ghost" onClick={() => setActiveSheet('api')}>
            API
          </Button>
          <Button variant="outline" onClick={() => setActiveSheet('inputs')}>
            Inputs
          </Button>
          <Button
            id="pdf"
            disabled={!run || busy}
            onClick={() => void downloadPdf()}
          >
            {run?.checks.visualInspection.status === 'pending'
              ? 'PDF · review pending'
              : 'PDF'}
          </Button>
        </div>
      </header>
      <p id="status" role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      {problem && (
        <p
          id="problem"
          role="alert"
          className="mx-auto mt-4 max-w-3xl whitespace-pre-line rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {problem}
        </p>
      )}
      <dl
        id="checks"
        aria-label="Verification status"
        className="flex flex-wrap gap-x-5 gap-y-1 border-b px-4 py-2 text-xs sm:px-6"
      >
        {visibleChecks.map(([key, label]) => {
          const value = run?.checks[key].status;
          return (
            <div key={key} className="flex items-baseline gap-1">
              <dt className="text-muted-foreground">{label}</dt>
              <dd
                className={
                  value === 'passed'
                    ? 'font-medium text-primary'
                    : value === 'failed'
                      ? 'font-medium text-destructive'
                      : 'text-muted-foreground'
                }
              >
                {checkText(value)}
              </dd>
            </div>
          );
        })}
      </dl>
      <ReportPreview htmlUrl={run?.html} />
      <Sheet
        open={activeSheet !== null}
        onOpenChange={(open) => {
          if (!open) setActiveSheet(null);
        }}
        modal={false}
        disablePointerDismissal
      >
        <SheetContent
          side="right"
          showOverlay={false}
          className="top-24! h-[calc(100dvh-6rem)]! w-[min(92vw,24rem)] sm:top-16! sm:h-[calc(100dvh-4rem)]!"
        >
          <SheetHeader className="shrink-0 border-b pr-14">
            <SheetTitle>
              {activeSheet === 'api' ? 'API details' : 'Inputs'}
            </SheetTitle>
          </SheetHeader>
          <div
            id="calculation-sheet-scroll"
            className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5"
          >
            {activeSheet === 'api' ? (
              <section aria-label="Terminal command" className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Run this command in your terminal. The response contains only
                  the calculation outputs.
                </p>
                <div className="overflow-hidden rounded-md border bg-muted/30">
                  <div className="flex items-center justify-between border-b px-3 py-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      bash
                    </span>
                    <Button
                      id="copy-curl"
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={curl.kind !== 'ready'}
                      onClick={() => void copyCurl()}
                    >
                      {curl.kind === 'ready' &&
                      copyFeedback?.command === curl.command
                        ? copyFeedback.kind === 'copied'
                          ? 'Copied'
                          : 'Retry copy'
                        : 'Copy'}
                    </Button>
                  </div>
                  <pre
                    id="curl"
                    className="whitespace-pre-wrap break-all px-3 py-4 font-mono text-xs leading-6"
                  >
                    {curl.kind === 'ready'
                      ? curl.fragments.map((fragment, index) => (
                          <span
                            key={`${fragment.kind}-${index}`}
                            data-syntax={fragment.kind}
                            className={syntaxColor[fragment.kind]}
                          >
                            {fragment.text}
                          </span>
                        ))
                      : curl.message}
                  </pre>
                </div>
                {curl.kind === 'ready' &&
                  copyFeedback?.command === curl.command &&
                  copyFeedback.kind === 'failed' && (
                    <p role="alert" className="text-xs text-destructive">
                      Copy failed. Select the command to copy it manually.
                    </p>
                  )}
              </section>
            ) : (
              <>
                <section
                  aria-labelledby="parameters-title"
                  className="space-y-4"
                >
                  <h2
                    id="parameters-title"
                    className="font-heading text-sm font-medium"
                  >
                    Parameters
                  </h2>
                  <form id="inputs" onSubmit={onSubmit} className="space-y-4">
                    <div id="fields" className="space-y-4">
                      {definition?.inputs.map((input) => (
                        <div key={input.name} className="space-y-2">
                          <Label htmlFor={`input-${input.name}`}>
                            {input.description}{' '}
                            {input.unit && `(${input.unit})`}
                          </Label>
                          <Input
                            id={`input-${input.name}`}
                            name={input.name}
                            type="number"
                            step={input.numericType === 'int' ? '1' : 'any'}
                            required
                            value={values[input.name] ?? ''}
                            onChange={(event) =>
                              edit(input.name, event.target.value)
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <Button
                      id="calculate"
                      type="submit"
                      className="w-full"
                      disabled={!definition || busy}
                    >
                      {busy ? 'Calculating…' : 'Calculate'}
                    </Button>
                  </form>
                </section>
                <a
                  id="evidence"
                  hidden={
                    !run || run.checks.rendering.status === 'not_applicable'
                  }
                  className="text-xs text-muted-foreground underline [hidden]:hidden"
                  href={run && selected ? run.evidence : undefined}
                  download
                >
                  Download evidence
                </a>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
