const fs = require('fs');

let appJson = JSON.parse(fs.readFileSync('app.json'));
appJson.expo.version = '1.3.1';
appJson.expo.android.versionCode = 103;
fs.writeFileSync('app.json', JSON.stringify(appJson, null, 2));

let pkgJson = JSON.parse(fs.readFileSync('package.json'));
pkgJson.version = '1.3.1';
fs.writeFileSync('package.json', JSON.stringify(pkgJson, null, 2));

let updateTs = fs.readFileSync('src/update.ts', 'utf8');
updateTs = updateTs.replace(/export const APP_VERSION = ".*";/, 'export const APP_VERSION = "1.3.1";');
fs.writeFileSync('src/update.ts', updateTs);

let uploadJs = fs.readFileSync('scripts/upload.js', 'utf8');
uploadJs = uploadJs.replace(/const tag = "v1.3.0";/, 'const tag = "v1.3.1";');
fs.writeFileSync('scripts/upload.js', uploadJs);
