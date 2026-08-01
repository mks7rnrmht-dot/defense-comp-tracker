// 防御編成集計ツール ローカルサーバー
// 使い方: node server.js  →  http://localhost:3777
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = process.env.PORT || 3777;

// キャラ名・画像は自前で持たず、ba-timeline(公開Vercelツール)のキャラ一覧を使い回す。
// あちらの管理パネルでキャラを追加すれば、ここでも自動的に候補・画像に反映される。
const CHAR_SOURCE_URL = process.env.CHAR_SOURCE_URL || 'https://ba-timeline.vercel.app/characters.json';
const CHAR_CACHE_TTL_MS = 10 * 60 * 1000; // 成功時: 10分キャッシュ(取得の都度たたかない)
const CHAR_CACHE_RETRY_MS = 30 * 1000;    // 失敗時: 30秒したら再試行(毎リクエスト叩きにいかない)
let charCache = { at: 0, list: [] }; // list: [{name, image, role}]

async function fetchExternalCharacters() {
  const ttl = charCache.list.length ? CHAR_CACHE_TTL_MS : CHAR_CACHE_RETRY_MS;
  if (Date.now() - charCache.at < ttl) return charCache.list;
  try {
    const res = await fetch(CHAR_SOURCE_URL);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const list = await res.json();
    const base = new URL(CHAR_SOURCE_URL).origin;
    charCache = {
      at: Date.now(),
      list: list.map((c) => ({ name: c.name, image: base + c.image, role: c.role || '' })),
    };
  } catch (e) {
    // 取得失敗時は直前のキャッシュ(空でも)を使い続ける。ba-timeline側の不調で
    // このツールの保存機能まで止まらないようにするため。
    charCache.at = Date.now();
    console.error('キャラ一覧の取得に失敗:', e.message);
  }
  return charCache.list;
}

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { records: [] };
  }
}

function saveData(data) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req, limit = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function dictionary() {
  const data = loadData();
  const characters = await fetchExternalCharacters();
  const names = new Set(characters.map((c) => c.name));
  // 保存済みレコードの名前も加える(ba-timelineにまだ無い名前の取りこぼし対策)
  for (const rec of data.records) {
    for (const name of rec.characters || []) {
      if (name) names.add(name);
    }
  }
  return { names: [...names] };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/records' && req.method === 'GET') {
      return sendJson(res, 200, loadData());
    }

    if (url.pathname === '/api/records' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      const characters = (body.characters || []).map((s) => String(s).trim()).filter(Boolean);
      if (!characters.length) return sendJson(res, 400, { error: 'キャラ名が空です' });
      const data = loadData();
      const record = {
        id: crypto.randomUUID(),
        savedAt: new Date().toISOString(),
        opponent: {
          name: String(body.opponent?.name ?? '').trim(),
        },
        defenseResult: body.defenseResult === 'Win' || body.defenseResult === 'Lose' ? body.defenseResult : null,
        characters,
      };
      data.records.push(record);
      saveData(data);
      return sendJson(res, 200, { ok: true, record });
    }

    const delMatch = url.pathname.match(/^\/api\/records\/([\w-]+)$/);
    if (delMatch && req.method === 'DELETE') {
      const data = loadData();
      const before = data.records.length;
      data.records = data.records.filter((r) => r.id !== delMatch[1]);
      if (data.records.length === before) return sendJson(res, 404, { error: 'not found' });
      saveData(data);
      return sendJson(res, 200, { ok: true });
    }

    if (url.pathname === '/api/dictionary' && req.method === 'GET') {
      return sendJson(res, 200, await dictionary());
    }

    if (url.pathname === '/api/characters' && req.method === 'GET') {
      return sendJson(res, 200, await fetchExternalCharacters());
    }

    // 静的ファイル
    if (req.method === 'GET') {
      const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const filePath = path.join(PUBLIC_DIR, path.normalize(rel));
      if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        return res.end(fs.readFileSync(filePath));
      }
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (e) {
    sendJson(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`防御編成集計ツール: http://localhost:${PORT}`);
});
