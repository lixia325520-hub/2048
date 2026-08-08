// 全服排行榜 - 查询 API
const REPO = process.env.GITHUB_REPO || 'lixia325520-hub/2048';
const FILE_PATH = 'leaderboard.json';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const TOKEN = process.env.GITHUB_TOKEN;
const CACHE_TTL = 8000; // 8 秒缓存，减少 GitHub API 调用

let cache = null;
let cacheTime = 0;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, msg: '仅支持 GET' });

  // 返回缓存（8秒内）
  if (cache && Date.now() - cacheTime < CACHE_TTL) {
    return res.json(cache);
  }

  if (!TOKEN) {
    return res.json({ ok: false, msg: '未配置 GITHUB_TOKEN', list: [] });
  }

  try {
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
    const content = Buffer.from(fileData.content, 'base64').toString('utf8');
    const leaderboard = JSON.parse(content);

    cache = { ok: true, list: leaderboard.list || [] };
    cacheTime = Date.now();
    return res.json(cache);
  } catch (e) {
    console.error('排行榜查询失败:', e.message);
    if (cache) return res.json(cache); // 降级：返回过期缓存
    return res.json({ ok: false, msg: e.message, list: [] });
  }
}
