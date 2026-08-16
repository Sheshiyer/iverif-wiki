import path from 'node:path';
import { promises as fs } from 'node:fs';

const DOCS_CONTENT_DIR = path.join('src', 'content', 'docs');
const FR_DOCS_CONTENT_DIR = path.join('src', 'content', 'frDocs');
const DOCS_PAGES_DIR = path.join('src', 'pages', '[locale]', 'docs');
const I18N_FILE = path.join('src', 'i18n', 'index.ts');
const PUBLIC_DIR = 'public';

const OPTIONAL_REFERENCE_PROTOCOLS = ['http://', 'https://', 'mailto:', 'tel:'];

export function parseLocalesFromI18nSource(source) {
  const match = source.match(/export const LOCALES\s*:\s*[^=]+=\s*\[([^\]]*)\]/);
  if (!match) {
    throw new Error(`Could not find LOCALES declaration in ${I18N_FILE}.`);
  }

  const locales = Array.from(match[1].matchAll(/'([^']+)'|"([^"]+)"/g), (entry) => entry[1] ?? entry[2]).filter(Boolean);
  if (locales.length === 0) {
    throw new Error(`${I18N_FILE} declares LOCALES, but no locale values were found.`);
  }

  return [...new Set(locales)];
}

export function filePathToDocSlug(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const marker = `${DOCS_CONTENT_DIR.replace(/\\/g, '/')}/`;
  const relativePath = normalized.startsWith(marker) ? normalized.slice(marker.length) : normalized;
  return relativePath.replace(/\.(md|mdx)$/i, '');
}

export function deriveStaticLocalizedDocRoutes(pageFilePaths) {
  return [...new Set(
    pageFilePaths
      .map((filePath) => filePath.replace(/\\/g, '/'))
      .filter((filePath) => filePath.endsWith('.astro'))
      .filter((filePath) => !filePath.endsWith('/[...slug].astro'))
      .map((filePath) => filePath.replace(/^src\/pages\/\[locale\]/, ''))
      .map((filePath) => filePath.replace(/\.astro$/i, ''))
      .filter((route) => route.startsWith('/docs/')),
  )].sort();
}

