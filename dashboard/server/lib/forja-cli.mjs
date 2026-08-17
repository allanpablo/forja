import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frameworkRoot = path.resolve(__dirname, '..', '..', '..');

/** Dashboard actions always enter through the same CLI core as terminal users. */
export function forjaArgs(command, args = []) {
  return [path.join(frameworkRoot, 'bin', 'forja.ts'), command, ...args];
}
