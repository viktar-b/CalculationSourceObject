import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PythonIdentifierSchema } from '@cs-object/core';
import { z } from 'zod';

const ReportSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string().min(1),
  source: z.string().regex(/^calculations\/(?!.*\.\.\/)[^/].*\.cso\.py$/),
  function: PythonIdentifierSchema,
  reference: z.string().optional(),
});

export type Report = z.infer<typeof ReportSchema>;

export function loadReports(project: string): Report[] {
  const reports = z
    .array(ReportSchema)
    .min(1)
    .parse(JSON.parse(readFileSync(join(project, 'reports.json'), 'utf8')));
  if (new Set(reports.map(({ id }) => id)).size !== reports.length)
    throw new Error('reports.json contains duplicate report IDs');
  return reports;
}
