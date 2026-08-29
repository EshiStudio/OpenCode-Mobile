const token = process.env.GITHUB_TOKEN;
const repo = 'EshiStudio/OpenCode-Mobile';

async function fixReleases() {
  // 1. Get all releases
  let res = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    headers: { Authorization: `token ${token}` }
  });
  let releases = await res.json();
  
  // 2. Find v1.0.1 and delete it
  const v101 = releases.find(r => r.tag_name === 'v1.0.1');
  if (v101) {
    console.log('Удаляю старый релиз v1.0.1...');
    await fetch(`https://api.github.com/repos/${repo}/releases/${v101.id}`, {
      method: 'DELETE',
      headers: { Authorization: `token ${token}` }
    });
    console.log('v1.0.1 удален.');
  }

  // 3. Find v1.3.0 and make it latest
  const v130 = releases.find(r => r.tag_name === 'v1.3.0');
  if (v130) {
    console.log('Делаю v1.3.0 официальным Latest...');
    await fetch(`https://api.github.com/repos/${repo}/releases/${v130.id}`, {
      method: 'PATCH',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ make_latest: 'true' })
    });
    console.log('v1.3.0 теперь Latest!');
  }
}
fixReleases();
