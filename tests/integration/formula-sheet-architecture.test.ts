import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

const repoRoot = new URL('../..', import.meta.url).pathname;
const sourceExtensionPattern = /\.tsx?$/;
const coreExternalPattern = /^(?:zod(?:\/|$)|@noble\/hashes\/sha2\.js$)/;
const reactExternalPattern = /^(?:react(?:\/.*)?|@viktar-b\/cso-core)$/;
const privateLibrarySourcePattern =
  /^(?:packages\/cso-(?:core|react)\/src\/|@viktar-b\/cso-(?:core|react)\/src\/)/;

const collectSourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? collectSourceFiles(path)
      : sourceExtensionPattern.test(entry.name)
        ? [path]
        : [];
  });

const moduleSpecifiers = (file: string): string[] => {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const imports: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument)) {
        imports.push(argument.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
};

const packageImportViolations = (
  packageName: string,
  allowedExternal: RegExp,
): string[] => {
  const sourceRoot = join(repoRoot, 'packages', packageName, 'src');
  return collectSourceFiles(sourceRoot).flatMap((file) =>
    moduleSpecifiers(file).flatMap((specifier) => {
      const allowed = specifier.startsWith('.')
        ? !relative(sourceRoot, resolve(dirname(file), specifier)).startsWith(
            '..',
          )
        : allowedExternal.test(specifier);
      return allowed ? [] : [`${relative(repoRoot, file)}: ${specifier}`];
    }),
  );
};

describe('FormulaSheet package boundaries', () => {
  test('core imports only its own source, Zod and the pure SHA implementation', () => {
    expect(packageImportViolations('cso-core', coreExternalPattern)).toEqual(
      [],
    );
  });

  test('React imports only its own source, React, and public core exports', () => {
    expect(packageImportViolations('cso-react', reactExternalPattern)).toEqual(
      [],
    );
  });

  test('demo and development consumers do not import private library source', () => {
    const files = [
      ...collectSourceFiles(join(repoRoot, 'apps/demo/app')),
      ...collectSourceFiles(join(repoRoot, 'apps/demo/src')),
      ...collectSourceFiles(join(repoRoot, 'scripts')),
    ];
    const violations = files.flatMap((file) =>
      moduleSpecifiers(file).flatMap((specifier) => {
        const target = specifier.startsWith('.')
          ? relative(repoRoot, resolve(dirname(file), specifier))
          : specifier;
        const forbidden = privateLibrarySourcePattern.test(target);
        return forbidden ? [`${relative(repoRoot, file)}: ${specifier}`] : [];
      }),
    );
    expect(violations).toEqual([]);
  });
});
