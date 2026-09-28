import { CalculationDefinitionSchema, type CalculationDefinition } from '@cs-object/core';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

async function readJson(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(body);
    throw new Error(parsed.success ? parsed.data.error : `Request failed (${response.status})`);
  }
  return body;
}

function numericText(value: number): string {
  return Object.is(value, -0) ? '-0.0' : String(value);
}

function requestBody(definition: CalculationDefinition, values: Record<string, string>): string {
  const entries = definition.inputs.map((input) => {
    const raw = values[input.name]?.trim() ?? '';
    const number = Number(raw);
    if (!raw || !Number.isFinite(number)) throw new Error(`Enter a finite value for ${input.name}`);
    if (input.numericType === 'int' && !Number.isSafeInteger(number)) throw new Error(`${input.name} requires a safe integer`);
    return [input.name, number] as const;
  });
  return JSON.stringify({ inputs: Object.fromEntries(entries) });
}

export default function App() {
  const [definition, setDefinition] = useState<CalculationDefinition>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [run, setRun] = useState<Run>();
  const [status, setStatus] = useState('Loading calculation…');
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  const curl = (() => {
    if (!definition) return '';
    try {
      const body = requestBody(definition, values).replaceAll("'", "'\\''");
      return `curl -sS --fail-with-body ${location.origin}/api/calculate -H 'Content-Type: application/json' -d '${body}'`;
    } catch { return 'Enter input values to show the request.'; }
  })();

  async function calculate(activeDefinition: CalculationDefinition, activeValues: Record<string, string>) {
    const started = ++revision.current;
    setBusy(true);
    setRun(undefined);
    setStatus('Calculating…');
    try {
      const next = RunSchema.parse(await readJson(await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody(activeDefinition, activeValues),
      })));
      if (started !== revision.current) return;
      setRun(next);
      setStatus('Report ready. Review its assumptions and results.');
    } catch (error) {
      if (started === revision.current) setStatus(error instanceof Error ? error.message : 'Calculation failed');
    } finally {
      if (started === revision.current) setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const parsed = CalculationDefinitionSchema.parse(await readJson(await fetch('/api/definition')));
        if (!active) return;
        setDefinition(parsed);
        const defaults = Object.fromEntries(parsed.inputs.map((input) => [input.name, input.default === undefined ? '' : numericText(input.default)]));
        setValues(defaults);
        setStatus('Enter inputs and calculate.');
        if (parsed.inputs.every((input) => input.default !== undefined)) void calculate(parsed, defaults);
      } catch (error) {
        if (active) setStatus(error instanceof Error ? error.message : 'Cannot load calculation');
      }
    })();
    return () => { active = false; revision.current += 1; };
  }, []);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (definition) void calculate(definition, values);
  }
  function edit(name: string, value: string) {
    revision.current += 1;
    setValues((current) => ({ ...current, [name]: value }));
    setRun(undefined);
    setBusy(false);
    setStatus('Inputs changed. Calculate again to update the report.');
  }
  async function downloadPdf() {
    if (!run) return;
    const current = run;
    const started = revision.current;
    setBusy(true);
    setStatus('Preparing PDF…');
    try {
      const response = await fetch(current.pdf);
      if (!response.ok) await readJson(response);
      const url = URL.createObjectURL(await response.blob());
      if (started !== revision.current) { URL.revokeObjectURL(url); return; }
      const link = document.createElement('a');
      link.href = url;
      link.download = 'calculation.pdf';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const latest = await readJson(await fetch(`/api/runs/${current.id}`));
      const checks = RunSchema.omit({ html: true, pdf: true, evidence: true }).parse(latest).checks;
      if (started !== revision.current) return;
      setRun({ ...current, checks });
      setStatus('PDF ready. Human review remains pending.');
    } catch (error) {
      if (started === revision.current) setStatus(error instanceof Error ? error.message : 'PDF failed');
    } finally {
      if (started === revision.current) setBusy(false);
    }
  }

  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-8">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">CalculationSourceObject</p><h1 className="font-heading text-3xl font-semibold">Calculation report</h1></div>
      <Badge variant="secondary">Local project</Badge>
    </header>
    <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-5">
        <Card><CardHeader><CardTitle>Inputs</CardTitle></CardHeader><CardContent>
          <form id="inputs" onSubmit={onSubmit} className="space-y-4">
            <div id="fields" className="space-y-4">{definition?.inputs.map((input) => <div key={input.name} className="space-y-2">
              <Label htmlFor={`input-${input.name}`}>{input.description} {input.unit && `(${input.unit})`}</Label>
              <p className="font-mono text-xs text-muted-foreground">{input.name}</p>
              <Input id={`input-${input.name}`} name={input.name} type="number" step={input.numericType === 'int' ? '1' : 'any'} required value={values[input.name] ?? ''} onChange={(event) => edit(input.name, event.target.value)} />
            </div>)}</div>
            <Button id="calculate" type="submit" disabled={!definition || busy}>Calculate</Button>
          </form>
          <p id="status" role="status" aria-live="polite" className="mt-4 text-sm text-muted-foreground">{status}</p>
          <p className="mt-2 text-xs text-muted-foreground">Reload after changing the Python input definitions.</p>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Outputs</CardTitle></CardHeader><CardContent className="space-y-4">
          <dl id="outputs" className="grid grid-cols-[1fr_auto] gap-2 text-sm">{run && Object.entries(run.outputs).map(([name, value]) => {
            const output = definition?.outputs.find((item) => item.name === name);
            return <div key={name} className="contents"><dt>{name}</dt><dd className="font-mono text-right">{numericText(value)} {output?.unit}</dd></div>;
          })}</dl>
          {run && <ul id="checks" className="space-y-1 text-xs text-muted-foreground">{([
            ['sourceToDocumentConsistency', 'Source-to-document consistency'],
            ['independentReferenceAgreement', 'Independent reference agreement'],
            ['rendering', 'PDF layout'],
            ['visualInspection', 'Human visual inspection'],
          ] as const).map(([key, label]) => <li key={key}>{label}: {run.checks[key].status === 'not_applicable' ? 'pending' : run.checks[key].status}</li>)}</ul>}
          <div className="flex flex-wrap items-center gap-2">
            <a id="pdf" hidden={!run || busy} href={run?.pdf} className={`${buttonVariants({ variant: 'default' })} [hidden]:hidden`} onClick={(event) => { event.preventDefault(); void downloadPdf(); }}>Download PDF</a>
            <a id="evidence" hidden={!run || run.checks.rendering.status === 'not_applicable'} className="text-sm underline [hidden]:hidden" href={run?.evidence} download>Download evidence</a>
          </div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Calculate with curl</CardTitle></CardHeader><CardContent><pre id="curl" className="overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 font-mono text-xs">{curl}</pre></CardContent></Card>
      </div>
      <Card className="min-w-0"><CardHeader><CardTitle>Report preview</CardTitle></CardHeader><CardContent>{run ? <iframe id="report" title="Calculation report" sandbox="" src={run.html} className="h-[1000px] w-full border bg-white" /> : <div className="flex min-h-[600px] items-center justify-center text-sm text-muted-foreground">Calculate to preview the report.</div>}</CardContent></Card>
    </div>
  </main>;
}
