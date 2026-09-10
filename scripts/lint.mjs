import { readFile } from 'node:fs/promises';
import { ROOT, sourceFiles } from './files.mjs';

// Deliberately small, self-owned hygiene checks; not ESLint or a semantic analyzer.
const errors = [];
const files = await sourceFiles();
for (const file of files) {
  const text = await readFile(new URL(file, ROOT), 'utf8');
  if (!text.endsWith('\n')) errors.push(`${file}: missing final newline`);
  text.split('\n').forEach((line, index) => {
    if (/[\t ]+$/.test(line)) errors.push(`${file}:${index + 1}: trailing whitespace`);
    if (/^\t/.test(line)) errors.push(`${file}:${index + 1}: tab indentation`);
    if (/\r/.test(line)) errors.push(`${file}:${index + 1}: use LF line endings`);
  });
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Hygiene OK: ${files.length} implementation files (final newline, trailing whitespace, indentation, LF). Not a semantic lint.`);