export function normalizeRoutePath(route) {
  if (!route || route === '/') return '/';
  const [pathname] = route.split(/[?#]/, 1);
  const normalized = pathname.replace(/\/+/g, '/').replace(/\/$/, '');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

export function getRedirectTargetForRoute(route, locales) {
  const normalizedRoute = normalizeRoutePath(route);
  const primaryLocale = locales[0];
  if (!primaryLocale) return null;
  if (normalizedRoute === '/') return `/${primaryLocale}/`;
  if (normalizedRoute.startsWith('/docs/')) return `/${primaryLocale}${normalizedRoute}`;
  return null;
}

export function buildExpectedRouteManifest({ locales, docSlugs, staticLocalizedDocRoutes }) {
  const manifest = [];
  const seen = new Set();

  const add = (entry) => {
    const key = `${entry.kind}:${entry.route}`;
    if (seen.has(key)) return;
    seen.add(key);
    manifest.push(entry);
  };

  add({
    kind: 'redirect',
    route: '/',
    redirectTo: getRedirectTargetForRoute('/', locales),
  });

  for (const slug of [...new Set(docSlugs)].sort()) {
    const baseRoute = `/docs/${slug}`;
    add({
      kind: 'redirect',
      route: baseRoute,
      redirectTo: getRedirectTargetForRoute(baseRoute, locales),
    });
  }

  for (const locale of [...new Set(locales)].sort()) {
    add({ kind: 'page', route: `/${locale}` });

    for (const slug of [...new Set(docSlugs)].sort()) {
      add({ kind: 'page', route: `/${locale}/docs/${slug}` });
    }

    for (const staticRoute of [...new Set(staticLocalizedDocRoutes)].sort()) {
      add({ kind: 'page', route: `/${locale}${normalizeRoutePath(staticRoute)}` });
    }
  }

  return manifest.sort((left, right) => left.route.localeCompare(right.route) || left.kind.localeCompare(right.kind));
}

export function collectMarkdownReferences(markdown) {
  const references = [];
  let searchFrom = 0;

  while (searchFrom < markdown.length) {
    const targetStart = markdown.indexOf('](', searchFrom);
    if (targetStart === -1) break;

    const valueStart = targetStart + 2;
    let cursor = valueStart;
    let depth = 1;

    while (cursor < markdown.length && depth > 0) {
      const character = markdown[cursor];
      if (character === '\\') {
        cursor += 2;
        continue;
      }
      if (character === '(') depth += 1;
      if (character === ')') depth -= 1;
      cursor += 1;
    }

    if (depth !== 0) {
      searchFrom = valueStart;
      continue;
    }

    let rawTarget = markdown.slice(valueStart, cursor - 1).trim();
    searchFrom = cursor;
    if (!rawTarget) continue;
    if (rawTarget.startsWith('<') && rawTarget.endsWith('>')) {
      rawTarget = rawTarget.slice(1, -1).trim();
    }
    if (rawTarget.startsWith('#')) continue;
    if (OPTIONAL_REFERENCE_PROTOCOLS.some((protocol) => rawTarget.startsWith(protocol))) continue;
    if (!rawTarget.startsWith('/')) continue;
    references.push({ target: rawTarget });
  }

  return references;
}

export function validateArtifactsCatalog(catalog, fileLabel = 'src/data/artifacts.json', publicPaths = null) {
  const errors = [];

  if (!isPlainObject(catalog)) {
    return [`${fileLabel}: expected a JSON object at the top level.`];
  }

  if (typeof catalog.version !== 'string' || catalog.version.trim() === '') {
    errors.push(`${fileLabel}: version must be a non-empty string.`);
  }

  if (typeof catalog.generatedAt !== 'string' || catalog.generatedAt.trim() === '') {
    errors.push(`${fileLabel}: generatedAt must be a non-empty string.`);
  }

  if (!Number.isInteger(catalog.totalCount) || catalog.totalCount < 0) {
    errors.push(`${fileLabel}: totalCount must be a non-negative integer.`);
  }

  if (!isPlainObject(catalog.byType)) {
    errors.push(`${fileLabel}: byType must be an object keyed by artifact kind.`);
  }

  if (!Array.isArray(catalog.artifacts)) {
    errors.push(`${fileLabel}: artifacts must be an array.`);
    return errors;
  }

  if (Number.isInteger(catalog.totalCount) && catalog.totalCount !== catalog.artifacts.length) {
    errors.push(
      `${fileLabel}: totalCount must equal artifacts.length (expected ${catalog.artifacts.length}, received ${catalog.totalCount}).`,
    );
  }

  const computedByType = new Map();
  for (const [index, artifact] of catalog.artifacts.entries()) {
    if (!isPlainObject(artifact)) {
      errors.push(`${fileLabel}: artifacts[${index}] must be an object.`);
      continue;
    }

    requireString(errors, `${fileLabel}: artifacts[${index}].file`, artifact.file);
    requireString(errors, `${fileLabel}: artifacts[${index}].kind`, artifact.kind);
    requireString(errors, `${fileLabel}: artifacts[${index}].title`, artifact.title);
    requireString(errors, `${fileLabel}: artifacts[${index}].description`, artifact.description);

    if (typeof artifact.kind === 'string' && artifact.kind.trim() !== '') {
      computedByType.set(artifact.kind, (computedByType.get(artifact.kind) ?? 0) + 1);
    }
  }

  if (isPlainObject(catalog.byType)) {
    const expectedKinds = new Set([...Object.keys(catalog.byType), ...computedByType.keys()]);
    for (const kind of [...expectedKinds].sort()) {
      const received = catalog.byType[kind];
      if (!Number.isInteger(received) || received < 0) {
        errors.push(`${fileLabel}: byType.${kind} must be a non-negative integer.`);
        continue;
      }

      const expected = computedByType.get(kind) ?? 0;
      if (received !== expected) {
        errors.push(
          `${fileLabel}: byType.${kind} must equal the number of artifacts with kind "${kind}" (expected ${expected}, received ${received}).`,
        );
      }
    }
  }

  if (publicPaths instanceof Set) {
    errors.push(...validatePublicInventoryCoverage({
      entries: catalog.artifacts,
      fileLabel: `${fileLabel}: artifacts`,
      governedPrefixes: ['/notebooklm/'],
      publicPaths,
    }));
  }

  return errors;
}

export function validateVisualAssetsCatalog(
  catalog,
  publicPaths,
  fileLabel = 'src/data/visual-assets.json',
) {
  const errors = [];

  if (!isPlainObject(catalog)) {
    return [`${fileLabel}: expected a JSON object at the top level.`];
  }

  requireString(errors, `${fileLabel}: version`, catalog.version);
  requireString(errors, `${fileLabel}: inventoryUpdatedAt`, catalog.inventoryUpdatedAt);

  if (!Number.isInteger(catalog.totalCount) || catalog.totalCount < 0) {
    errors.push(`${fileLabel}: totalCount must be a non-negative integer.`);
  }

  if (!isPlainObject(catalog.byCategory)) {
    errors.push(`${fileLabel}: byCategory must be an object keyed by asset category.`);
  }

  if (!Array.isArray(catalog.assets)) {
    errors.push(`${fileLabel}: assets must be an array.`);
    return errors;
  }

  if (Number.isInteger(catalog.totalCount) && catalog.totalCount !== catalog.assets.length) {
    errors.push(
      `${fileLabel}: totalCount must equal assets.length (expected ${catalog.assets.length}, received ${catalog.totalCount}).`,
    );
  }

  const computedByCategory = new Map();
  for (const [index, asset] of catalog.assets.entries()) {
    if (!isPlainObject(asset)) {
      errors.push(`${fileLabel}: assets[${index}] must be an object.`);
      continue;
    }

    requireString(errors, `${fileLabel}: assets[${index}].file`, asset.file);
    requireString(errors, `${fileLabel}: assets[${index}].category`, asset.category);
    requireString(errors, `${fileLabel}: assets[${index}].title`, asset.title);
    requireString(errors, `${fileLabel}: assets[${index}].description`, asset.description);

    if (typeof asset.category === 'string' && asset.category.trim() !== '') {
      computedByCategory.set(asset.category, (computedByCategory.get(asset.category) ?? 0) + 1);
    }
  }

  validateCountMap({
    actualCounts: catalog.byCategory,
    computedCounts: computedByCategory,
    errors,
    fileLabel,
    mapName: 'byCategory',
    itemLabel: 'assets with category',
  });

  if (publicPaths instanceof Set) {
    errors.push(...validatePublicInventoryCoverage({
      entries: catalog.assets,
      fileLabel: `${fileLabel}: assets`,
      governedPrefixes: ['/assets/generated/', '/assets/website/'],
      publicPaths,
    }));
  }

  return errors;
}

export function validatePublicInventoryCoverage({
  entries,
  fileLabel,
  governedPrefixes,
  publicPaths,
}) {
  const errors = [];
  const inventoriedPaths = new Map();

  for (const [index, entry] of entries.entries()) {
    if (!isPlainObject(entry) || typeof entry.file !== 'string' || entry.file.trim() === '') continue;

    const publicPath = `/${entry.file.replace(/^\/+/, '')}`;
    const firstIndex = inventoriedPaths.get(publicPath);
    if (firstIndex !== undefined) {
      errors.push(`${fileLabel}[${index}].file duplicates ${publicPath}, first listed at index ${firstIndex}.`);
      continue;
    }
    inventoriedPaths.set(publicPath, index);

    if (!governedPrefixes.some((prefix) => publicPath.startsWith(prefix))) {
      errors.push(`${fileLabel}[${index}].file is outside the governed public directories: ${publicPath}.`);
      continue;
    }

    if (!publicPaths.has(publicPath)) {
      errors.push(`${fileLabel}[${index}].file points to a missing public file: ${publicPath}.`);
    }
  }

  const governedPublicPaths = [...publicPaths]
    .filter((publicPath) => governedPrefixes.some((prefix) => publicPath.startsWith(prefix)))
    .sort();
  for (const publicPath of governedPublicPaths) {
    if (!inventoriedPaths.has(publicPath)) {
      errors.push(`${fileLabel} does not inventory public file: ${publicPath}.`);
    }
  }

  return errors;
}

export async function collectRepositoryContracts(rootDir) {
  const i18nSource = await readTextFile(path.join(rootDir, I18N_FILE));
  const locales = parseLocalesFromI18nSource(i18nSource);

  const docFiles = await listFiles(path.join(rootDir, DOCS_CONTENT_DIR), (filePath) => /\.(md|mdx)$/i.test(filePath));
  const docSlugs = docFiles.map((filePath) => filePathToDocSlug(path.relative(rootDir, filePath))).sort();

  const localizedDocPageFiles = await listFiles(path.join(rootDir, DOCS_PAGES_DIR), (filePath) => filePath.endsWith('.astro'));
  const staticLocalizedDocRoutes = deriveStaticLocalizedDocRoutes(
    localizedDocPageFiles.map((filePath) => path.relative(rootDir, filePath)),
  );

  const frDocFiles = await listFiles(path.join(rootDir, FR_DOCS_CONTENT_DIR), (filePath) => /\.(md|mdx)$/i.test(filePath));
  const markdownFiles = [...docFiles, ...frDocFiles]
    .map((filePath) => path.relative(rootDir, filePath))
    .sort();
  const publicFiles = await listFiles(path.join(rootDir, PUBLIC_DIR));
  const publicPaths = new Set(
    publicFiles.map((filePath) => `/${path.relative(path.join(rootDir, PUBLIC_DIR), filePath).split(path.sep).join('/')}`),
  );

  const routeManifest = buildExpectedRouteManifest({ locales, docSlugs, staticLocalizedDocRoutes });
  const knownRoutes = new Set(routeManifest.map((entry) => normalizeRoutePath(entry.route)));

  return {
    docSlugs,
    i18nSource,
    knownRoutes,
    locales,
    markdownFiles,
    publicPaths,
    routeManifest,
    staticLocalizedDocRoutes,
  };
}

export async function readJsonFile(filePath, label) {
  const source = await readTextFile(filePath);
  try {
    return JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label}: invalid JSON (${message}).`);
  }
}

export async function readTextFile(filePath) {
  return fs.readFile(filePath, 'utf8');
}

export function validateSiteData(siteData, { knownRoutes, publicPaths, inventoryCounts = {} }) {
  const errors = [];
  const fileLabel = 'src/data/site-data.json';

  if (!isPlainObject(siteData)) {
    return [`${fileLabel}: expected a JSON object at the top level.`];
  }

  requireString(errors, `${fileLabel}: brandName`, siteData.brandName);
  requireString(errors, `${fileLabel}: tagline`, siteData.tagline);
  requireString(errors, `${fileLabel}: themeName`, siteData.themeName);
  requireString(errors, `${fileLabel}: defaultTheme`, siteData.defaultTheme);
  requireString(errors, `${fileLabel}: launchChannel`, siteData.launchChannel);
  requireString(errors, `${fileLabel}: heroTitle`, siteData.heroTitle);
  requireString(errors, `${fileLabel}: heroSubtitle`, siteData.heroSubtitle);
  requireString(errors, `${fileLabel}: docsHomeHref`, siteData.docsHomeHref);
  requireString(errors, `${fileLabel}: heroPrimaryHref`, siteData.heroPrimaryHref);
  requireString(errors, `${fileLabel}: heroSecondaryHref`, siteData.heroSecondaryHref);
  requireString(errors, `${fileLabel}: heroImage`, siteData.heroImage);
  requireString(errors, `${fileLabel}: heroImageAlt`, siteData.heroImageAlt);
  requireString(errors, `${fileLabel}: publishedAtHuman`, siteData.publishedAtHuman);
  requireString(errors, `${fileLabel}: runLabel`, siteData.runLabel);

  validateLabeledPairs(errors, `${fileLabel}: metrics`, siteData.metrics);
  validateLabeledPairs(errors, `${fileLabel}: launchFacts`, siteData.launchFacts);
  validateStringArray(errors, `${fileLabel}: storyPillars`, siteData.storyPillars);
  validateFeatureCards(errors, `${fileLabel}: featuredDocs`, siteData.featuredDocs, knownRoutes, publicPaths);
  validateVisualHighlights(errors, `${fileLabel}: visualHighlights`, siteData.visualHighlights, knownRoutes, publicPaths);
  validateNotebookHighlights(errors, `${fileLabel}: notebooklmHighlights`, siteData.notebooklmHighlights, knownRoutes, publicPaths);
  validatePalette(errors, `${fileLabel}: palette`, siteData.palette);
  validateTypography(errors, `${fileLabel}: typography`, siteData.typography);

  for (const [metricLabel, expectedCount] of Object.entries(inventoryCounts)) {
    validateInventoryMetric(errors, `${fileLabel}: metrics`, siteData.metrics, metricLabel, expectedCount);
  }

  validateInternalReference(errors, `${fileLabel}: docsHomeHref`, siteData.docsHomeHref, knownRoutes, publicPaths);
  validateInternalReference(errors, `${fileLabel}: heroPrimaryHref`, siteData.heroPrimaryHref, knownRoutes, publicPaths);
  validateInternalReference(errors, `${fileLabel}: heroSecondaryHref`, siteData.heroSecondaryHref, knownRoutes, publicPaths);
  validateInternalReference(errors, `${fileLabel}: heroImage`, siteData.heroImage, knownRoutes, publicPaths);

  return errors;
}

export async function validateMarkdownContent(rootDir, markdownFiles, { knownRoutes, publicPaths }) {
  const errors = [];

  for (const relativeFilePath of markdownFiles) {
    const absoluteFilePath = path.join(rootDir, relativeFilePath);
    const content = await readTextFile(absoluteFilePath);
    const references = collectMarkdownReferences(content);

    for (const reference of references) {
      validateInternalReference(errors, `${relativeFilePath}: ${reference.target}`, reference.target, knownRoutes, publicPaths);
    }
  }

  return errors;
}

export function distCandidatesForRoute(distDir, route) {
  const normalized = normalizeRoutePath(route);
  if (normalized === '/') {
    return [path.join(distDir, 'index.html')];
  }

  const segments = normalized.slice(1).split('/');
  const dirCandidate = path.join(distDir, ...segments, 'index.html');
  const fileCandidate = path.join(distDir, ...segments.slice(0, -1), `${segments.at(-1)}.html`);
  return [dirCandidate, fileCandidate];
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(errors, label, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${label} must be a non-empty string.`);
  }
}

function validateStringArray(errors, label, value) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array of non-empty strings.`);
    return;
  }

  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || entry.trim() === '') {
      errors.push(`${label}[${index}] must be a non-empty string.`);
    }
  });
}

function validateLabeledPairs(errors, label, value) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array of { label, value } objects.`);
    return;
  }

  value.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      errors.push(`${label}[${index}] must be an object.`);
      return;
    }
    requireString(errors, `${label}[${index}].label`, entry.label);
    requireString(errors, `${label}[${index}].value`, entry.value);
  });
}

