'use strict';
/**
 * build.js - The Kindness Mob Site Builder
 * Partials pattern: header + footer injected into each page
 * Run: node build.js
 * Output: dist/
 */

const fs   = require('fs');
const path = require('path');

const SITE_ID = 'kindnessmob';
let injectScripts, loadSiteScripts;
try {
  const lib = require('C:\\Users\\KillerGrowth\\.openclaw\\workspace\\tools\\kg-site-builder\\lib\\inject-scripts');
  injectScripts = lib.injectScripts;
  loadSiteScripts = lib.loadSiteScripts;
} catch (e) {
  // Graceful fallback if builder not available
  injectScripts = (html) => html;
  loadSiteScripts = () => ({});
}

const ROOT  = __dirname;
const DIST  = path.join(ROOT, 'dist');
const PARTS = path.join(ROOT, '_partials');

// BOM-safe read (per KillerGrowth encoding standard)
function read(p) {
  const buf = fs.readFileSync(p);
  const start = (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) ? 3 : 0;
  return buf.slice(start).toString('utf8');
}

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

function injectPartials(html, header, footer) {
  return html
    .replace('<!-- HEADER -->', header)
    .replace('<!-- FOOTER -->', footer);
}

function write(relPath, html, header, footer) {
  html = injectPartials(html, header, footer);
  html = injectScripts(html, loadSiteScripts(SITE_ID));
  const dest = path.join(DIST, relPath);
  ensureDir(path.dirname(dest));
  fs.writeFileSync(dest, html, 'utf8');
  console.log('Built:', relPath);
}

// ========== Setup ==========
ensureDir(DIST);

// Copy assets (images, css, etc.)
copyDir(path.join(ROOT, 'images'), path.join(DIST, 'images'));

// Copy assets folder (logos, favicons, photos)
copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));

// Copy CF Pages functions
copyDir(path.join(ROOT, 'functions'), path.join(DIST, 'functions'));

// Copy static root files (NO _worker.js — CF Pages Functions must handle routing)
const staticRootFiles = ['robots.txt', '404.html'];
for (const f of staticRootFiles) {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(DIST, f));
    console.log('Copied:', f);
  }
}

// Load partials
const HEADER = read(path.join(PARTS, 'header.html'));
const FOOTER  = read(path.join(PARTS, 'footer.html'));

// Pages to build: [sourceFile, outputPath]
const PAGES = [
  ['index.html',                    'index.html'],
  ['about/index.html',              'about/index.html'],
  ['nominate/index.html',           'nominate/index.html'],
  ['volunteer/index.html',          'volunteer/index.html'],
  ['contact/index.html',            'contact/index.html'],
  ['join/index.html',               'join/index.html'],
  ['privacy-policy/index.html',     'privacy-policy/index.html'],
];

for (const [src, out] of PAGES) {
  const srcPath = path.join(ROOT, src);
  if (!fs.existsSync(srcPath)) {
    console.warn('MISSING:', src);
    continue;
  }
  write(out, read(srcPath), HEADER, FOOTER);
}

// Copy 404 to dist root (already done above via staticRootFiles)
// Also inject partials into 404
const page404src = path.join(ROOT, '404.html');
if (fs.existsSync(page404src)) {
  write('404.html', read(page404src), HEADER, FOOTER);
}

// Generate sitemap
const { generateSitemap } = (() => {
  try { return require('./_lib/gen-sitemap'); } catch(e) { return { generateSitemap: null }; }
})();

if (generateSitemap) {
  generateSitemap();
} else {
  // Write minimal sitemap inline
  const today = new Date().toISOString().slice(0, 10);
  const domain = 'https://kindnessmob.pages.dev';
  const urls = [
    { loc: '/', priority: '1.0' },
    { loc: '/about/', priority: '0.8' },
    { loc: '/nominate/', priority: '0.8' },
    { loc: '/volunteer/', priority: '0.8' },
    { loc: '/contact/', priority: '0.8' },
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${domain}${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), xml, 'utf8');
  console.log('Built: sitemap.xml');
}

console.log('\nBuild complete. Output: dist/');
