/**
 * 把许可证副本同步进扩展包，满足 Apache-2.0 第四条「随分发提供许可证副本」。
 * 产物：public/licenses/{LICENSE,NOTICE,Apache-2.0}.txt，构建时原样复制到扩展根目录。
 * 运行：npm run build / build:edge / pack 会自动触发。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'licenses');

const FILES = [
  ['LICENSE', 'LICENSE.txt'],
  ['NOTICE', 'NOTICE.txt'],
  [join('LICENSES', 'Apache-2.0.txt'), 'Apache-2.0.txt'],
];

await mkdir(OUT, { recursive: true });
for (const [from, to] of FILES) {
  const body = await readFile(join(ROOT, from), 'utf8');
  await writeFile(join(OUT, to), body);
  console.log(`licenses/${to} <- ${from} (${body.length} 字节)`);
}