function validateInventoryMetric(errors, label, metrics, metricLabel, expectedCount) {
  if (!Array.isArray(metrics)) return;

  const matchingMetrics = metrics.filter((metric) => isPlainObject(metric) && metric.label === metricLabel);
  if (matchingMetrics.length !== 1) {
    errors.push(`${label} must contain exactly one "${metricLabel}" entry.`);
    return;
  }

  const received = matchingMetrics[0].value;
  if (received !== String(expectedCount)) {
    errors.push(`${label} entry "${metricLabel}" must equal inventory count ${expectedCount}, received ${JSON.stringify(received)}.`);
  }
}

function validateCountMap({ actualCounts, computedCounts, errors, fileLabel, mapName, itemLabel }) {
  if (!isPlainObject(actualCounts)) return;

  const expectedKeys = new Set([...Object.keys(actualCounts), ...computedCounts.keys()]);
  for (const key of [...expectedKeys].sort()) {
    const received = actualCounts[key];
    if (!Number.isInteger(received) || received < 0) {
      errors.push(`${fileLabel}: ${mapName}.${key} must be a non-negative integer.`);
      continue;
    }

    const expected = computedCounts.get(key) ?? 0;
    if (received !== expected) {
      errors.push(
        `${fileLabel}: ${mapName}.${key} must equal the number of ${itemLabel} "${key}" (expected ${expected}, received ${received}).`,
      );
    }
  }
}

