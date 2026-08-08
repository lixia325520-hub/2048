// 全服排行榜 - 提交分数 API
const REPO = process.env.GITHUB_REPO || 'lixia325520-hub/2048';
const FILE_PATH = 'leaderboard.json';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const TOKEN = process.env.GITHUB_TOKEN;
const MAX_RETRIES = 3;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, msg: '仅支持 POST' });

  const { name, score } = req.body || {};
  if (!name || typeof score !== 'number' || score < 0) {
    return res.status(400).json({ ok: false, msg: '请提供有效的 name 和 score' });
  }
  if (!TOKEN) {
    return res.status(500).json({ ok: false, msg: '服务端未配置 GITHUB_TOKEN 环境变量' });
  }

  const trimmedName = String(name).trim().slice(0, 12);
  if (!trimmedName) return res.status(400).json({ ok: false, msg: '名字不能为空' });

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // 1. 获取当前 leaderboard.json
      const getRes = await fetch(
        `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`,
        {
          headers: {
            Authorization: `token ${TOKEN}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': '2048-game-api',
          },
        }
      );
      if (!getRes.ok) throw new Error(`GitHub GET 失败: ${getRes.status}`);

      const fileData = await getRes.json();
      const sha = fileData.sha;
      const content = Buffer.from(fileData.content, 'base64').toString('utf8');
      const leaderboard = JSON.parse(content);
      if (!leaderboard.list) leaderboard.list = [];

      // 2. 更新排行榜
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const timeStr = `${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const newEntry = { n: trimmedName, s: score, t: timeStr };

      let existIdx = -1;
      for (let i = 0; i < leaderboard.list.length; i++) {
        if (leaderboard.list[i].n === trimmedName) { existIdx = i; break; }
      }
      if (existIdx >= 0) {
        if (score > leaderboard.list[existIdx].s) leaderboard.list[existIdx] = newEntry;
      } else {
        leaderboard.list.push(newEntry);
      }
      leaderboard.list.sort((a, b) => b.s - a.s);
      if (leaderboard.list.length > 50) leaderboard.list = leaderboard.list.slice(0, 50);
      leaderboard.syncedAt = Date.now();

      // 3. 写回 GitHub
      const newContent = JSON.stringify(leaderboard, null, 2);
      const newContentB64 = Buffer.from(newContent).toString('base64');
      const putRes = await fetch(
        `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `token ${TOKEN}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': '2048-game-api',
          },
          body: JSON.stringify({
            message: `📊 ${trimmedName} - ${score}分`,
            content: newContentB64,
            sha: sha,
            branch: BRANCH,
          }),
        }
      );

      if (!putRes.ok) {
        const errBody = await putRes.text();
        console.error('GitHub PUT 失败:', putRes.status, errBody);
        if (putRes.status === 409) {
          // SHA 冲突，等一小会重试
          await new Promise((r) => setTimeout(r, 600 + Math.random() * 1200));
          continue;
        }
        throw new Error(`GitHub PUT 失败: ${putRes.status}`);
      }

      return res.json({ ok: true, list: leaderboard.list });
    } catch (e) {
      console.error(`第 ${attempt + 1} 次尝试失败:`, e.message);
      if (attempt === MAX_RETRIES - 1) {
        return res.status(500).json({ ok: false, msg: e.message });
      }
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 1200));
    }
  }
}
