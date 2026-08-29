const fs = require('fs');
const path = require('path');

const token = process.env.GITHUB_TOKEN;
const repo = "EshiStudio/OpenCode-Mobile";
const tag = "v1.3.0";
const apkPath = path.join(__dirname, '../android/app/build/outputs/apk/release/app-release.apk');

async function createRelease() {
  console.log("Создаю релиз", tag, "в", repo);
  const createRes = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tag_name: tag,
      name: `Release ${tag}`,
      body: "Релиз 1.3.0. Добавлена функция автообновления OTA.",
      draft: false,
      prerelease: false
    })
  });
  
  const releaseData = await createRes.json();
  if (!releaseData.upload_url) {
    console.error("Failed to create release", releaseData);
    return;
  }
  
  console.log("Релиз создан. Загружаю APK...");
  const uploadUrl = releaseData.upload_url.replace('{?name,label}', `?name=opencode-mobile-${tag}.apk`);
  
  const fileStats = fs.statSync(apkPath);
  const fileBuffer = fs.readFileSync(apkPath);
  
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': fileStats.size
    },
    body: fileBuffer
  });
  
  const uploadData = await uploadRes.json();
  if (uploadData.browser_download_url) {
    console.log("✅ Успешно! Ссылка на скачивание:", uploadData.browser_download_url);
    
    // Copy the APK to the desktop folder for the user (v19, v20 etc.)
    const desktopPath = path.join(require('os').homedir(), 'Desktop', `opencode-mobile-${tag}.apk`);
    fs.copyFileSync(apkPath, desktopPath);
    console.log("APK также скопирован на рабочий стол:", desktopPath);
  } else {
    console.error("Ошибка при загрузке", uploadData);
  }
}

createRelease();
