const fs = require('fs');
const path = require('path');

function read(p) {
  const buf = fs.readFileSync(p);
  const start = (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) ? 3 : 0;
  return buf.slice(start).toString('utf8');
}

function fix(p) {
  let c = read(p);
  const before = c;
  c = c
    .replace(/--yellow:\s*#F5C518;/g, '--red:      #C8281A;')
    .replace(/--gold:\s*#E6AC00;/g, '--red-dark: #A81F0F;')
    .replace(/var\(--yellow\)/g, 'var(--red)')
    .replace(/var\(--gold\)/g, 'var(--red-dark)')
    .replace(/rgba\(245,197,24,0\.08\)/g, 'rgba(200,40,26,0.12)')
    .replace(/rgba\(245,197,24,0\.3\)/g, 'rgba(200,40,26,0.35)')
    .replace(/rgba\(245,197,24,0\.15\)/g, 'rgba(200,40,26,0.15)')
    // stat label on red bg
    .replace(/color: rgba\(0,0,0,0\.6\);\n  margin-top: 6px;/g, 'color: rgba(255,255,255,0.75);\n  margin-top: 6px;');
  if (c !== before) {
    fs.writeFileSync(p, c, 'utf8');
    console.log('Fixed:', path.basename(p));
  } else {
    console.log('No change:', path.basename(p));
  }
}

const base = __dirname;

// Fix CSS
fix(path.join(base, 'images', 'styles.css'));

// Fix all HTML files
function walk(dir) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'dist' && e.name !== 'node_modules') walk(p);
    else if (e.name.endsWith('.html')) fix(p);
  }
}
walk(base);

console.log('Done');
