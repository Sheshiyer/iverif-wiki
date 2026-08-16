import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildExpectedRouteManifest,
  collectMarkdownReferences,
  deriveStaticLocalizedDocRoutes,
  distCandidatesForRoute,
  filePathToDocSlug,
  getRedirectTargetForRoute,
  parseLocalesFromI18nSource,
  readJsonFile,
  validateArtifactsCatalog,
  validateSiteData,
} from '../scripts/lib/verification-core.mjs';

test('parseLocalesFromI18nSource returns declared locales', () => {
  const locales = parseLocalesFromI18nSource(`
    export const LOCALES: Locale[] = ['en', 'fr'];
  `);

  assert.deepEqual(locales, ['en', 'fr']);
});

test('parseLocalesFromI18nSource rejects missing locale declarations', () => {
  assert.throws(
    () => parseLocalesFromI18nSource('export const OTHER = [];'),
    /Could not find LOCALES declaration/,
  );
});

test('filePathToDocSlug derives nested content slugs', () => {
  assert.equal(
    filePathToDocSlug('src/content/docs/product/overview.md'),
    'product/overview',
  );
  assert.equal(filePathToDocSlug('src/content/docs/index.mdx'), 'index');
});

test('deriveStaticLocalizedDocRoutes converts localized Astro pages into docs routes', () => {
  const routes = deriveStaticLocalizedDocRoutes([
    'src/pages/[locale]/docs/brand/visual-assets.astro',
    'src/pages/[locale]/docs/research/notebooklm-artifacts.astro',
    'src/pages/[locale]/docs/[...slug].astro',
  ]);

  assert.deepEqual(routes, [
    '/docs/brand/visual-assets',
    '/docs/research/notebooklm-artifacts',
  ]);
});

test('buildExpectedRouteManifest includes redirects and localized routes without duplicates', () => {
  const manifest = buildExpectedRouteManifest({
    locales: ['en'],
    docSlugs: ['index', 'brand/visual-assets'],
    staticLocalizedDocRoutes: ['/docs/brand/visual-assets'],
  });

  assert.deepEqual(
    manifest.map((entry) => ({
      route: entry.route,
      kind: entry.kind,
      redirectTo: entry.redirectTo ?? null,
    })),
    [
      { route: '/', kind: 'redirect', redirectTo: '/en/' },
      { route: '/docs/brand/visual-assets', kind: 'redirect', redirectTo: '/en/docs/brand/visual-assets' },
      { route: '/docs/index', kind: 'redirect', redirectTo: '/en/docs/index' },
      { route: '/en', kind: 'page', redirectTo: null },
      { route: '/en/docs/brand/visual-assets', kind: 'page', redirectTo: null },
      { route: '/en/docs/index', kind: 'page', redirectTo: null },
    ],
  );
});

test('getRedirectTargetForRoute returns localized targets for root and docs routes', () => {
  assert.equal(getRedirectTargetForRoute('/', ['en']), '/en/');
  assert.equal(
    getRedirectTargetForRoute('/docs/product/overview', ['en']),
    '/en/docs/product/overview',
  );
  assert.equal(getRedirectTargetForRoute('/en/docs/product/overview', ['en']), null);
});

test('collectMarkdownReferences returns internal route and asset references only', () => {
  const references = collectMarkdownReferences(`
    [Doc](/docs/index)
    [Deck](/notebooklm/deck-presenter-full.pdf)
    [Mind map](/notebooklm/mind-map (2).json)
    ![Image](/assets/website/og-image.png)
    [External](https://example.com)
    [Mail](mailto:test@example.com)
    [Hash](#section)
  `);

  assert.deepEqual(
    references.map((reference) => reference.target),
    [
      '/docs/index',
      '/notebooklm/deck-presenter-full.pdf',
      '/notebooklm/mind-map (2).json',
      '/assets/website/og-image.png',
    ],
  );
});

test('validateArtifactsCatalog reports totalCount and byType mismatches', () => {
  const errors = validateArtifactsCatalog({
    version: '1.0.0',
    generatedAt: '2026-06-03T22:28:32.664326',
    totalCount: 2,
    byType: { Audio: 2 },
    artifacts: [{ kind: 'Audio' }],
  });

  assert.deepEqual(errors, [
    'src/data/artifacts.json: totalCount must equal artifacts.length (expected 1, received 2).',
    'src/data/artifacts.json: byType.Audio must equal the number of artifacts with kind "Audio" (expected 1, received 2).',
  ]);
});

test('readJsonFile reports invalid JSON with its repository label', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'iverif-json-'));
  const filePath = path.join(directory, 'broken.json');

  try {
    await fs.writeFile(filePath, '{"broken":', 'utf8');
    await assert.rejects(
      readJsonFile(filePath, 'src/data/broken.json'),
      /src\/data\/broken\.json: invalid JSON/,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('validateSiteData rejects malformed data and missing public assets', () => {
  const malformedErrors = validateSiteData([], {
    knownRoutes: new Set(),
    publicPaths: new Set(),
  });
  assert.deepEqual(malformedErrors, [
    'src/data/site-data.json: expected a JSON object at the top level.',
  ]);

  const missingAssetErrors = validateSiteData({ heroImage: '/assets/missing.png' }, {
    knownRoutes: new Set(),
    publicPaths: new Set(),
  });
  assert.ok(missingAssetErrors.includes(
    'src/data/site-data.json: heroImage points to a missing public file: /assets/missing.png.',
  ));
});

test('distCandidatesForRoute supports directory and file-style Astro output', () => {
  assert.deepEqual(
    distCandidatesForRoute('/repo/dist', '/en/docs/index'),
    [
      path.join('/repo/dist', 'en', 'docs', 'index', 'index.html'),
      path.join('/repo/dist', 'en', 'docs', 'index.html'),
    ],
  );
});
