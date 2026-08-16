import path from 'node:path';
import { promises as fs } from 'node:fs';

import {
  collectRepositoryContracts,
  distCandidatesForRoute,
  readJsonFile,
  readTextFile,
} from './lib/verification-core.mjs';

async function main() {
  const rootDir = process.cwd();
  const distDir = path.join(rootDir, 'dist');
  const contracts = await collectRepositoryContracts(rootDir);
  const artifactsCatalog = await readJsonFile(
    path.join(rootDir, 'src', 'data', 'artifacts.json'),
    'src/data/artifacts.json',
  );
  const visualAssetsCatalog = await readJsonFile(
    path.join(rootDir, 'src', 'data', 'visual-assets.json'),
    'src/data/visual-assets.json',
  );
  const errors = [];

  try {
    const stats = await fs.stat(distDir);
    if (!stats.isDirectory()) {
      errors.push(`dist: expected a build output directory at ${distDir}.`);
    }
  } catch {
    errors.push(`dist: build output is missing. Run "bun run build" before "bun run verify:routes".`);
  }

  if (errors.length > 0) {
    reportErrors(errors);
    return;
  }

  for (const entry of contracts.routeManifest) {
    const candidates = distCandidatesForRoute(distDir, entry.route);
    const existingFile = await findFirstExistingFile(candidates);

    if (!existingFile) {
      errors.push(
        `${entry.route}: expected built output at one of ${candidates.map((candidate) => path.relative(rootDir, candidate)).join(', ')}.`,
      );
      continue;
    }

    const html = await readTextFile(existingFile);
    if (!html.includes('<html')) {
      errors.push(`${entry.route}: built output ${path.relative(rootDir, existingFile)} does not look like an HTML page.`);
      continue;
    }

    if (entry.kind === 'redirect') {
      if (!entry.redirectTo) {
        errors.push(`${entry.route}: redirect route is missing its redirect target.`);
        continue;
      }

      if (!html.includes(entry.redirectTo)) {
        errors.push(
          `${entry.route}: ${path.relative(rootDir, existingFile)} does not mention expected redirect target ${entry.redirectTo}.`,
        );
      }

      if (!html.includes('http-equiv="refresh"') && !html.includes('window.location.replace')) {
        errors.push(
          `${entry.route}: ${path.relative(rootDir, existingFile)} exists, but it does not contain a redirect mechanism.`,
        );
      }
    }
  }

  for (const locale of contracts.locales) {
    await validateRenderedInventory({
      countLabel: `${artifactsCatalog.totalCount} artifacts`,
      distDir,
      entries: artifactsCatalog.artifacts,
      errors,
      itemMarker: 'class="artifact-card"',
      label: 'NotebookLM inventory page',
      rootDir,
      route: `/${locale}/docs/research/notebooklm-artifacts`,
    });
    await validateRenderedInventory({
      countLabel: `${visualAssetsCatalog.totalCount} assets`,
      distDir,
      entries: visualAssetsCatalog.assets,
      errors,
      itemMarker: 'class="swiss-panel visual-asset-card"',
      label: 'visual asset inventory page',
      rootDir,
      route: `/${locale}/docs/brand/visual-assets`,
    });
  }

  if (errors.length > 0) {
    reportErrors(errors);
    return;
  }

  console.log(
    `verify:routes passed: ${contracts.routeManifest.length} expected route output(s) found in dist.`,
  );
}

async function findFirstExistingFile(candidates) {
  for (const candidate of candidates) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isFile()) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function validateRenderedInventory({
  countLabel,
  distDir,
  entries,
  errors,
  itemMarker,
  label,
  rootDir,
  route,
}) {
  const outputFile = await findFirstExistingFile(distCandidatesForRoute(distDir, route));
  if (!outputFile) return;

  const html = await readTextFile(outputFile);
  const renderedCount = html.split(itemMarker).length - 1;
  if (renderedCount !== entries.length) {
    errors.push(`${route}: ${label} renders ${renderedCount} items, expected ${entries.length}.`);
  }

  if (!html.includes(countLabel)) {
    errors.push(`${route}: ${label} does not render inventory count label "${countLabel}".`);
  }

  for (const entry of entries) {
    const publicPath = `/${entry.file.replace(/^\/+/, '')}`;
    if (!html.includes(publicPath) && !html.includes(encodeURI(publicPath))) {
      errors.push(`${route}: ${label} does not link inventory file ${publicPath}.`);
    }
  }

  if (!html.includes('<html')) {
    errors.push(`${route}: ${path.relative(rootDir, outputFile)} does not look like an HTML page.`);
  }
}

function reportErrors(errors) {
  console.error(`verify:routes failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`verify:routes crashed:\n${message}`);
  process.exit(1);
});