function validateFeatureCards(errors, label, value, knownRoutes, publicPaths) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array.`);
    return;
  }

  value.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      errors.push(`${label}[${index}] must be an object.`);
      return;
    }
    requireString(errors, `${label}[${index}].title`, entry.title);
    requireString(errors, `${label}[${index}].description`, entry.description);
    requireString(errors, `${label}[${index}].href`, entry.href);
    requireString(errors, `${label}[${index}].eyebrow`, entry.eyebrow);
    validateInternalReference(errors, `${label}[${index}].href`, entry.href, knownRoutes, publicPaths);
  });
}

function validateVisualHighlights(errors, label, value, knownRoutes, publicPaths) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array.`);
    return;
  }

  value.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      errors.push(`${label}[${index}] must be an object.`);
      return;
    }
    requireString(errors, `${label}[${index}].image`, entry.image);
    requireString(errors, `${label}[${index}].title`, entry.title);
    requireString(errors, `${label}[${index}].eyebrow`, entry.eyebrow);
    requireString(errors, `${label}[${index}].description`, entry.description);
    requireString(errors, `${label}[${index}].href`, entry.href);
    validateInternalReference(errors, `${label}[${index}].image`, entry.image, knownRoutes, publicPaths);
    validateInternalReference(errors, `${label}[${index}].href`, entry.href, knownRoutes, publicPaths);
  });
}

