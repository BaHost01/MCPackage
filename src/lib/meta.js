/** Package metadata, read once from package.json. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
const pkg = JSON.parse(readFileSync(packageFile, 'utf8'));

export const NAME = pkg.name;
export const VERSION = pkg.version;
export const HOMEPAGE = pkg.homepage;
export const BUGS_URL = pkg.bugs?.url ?? pkg.homepage;
