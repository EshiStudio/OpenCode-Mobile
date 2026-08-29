const fs = require('fs');
let uploadJs = fs.readFileSync('scripts/upload.js', 'utf8');
uploadJs = uploadJs.replace(/const tag = ".*";/, 'const tag = "v1.3.3";');
fs.writeFileSync('scripts/upload.js', uploadJs);
