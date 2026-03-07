#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const widgetFile = path.join(root, 'infra/stacks/observability/cheer-dashboard-widgets.ts');
const catalogFile = path.join(root, 'docs/cheer-observability-widget-catalog.md');

const widgetSrc = fs.readFileSync(widgetFile, 'utf8');
const catalogSrc = fs.readFileSync(catalogFile, 'utf8');

const widgetTitleMatches = [...widgetSrc.matchAll(/title:\s*'([^']+)'/g)].map((m) => m[1]);
const catalogTitleMatches = [...catalogSrc.matchAll(/^###\s+(.+)$/gm)].map((m) => m[1].trim());

const unique = (arr) => [...new Set(arr)];
const widgetTitles = unique(widgetTitleMatches);
const catalogTitles = unique(catalogTitleMatches);

const dupWidget = widgetTitleMatches.filter((item, idx) => widgetTitleMatches.indexOf(item) !== idx);
const dupCatalog = catalogTitleMatches.filter((item, idx) => catalogTitleMatches.indexOf(item) !== idx);

const missingInCatalog = widgetTitles.filter((t) => !catalogTitles.includes(t));
const missingInWidget = catalogTitles.filter((t) => !widgetTitles.includes(t));

if (dupWidget.length > 0) {
  console.error('[widget-lint] duplicated widget titles in template:', unique(dupWidget).join(', '));
}
if (dupCatalog.length > 0) {
  console.error('[widget-lint] duplicated widget titles in catalog:', unique(dupCatalog).join(', '));
}
if (missingInCatalog.length > 0) {
  console.error('[widget-lint] template titles missing in docs catalog:', missingInCatalog.join(', '));
}
if (missingInWidget.length > 0) {
  console.error('[widget-lint] docs catalog titles missing in template:', missingInWidget.join(', '));
}

if (dupWidget.length > 0 || dupCatalog.length > 0 || missingInCatalog.length > 0 || missingInWidget.length > 0) {
  process.exit(1);
}

console.log(`[widget-lint] ok: ${widgetTitles.length} widget titles are synchronized`);