function validateNotebookHighlights(errors, label, value, knownRoutes, publicPaths) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array.`);
    return;
  }

  value.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      errors.push(`${label}[${index}] must be an object.`);
      return;
    }
    requireString(errors, `${label}[${index}].kind`, entry.kind);
    requireString(errors, `${label}[${index}].title`, entry.title);
    requireString(errors, `${label}[${index}].description`, entry.description);
    requireString(errors, `${label}[${index}].href`, entry.href);
    if ('image' in entry && entry.image !== undefined && entry.image !== null) {
      requireString(errors, `${label}[${index}].image`, entry.image);
      validateInternalReference(errors, `${label}[${index}].image`, entry.image, knownRoutes, publicPaths);
    }
    validateInternalReference(errors, `${label}[${index}].href`, entry.href, knownRoutes, publicPaths);
  });
}

function validatePalette(errors, label, palette) {
  if (!isPlainObject(palette)) {
    errors.push(`${label} must be an object.`);
    return;
  }

  for (const section of ['primary', 'secondary', 'accent', 'support', 'signal']) {
    const value = palette[section];
    if (!isPlainObject(value)) {
      errors.push(`${label}.${section} must be an object.`);
      continue;
    }
    requireString(errors, `${label}.${section}.name`, value.name);
    requireString(errors, `${label}.${section}.hex`, value.hex);
    requireString(errors, `${label}.${section}.role`, value.role);
    if (typeof value.hex === 'string' && !/^#[0-9a-fA-F]{6}$/.test(value.hex)) {
      errors.push(`${label}.${section}.hex must be a 6-digit hex color like "#2EE600".`);
    }
  }
}

function validateTypography(errors, label, typography) {
  if (!isPlainObject(typography)) {
    errors.push(`${label} must be an object.`);
    return;
  }

  validateTypographySection(errors, `${label}.header`, typography.header, true);
  validateTypographySection(errors, `${label}.body`, typography.body, false);
  validateTypographySection(errors, `${label}.data`, typography.data, false);
}

function validateTypographySection(errors, label, value, requireDisplayWeights) {
  if (!isPlainObject(value)) {
    errors.push(`${label} must be an object.`);
    return;
  }

  requireString(errors, `${label}.font`, value.font);
  validateStringArray(errors, `${label}.weights`, value.weights);

  if (requireDisplayWeights) {
    requireString(errors, `${label}.display_weight`, value.display_weight);
    requireString(errors, `${label}.emphasis_weight`, value.emphasis_weight);
    requireString(errors, `${label}.case`, value.case);
  }
}

function validateInternalReference(errors, label, target, knownRoutes, publicPaths) {
  if (typeof target !== 'string' || target.trim() === '') return;
  if (OPTIONAL_REFERENCE_PROTOCOLS.some((protocol) => target.startsWith(protocol))) return;
  if (target.startsWith('#')) return;

  const normalizedTarget = normalizeReferenceTarget(target);
  if (!normalizedTarget) return;

  if (normalizedTarget.startsWith('/assets/') || normalizedTarget.startsWith('/notebooklm/')) {
    if (!publicPaths.has(normalizedTarget)) {
      errors.push(`${label} points to a missing public file: ${normalizedTarget}.`);
    }
    return;
  }

  if (!knownRoutes.has(normalizeRoutePath(normalizedTarget))) {
    errors.push(`${label} points to a route that is not generated by this repository: ${normalizedTarget}.`);
  }
}

function normalizeReferenceTarget(target) {
  let normalized = target.trim();
  if (!normalized.startsWith('/')) return null;

  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    return normalized;
  }

  return normalizeRoutePath(normalized);
}

async function listFiles(directoryPath, predicate = () => true) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath, predicate));
      continue;
    }

    if (predicate(absolutePath)) {
      files.push(absolutePath);
    }
  }

  return files.sort();
}
