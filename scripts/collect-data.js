const https = require('https');
const fs = require('fs');
const path = require('path');

const PAT = process.env.GH_PAT;
const DEBUG_REPOOWNER = process.env.DEBUG_REPOOWNER === '1';

function makeRequest(url) {
  return new Promise((resolve) => {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Node.js'
    };

    // Wie früher: wenn PAT fehlt, senden wir keinen Authorization Header.
    // Dann liefert GitHub ggf. 401/403, aber Script läuft weiter.
    if (PAT && String(PAT).trim().length > 0) {
      headers['Authorization'] = `token ${PAT}`;
    }

    const options = { headers };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }

        resolve({
          success: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          data: parsed
        });
      });
    }).on('error', (err) => resolve({ success: false, status: 0, data: String(err) }));
  });
}

function extractRepoOwnerString(raw) {
  if (raw == null) return '';

  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw).trim();
  }

  if (Array.isArray(raw)) {
    return raw.map(extractRepoOwnerString).filter(Boolean).join(',').trim();
  }

  if (typeof raw === 'object') {
    const candidates = [
      raw.name,
      raw.value,
      raw.label,
      raw.display_name,
      raw.displayName,
      raw.login
    ];

    for (const c of candidates) {
      const s = extractRepoOwnerString(c);
      if (s) return s;
    }

    // limited deep search
    for (const k of Object.keys(raw)) {
      const v = raw[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (v && typeof v === 'object') {
        const s = extractRepoOwnerString(v);
        if (s) return s;
      }
    }

    return '';
  }

  return '';
}

function isActiveByRepoOwner(rawRepoOwnerValue) {
  const v = extractRepoOwnerString(rawRepoOwnerValue).trim();
  if (!v) return false;
  if (v.toLowerCase() === 'default') return false;
  return true;
}

async function getRepoOwnerCustomProperty(org, repo) {
  const url = `https://api.github.com/repos/${org}/${repo}/properties/values`;
  const result = await makeRequest(url);

  if (!result.success || !result.data) return { ok: false, value: null, status: result.status };

  if (Array.isArray(result.data)) {
    const hit = result.data.find(p =>
      p.property_name === 'RepoOwner' ||
      p.propertyName === 'RepoOwner' ||
      p.name === 'RepoOwner'
    );
    if (!hit) return { ok: true, value: null, status: result.status };

    if ('value' in hit) return { ok: true, value: hit.value, status: result.status };
    if ('string_value' in hit) return { ok: true, value: hit.string_value, status: result.status };
    if ('selected_value' in hit) return { ok: true, value: hit.selected_value, status: result.status };
    if ('values' in hit) return { ok: true, value: hit.values, status: result.status };

    return { ok: true, value: null, status: result.status };
  }

  if (typeof result.data === 'object' && result.data !== null) {
    if ('RepoOwner' in result.data) return { ok: true, value: result.data.RepoOwner, status: result.status };
  }

  return { ok: true, value: null, status: result.status };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (true) {
      const current = idx++;
      if (current >= items.length) return;
      results[current] = await mapper(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function getOrgRepos(org) {
  console.log(`📦 ${org}`);

  let allRepos = [];
  let page = 1;

  while (true) {
    const url = `https://api.github.com/orgs/${org}/repos?per_page=100&page=${page}&type=all`;
    const result = await makeRequest(url);

    if (!result.success) {
      console.error(`  ❌ ${org}: cannot list repos. status=${result.status}`);
      console.error(`  ❌ response:`, result.data);
      break;
    }

    if (!Array.isArray(result.data) || result.data.length === 0) break;

    allRepos = allRepos.concat(result.data);
    console.log(`  📄 Page ${page}: ${result.data.length} repos (Total: ${allRepos.length})`);

    if (result.data.length < 100) break;
    page++;
  }

  const repos = allRepos.filter(r => !r.archived);

  const props = await mapWithConcurrency(repos, 8, async (r) => {
    const { ok, value, status } = await getRepoOwnerCustomProperty(org, r.name);

    if (DEBUG_REPOOWNER) {
      console.log(`  🔎 ${org}/${r.name} propsStatus=${status} raw=`, value, ' extracted=', extractRepoOwnerString(value));
    }

    return { ok, value };
  });

  const activeRepos = props.filter(x => x.ok && isActiveByRepoOwner(x.value)).length;

  console.log(`  ✅ ${org}: ${repos.length} total (ohne archiv), ${activeRepos} aktiv (RepoOwner != default/leer)\n`);
  return { totalRepos: repos.length, activeRepos };
}

async function collectData() {
  const ORGS = [
    'AS-ASK-IT',
    'as-cloud-services',
    'asitservices',
    'axelspringer',
    'Media-Impact',
    'spring-media',
    'welttv'
  ];

  const organizations = [];
  const trendEntry = { date: new Date().toISOString().split('T')[0] };

  for (const org of ORGS) {
    try {
      const { totalRepos, activeRepos } = await getOrgRepos(org);

      organizations.push({
        name: org,
        totalRepos,
        activeRepos,
        lastUpdated: new Date().toISOString()
      });

      trendEntry[org] = totalRepos;
    } catch (error) {
      console.error(`❌ ${org}: ${error.message}`);
      trendEntry[org] = 0;
    }
  }

  const dataDir = path.join(__dirname, '../docs/data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  let trends = [];
  const dataFile = path.join(dataDir, 'dashboard-data.json');

  if (fs.existsSync(dataFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      trends = existing.trends || [];
    } catch {
      trends = [];
    }
  }

  trends.push(trendEntry);
  if (trends.length > 90) trends = trends.slice(-90);

  fs.writeFileSync(dataFile, JSON.stringify({ organizations, trends }, null, 2));
  console.log('✅ Data saved!');
}

collectData().catch(console.error);
