import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !path.extname(specifier)
  ) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // Fall through to default resolution.
    }
  }

  if (specifier === 'vscode') {
    return {
      shortCircuit: true,
      url: new URL('./vscode-stub.mjs', import.meta.url).href,
    };
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.ts')) {
    const source = await readFile(new URL(url), 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
      fileName: new URL(url).pathname,
    });

    return {
      format: 'module',
      shortCircuit: true,
      source: transpiled.outputText,
    };
  }

  return nextLoad(url, context);
}
