const fs = require('fs');
const { execSync } = require('child_process');

const version = process.argv[2];
if (!version) {
  console.error("Usage: node release.js <version>");
  process.exit(1);
}

console.log(`Bumping to ${version}...`);

let appJson = JSON.parse(fs.readFileSync('app.json'));
appJson.expo.version = version;
appJson.expo.android.versionCode = appJson.expo.android.versionCode + 1;
fs.writeFileSync('app.json', JSON.stringify(appJson, null, 2));

let pkgJson = JSON.parse(fs.readFileSync('package.json'));
pkgJson.version = version;
fs.writeFileSync('package.json', JSON.stringify(pkgJson, null, 2));

// src/update.ts needs no bump: APP_VERSION is read from the native manifest.

let uploadJs = fs.readFileSync('scripts/upload.js', 'utf8');
uploadJs = uploadJs.replace(/const tag = ".*";/, `const tag = "v${version}";`);
fs.writeFileSync('scripts/upload.js', uploadJs);

console.log("Running prebuild...");
execSync('npx expo prebuild -p android', { stdio: 'inherit' });

console.log("Restoring local.properties...");
fs.writeFileSync('android/local.properties', 'sdk.dir=C:/Users/ragus/AppData/Local/Android/Sdk');

console.log("Building APK...");
execSync('cd android && gradlew assembleRelease', { stdio: 'inherit' });

console.log("Done!");
