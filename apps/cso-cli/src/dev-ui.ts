export const devPage = {
  html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Calculation report</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#17212b;font:16px system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:28px}h1{font-size:28px;margin-top:0}.workspace{display:grid;grid-template-columns:minmax(260px,340px) minmax(0,1fr);gap:24px}.controls,section{background:white;border:1px solid #d9dee5;border-radius:8px;padding:22px}label{display:block;margin:18px 0 6px}label small{display:block;color:#536172}input{width:100%;padding:10px;border:1px solid #a8b3c0;border-radius:4px;font:inherit}button,.download{display:inline-block;margin:18px 8px 0 0;padding:10px 14px;border:0;border-radius:4px;background:#164d87;color:white;font:inherit;cursor:pointer;text-decoration:none}button:disabled{opacity:.55;cursor:wait}a[hidden],iframe[hidden]{display:none}#status{line-height:1.5;min-height:24px}#checks{padding-left:20px;font-size:14px;line-height:1.6}#outputs{display:grid;grid-template-columns:1fr auto;gap:6px}#outputs dt,#outputs dd{margin:0}#report{width:100%;height:1000px;border:1px solid #d9dee5;background:white}pre{overflow:auto;padding:14px;background:#edf1f6;border-radius:4px;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}h2{font-size:19px}@media(max-width:900px){main{padding:16px}.workspace{grid-template-columns:1fr}#report{height:850px}}:focus-visible{outline:3px solid #d99726;outline-offset:2px}
</style></head><body><main><h1>Calculation report</h1><div class="workspace"><div class="controls"><form id="inputs"><div id="fields"></div><button id="calculate" type="submit" disabled>Calculate</button></form><p id="status" role="status" aria-live="polite">Loading calculation…</p><p>Reload this page after changing the calculation input definitions.</p><h2>Outputs</h2><dl id="outputs"></dl><ul id="checks"></ul><a id="pdf" class="download" hidden>Download PDF</a><a id="evidence" hidden>Download evidence</a><h2>Calculate with curl</h2><pre id="curl"></pre></div><section aria-label="Calculation report preview"><iframe id="report" title="Calculation report" sandbox="" hidden></iframe></section></div></main><script src="/app.js"></script></body></html>`,
  script: String.raw`
const form = document.querySelector('#inputs');
const fields = document.querySelector('#fields');
const button = document.querySelector('#calculate');
const status = document.querySelector('#status');
const outputs = document.querySelector('#outputs');
const checks = document.querySelector('#checks');
const report = document.querySelector('#report');
const pdf = document.querySelector('#pdf');
const evidence = document.querySelector('#evidence');
let revision = 0;
let currentRun;
let definition;
const numberText = value => Object.is(value, -0) ? '-0.0' : Number.isInteger(value) && !Number.isSafeInteger(value) ? value.toExponential() : JSON.stringify(value);
function inputJson() {
  const entries = Array.from(fields.querySelectorAll('input'), input => {
    if (input.value.trim() === '' || !Number.isFinite(Number(input.value))) throw new Error('Enter a finite value for ' + input.name);
    return JSON.stringify(input.name) + ':' + numberText(Number(input.value));
  });
  return '{"inputs":{' + entries.join(',') + '}}';
}
function updateCurl() {
  try {
    const body = inputJson().replaceAll("'", "'\\''");
    document.querySelector('#curl').textContent = 'curl -sS --fail-with-body ' + location.origin + '/api/calculate -H \'Content-Type: application/json\' -d \'' + body + '\'';
  } catch { document.querySelector('#curl').textContent = 'Enter input values to show the request.'; }
}
function invalidate() {
  revision += 1; currentRun = undefined;
  report.hidden = true; report.removeAttribute('src');
  pdf.hidden = true; pdf.removeAttribute('href');
  evidence.hidden = true; evidence.removeAttribute('href');
  outputs.replaceChildren(); checks.replaceChildren();
  status.textContent = 'Inputs changed. Calculate again to update the report.';
  updateCurl();
}
function showChecks(values) {
  checks.replaceChildren();
  const labels = [
    ['sourceToDocumentConsistency', 'Source-to-document consistency'],
    ['independentReferenceAgreement', 'Independent reference agreement'],
    ['rendering', 'PDF layout'],
    ['visualInspection', 'Human visual inspection'],
  ];
  for (const [key, label] of labels) {
    const item = document.createElement('li');
    const state = values[key].status;
    item.textContent = label + ': ' + (state === 'not_applicable' ? key === 'independentReferenceAgreement' ? 'pending, no matching reference' : 'pending' : state);
    checks.append(item);
  }
}
async function readJson(response) {
  const body = await response.json();
  if (!response.ok) throw new Error([body.error, ...(body.diagnostics ?? []).map(item => item.message)].join('\n'));
  return body;
}
form.addEventListener('input', invalidate);
form.addEventListener('submit', async event => {
  event.preventDefault();
  invalidate();
  const started = revision;
  button.disabled = true;
  status.textContent = 'Calculating…';
  try {
    const run = await readJson(await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: inputJson() }));
    if (started !== revision) return;
    currentRun = run;
    for (const [name, value] of Object.entries(run.outputs)) {
      const metadata = definition.outputs.find(item => item.name === name);
      const term = document.createElement('dt'); term.textContent = name;
      const result = document.createElement('dd'); result.textContent = numberText(value) + (metadata?.unit ? ' ' + metadata.unit : '');
      outputs.append(term, result);
    }
    showChecks(run.checks);
    report.src = run.html; report.hidden = false;
    pdf.href = run.pdf; pdf.hidden = false;
    evidence.href = run.evidence; evidence.hidden = true;
    status.textContent = 'Report ready. Review its assumptions and results.';
  } catch (error) { if (started === revision) status.textContent = error.message; }
  finally { button.disabled = false; }
});
pdf.addEventListener('click', async event => {
  event.preventDefault();
  const run = currentRun;
  if (!run) return;
  const started = revision;
  pdf.hidden = true;
  status.textContent = 'Preparing PDF…';
  try {
    const response = await fetch(run.pdf);
    if (!response.ok) await readJson(response);
    const blob = await response.blob();
    if (started !== revision) return;
    const url = URL.createObjectURL(blob);
    const download = document.createElement('a'); download.href = url; download.download = 'calculation.pdf'; download.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const latest = await readJson(await fetch('/api/runs/' + run.id));
    if (started === revision) { showChecks(latest.checks); evidence.href = run.evidence; evidence.hidden = false; status.textContent = 'PDF ready. Human review remains pending.'; }
  } catch (error) {
    if (started === revision) {
      try {
        const latest = await readJson(await fetch('/api/runs/' + run.id));
        if (started === revision) showChecks(latest.checks);
      } catch { /* Keep the original PDF failure if the run is unavailable. */ }
      if (started === revision) status.textContent = error.message;
    }
  }
  finally { if (started === revision) pdf.hidden = false; }
});
(async () => {
  try {
    definition = await readJson(await fetch('/api/definition'));
    for (const [index, input] of definition.inputs.entries()) {
      const label = document.createElement('label'); label.htmlFor = 'input-' + index;
      label.textContent = input.description + (input.unit ? ' (' + input.unit + ')' : '');
      const name = document.createElement('small'); name.textContent = input.name; label.append(name);
      const field = document.createElement('input'); field.id = label.htmlFor; field.name = input.name; field.type = 'number'; field.step = input.numericType === 'int' ? '1' : 'any'; field.required = true;
      if (input.default !== undefined) field.value = Object.is(input.default, -0) ? '-0' : String(input.default);
      fields.append(label, field);
    }
    button.disabled = false; status.textContent = 'Enter inputs and calculate.'; updateCurl();
    if (definition.inputs.every(input => input.default !== undefined)) form.requestSubmit();
  } catch (error) { status.textContent = error.message; }
})();
`,
};
