const fs = require('fs');
const path = require('path');

const token = process.env.GITHUB_TOKEN;
const repo = "EshiStudio/OpenCode-Mobile";
const tag = "v1.6.6";
const apkPath = path.join(__dirname, '../android/app/build/outputs/apk/release/app-release.apk');

async function createOrUpdateRelease() {
  console.log("Проверяем релиз", tag, "в", repo);
  
  // 1. Get release
  let res = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, {
    headers: { Authorization: `token ${token}` }
  });
  let release = await res.json();
  
  if (release.message === 'Not Found') {
    console.log('Создаем новый релиз...');
    res = await fetch(`https://api.github.com/repos/${repo}/releases`, {
      method: 'POST',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name: tag, name: `Release ${tag}` })
    });
    release = await res.json();
  } else {
    console.log('Релиз найден:', release.id);
    for (const asset of release.assets || []) {
      if (asset.name === `opencode-mobile-${tag}.apk`) {
        console.log('Удаляем старый APK из релиза', asset.id);
        await fetch(`https://api.github.com/repos/${repo}/releases/assets/${asset.id}`, {
          method: 'DELETE',
          headers: { Authorization: `token ${token}` }
        });
      }
    }
  }
  
  const uploadUrl = release.upload_url.replace('{?name,label}', `?name=opencode-mobile-${tag}.apk`);
  const fileStats = fs.statSync(apkPath);
  console.log('Загружаем новый APK...', fileStats.size, 'байт');
  
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': fileStats.size
    },
    body: fs.readFileSync(apkPath)
  });
  
  const uploadData = await uploadRes.json();
  if (uploadData.browser_download_url) {
    console.log("✅ Успешно загружено! Ссылка:", uploadData.browser_download_url);
    const desktopPath = path.join(require('os').homedir(), 'Desktop', `opencode-mobile-${tag}.apk`);
    fs.copyFileSync(apkPath, desktopPath);
    console.log("✅ APK скопирован на рабочий стол:", desktopPath);
  } else {
    console.error("Ошибка при загрузке:", uploadData);
  }
}

createOrUpdateRelease();
