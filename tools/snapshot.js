#!/usr/bin/env node
// Snapshot build: folds index.html, style.css and every ES module under src/
// into one self-contained dist/index.html. No dependencies.
//
// The module folding is deliberately small. It supports the import/export
// forms this codebase uses (named, default, namespace, side-effect imports;
// export function/class/const/let/var, export default, export { a as b }).
// Anything else, and any circular import, stops the build with a message.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');

export function bundle(entryRel) {
  const modules = new Map(); // id -> transformed code
  const order = [];
  const visiting = new Set();

  function idOf(fromRel, specifier) {
    const abs = path.resolve(path.dirname(path.join(root, fromRel)), specifier);
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (!fs.existsSync(abs)) throw new Error(`${fromRel}: cannot find "${specifier}"`);
    return rel;
  }

  function visit(rel) {
    if (modules.has(rel)) return;
    if (visiting.has(rel)) throw new Error(`Circular import involving ${rel}`);
    visiting.add(rel);
    let code = fs.readFileSync(path.join(root, rel), 'utf8');
    const exportsOut = [];

    // --- imports ---
    const importFrom = /^[ \t]*import\s+([^'";]+?)\s+from\s+['"]([^'"]+)['"][ \t]*;?[ \t]*$/gm;
    const importSide = /^[ \t]*import\s+['"]([^'"]+)['"][ \t]*;?[ \t]*$/gm;
    code = code.replace(importFrom, (_, spec, specifier) => {
      const id = idOf(rel, specifier);
      visit(id);
      const parts = [];
      let rest = spec.trim();
      const star = rest.match(/^\*\s+as\s+([\w$]+)$/);
      if (star) return `const ${star[1]} = __m(${JSON.stringify(id)});`;
      const dflt = rest.match(/^([\w$]+)\s*(?:,\s*(.*))?$/s);
      if (dflt && !rest.startsWith('{')) {
        parts.push(`const ${dflt[1]} = __m(${JSON.stringify(id)}).default;`);
        rest = (dflt[2] || '').trim();
      }
      if (rest.startsWith('{')) {
        const names = rest.slice(1, rest.lastIndexOf('}')).split(',').map((s) => s.trim()).filter(Boolean)
          .map((s) => s.replace(/\s+as\s+/, ': '));
        parts.push(`const { ${names.join(', ')} } = __m(${JSON.stringify(id)});`);
      } else if (rest) {
        throw new Error(`${rel}: unsupported import form "${spec}"`);
      }
      return parts.join(' ');
    });
    code = code.replace(importSide, (_, specifier) => {
      const id = idOf(rel, specifier);
      visit(id);
      return `__m(${JSON.stringify(id)});`;
    });
    if (/^[ \t]*export\s+\*/m.test(code) || /^[ \t]*export\s*\{[^}]*\}\s*from/m.test(code)) {
      throw new Error(`${rel}: "export * from" and "export { } from" are not supported`);
    }

    // --- exports ---
    code = code.replace(/^([ \t]*)export\s+(async\s+function|function|class|const|let|var)\s+([\w$]+)/gm,
      (_, ws, kind, name) => { exportsOut.push(`__exports.${name} = ${name};`); return `${ws}${kind} ${name}`; });
    code = code.replace(/^([ \t]*)export\s+default\s+/gm, '$1__exports.default = ');
    code = code.replace(/^[ \t]*export\s*\{([^}]*)\}\s*;?[ \t]*$/gm, (_, list) => {
      list.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => {
        const [local, exported = local] = s.split(/\s+as\s+/);
        exportsOut.push(`__exports.${exported} = ${local};`);
      });
      return '';
    });

    visiting.delete(rel);
    modules.set(rel, `__modules[${JSON.stringify(rel)}] = (function () {\nconst __exports = {};\n${code}\n${exportsOut.join('\n')}\nreturn __exports;\n})();`);
    order.push(rel);
  }

  visit(entryRel);
  return `(function () {\n'use strict';\nconst __modules = {};\nconst __m = (id) => __modules[id];\n${order.map((id) => modules.get(id)).join('\n\n')}\n})();\n`;
}

export function buildSnapshot() {
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const generated = [];

  html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g, (tag, href) => {
    if (/^https?:/.test(href)) return tag; // fonts stay external
    const css = fs.readFileSync(path.join(root, href), 'utf8');
    generated.push(href);
    return `<style>\n${css}\n</style>`;
  });

  html = html.replace(/<script\s+type="module"\s+src="([^"]+)"\s*><\/script>/g, (_, src) => {
    const js = bundle(src);
    generated.push(src);
    return `<script type="module">\n${js}</script>`;
  });

  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'index.html'), html);
  const bytes = Buffer.byteLength(html);
  return { generated, bytes };
}

// Milestone copies: `node tools/snapshot.js --keep m1-lander` also writes
// snapshots/m1-lander.html, a committed single file that plays by itself
// when double-clicked (fonts come from the web; everything else is inside).
export function keepSnapshot(name) {
  const dir = path.join(root, 'snapshots');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${name}.html`);
  fs.copyFileSync(path.join(distDir, 'index.html'), target);
  return path.relative(root, target);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { generated, bytes } = buildSnapshot();
    console.log(`dist/index.html written (${(bytes / 1024).toFixed(1)} kB) from ${generated.join(', ')}`);
    const keep = process.argv.indexOf('--keep');
    if (keep !== -1 && process.argv[keep + 1]) console.log(`kept as ${keepSnapshot(process.argv[keep + 1])}`);
  } catch (err) {
    console.error(`snapshot failed: ${err.message}`);
    process.exit(1);
  }
}
