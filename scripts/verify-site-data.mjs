import path from 'node:path';

import {
  collectRepositoryContracts,
  readJsonFile,
  validateArtifactsCatalog,
  validateMarkdownContent,
  validateSiteData,
} from './lib/verification-core.mjs';

async function main() {
  const rootDir = process.cwd();
  const contracts = await collectRepositoryContracts(rootDir);
  const siteData = await readJsonFile(
    path.join(rootDir, 'src', 'data', 'site-data.json'),
    'src/data/site-data.json',
  );
  const artifactsCatalog = await readJsonFile(
    path.join(rootDir, 'src', 'data', 'artifacts.json'),
    'src/data/artifacts.json',
  );

  const errors = [
    ...validateSiteData(siteData, contracts),
    ...validateArtifactsCatalog(artifactsCatalog),
    ...await validateMarkdownContent(rootDir, contracts.markdownFiles, contracts),
  ];

  if (contracts.locales.length === 0) {
    errors.push('src/i18n/index.ts: at least one locale must be declared in LOCALES.');
  }

  if (contracts.docSlugs.length === 0) {
    errors.push('src/content/docs: at least one document page is required to build the wiki.');
  }

  if (errors.length > 0) {
    console.error(`verify:data failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `verify:data passed: ${contracts.docSlugs.length} docs, ${contracts.locales.length} locale(s), ${contracts.publicPaths.size} public file(s), ${contracts.markdownFiles.length} markdown file(s).`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`verify:data crashed:\n${message}`);
  process.exit(1);
});
