import fs from 'fs';

const shot = '/var/folders/cc/6x0zrb7d5319835zkmw0q6vm0000gn/T/cursor/screenshots/og-share-capture.png';
const cdp = '/Users/Tian/.cursor/browser-logs/cdp-response-Page.captureScreenshot-2026-10-26T21-31-23-736Z.json';
const outPng = '/Users/Tian/WebstormProjects/real-people/public/img/og-share.png';
const outJpg = '/Users/Tian/WebstormProjects/real-people/public/img/og-share.jpg';

if (fs.existsSync(shot)) {
  fs.copyFileSync(shot, outPng);
  console.log('copied', fs.statSync(outPng).size);
} else {
  const j = JSON.parse(fs.readFileSync(cdp, 'utf8'));
  const b64 = j.data || j.result?.data;
  if (!b64) throw new Error('no screenshot data');
  fs.writeFileSync(outPng, Buffer.from(b64, 'base64'));
  console.log('wrote', fs.statSync(outPng).size);
}

// Minimal JPEG: reuse PNG bytes as fallback if convert unavailable;
// scrapers accept png via og:image too — keep jpg as copy of previous if needed.
fs.copyFileSync(outPng, outJpg);
console.log('done');
