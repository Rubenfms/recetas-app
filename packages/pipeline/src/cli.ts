import { relative } from 'node:path';
import { REPO_ROOT } from './config.js';
import { formatDuration, log } from './lib/log.js';
import { runFetch, type FetchOptions } from './commands/fetch.js';
import { runBuild, type BuildReport } from './commands/build.js';
import { runProbeWarehouse } from './commands/probe-warehouse.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function parseArgs(argv: string[]): { command: string; opts: FetchOptions } {
  const command = argv[0] ?? 'help';
  const rest = argv.slice(1);

  const force = rest.includes('--force');
  const limitIndex = rest.indexOf('--limit');
  const limitValue = limitIndex >= 0 ? Number(rest[limitIndex + 1]) : NaN;
  const maxAgeIndex = rest.indexOf('--max-age-days');
  const maxAgeValue = maxAgeIndex >= 0 ? Number(rest[maxAgeIndex + 1]) : NaN;

  if (limitIndex >= 0 && !Number.isFinite(limitValue)) {
    throw new Error('--limit necesita un número, por ejemplo: --limit 25');
  }
  if (maxAgeIndex >= 0 && !Number.isFinite(maxAgeValue)) {
    throw new Error('--max-age-days necesita un número, por ejemplo: --max-age-days 7');
  }

  return {
    command,
    opts: {
      force,
      limit: Number.isFinite(limitValue) ? limitValue : null,
      maxAgeMs: Number.isFinite(maxAgeValue) ? maxAgeValue * DAY_MS : null,
    },
  };
}

function printBuildReport(report: BuildReport): void {
  const pct = (n: number): string => `${((n / report.products) * 100).toFixed(1)}%`;
  const kb = (n: number): string => `${(n / 1024).toFixed(0)} KB`;

  log.plain();
  log.plain('══════════════════════════ INFORME ══════════════════════════');
  log.plain(`  Volcado crudo             ${report.dumpDate}`);
  log.plain(`  Productos                 ${report.products}`);
  log.plain(`    con datos nutricionales ${report.withNutrition} (${pct(report.withNutrition)})`);
  log.plain(`    sin EAN                 ${report.withoutEan} (${pct(report.withoutEan)})`);
  log.plain(`    con contenido en g/ml   ${report.withNetContent} (${pct(report.withNetContent)})`);
  log.plain(`    con foto                ${report.withPhotos} (${pct(report.withPhotos)})`);
  log.plain(`    alimentación            ${report.food}`);
  log.plain(`    no alimentación         ${report.nonFood}`);
  if (report.duplicateEans > 0) {
    log.plain(`  EAN repetidos             ${report.duplicateEans} (productos distintos, mismo código)`);
  }
  if (report.invalid > 0) {
    log.plain(`  Fichas descartadas        ${report.invalid}`);
  }
  log.plain(`  Dataset                   ${relative(REPO_ROOT, report.outputPath)} (${kb(report.outputBytes)})`);
  log.plain('═════════════════════════════════════════════════════════════');

  if (report.withNutrition === 0) {
    log.plain();
    log.plain(
      '  Cero productos con macros es lo esperado: la API de Mercadona no\n' +
        '  publica valores nutricionales. Se rellenarán con el cruce contra\n' +
        '  Open Food Facts (fuente: openfoodfacts) en una sesión posterior.',
    );
  }
}

async function main(): Promise<void> {
  const { command, opts } = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();

  switch (command) {
    case 'fetch': {
      await runFetch(opts);
      break;
    }
    case 'build': {
      printBuildReport(runBuild());
      break;
    }
    case 'update': {
      const dir = await runFetch(opts);
      printBuildReport(runBuild(dir));
      break;
    }
    case 'probe-warehouse': {
      await runProbeWarehouse();
      break;
    }
    default: {
      log.plain(`
Pipeline del catálogo de Mercadona.

  tsx src/cli.ts fetch [opciones]     Descarga el catálogo al volcado crudo.
  tsx src/cli.ts build                Volcado crudo → dataset.json + informe.
  tsx src/cli.ts update [opciones]    Las dos cosas.
  tsx src/cli.ts probe-warehouse      Sondea qué códigos de almacén existen.

Opciones de fetch/update:
  --force              Ignora caché y volcado previo. Lo vuelve a pedir todo.
  --limit N            Corta tras N fichas. Para probar sin esperar 80 minutos.
  --max-age-days N     Refresca lo cacheado con más de N días.

Va a 1 petición/segundo, en serie. Un crawl completo son ~80 minutos la primera
vez. Es reanudable: si lo cortas, al relanzarlo sigue donde estaba.
`);
      if (command !== 'help') process.exitCode = 1;
      break;
    }
  }

  if (command === 'fetch' || command === 'update') {
    log.info(`Total: ${formatDuration(Date.now() - startedAt)}`);
  }
}

main().catch((err: unknown) => {
  log.plain();
  log.error(err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack && process.env['DEBUG']) log.plain(err.stack);
  process.exit(1);
});
