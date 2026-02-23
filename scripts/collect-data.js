/**
 * Repo Owner Tracker - Mit GraphQL API
 * Prüft Custom Property "RepoOwner" in jedem Repo
 * - Aktiv: RepoOwner != "Please choose a valid option!" und != "default"
 * - Nicht Aktiv: Leer, "default" oder "Please choose a valid option!"
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const ORGS = [
  'AS-ASK-IT',
  'as-cloud-services',
  'asitservices',
  'axelspringer',
  'Media-Impact',
  'spring-media',
  'welttv'
];

const PAT = process.env.GH_PAT;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function safeJsonRead(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function safeJsonWrite(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}

function isoDateOnly(iso) {
  return String(iso).split('T')[0];
}

// ===== LOGIC =====

function isDefaultValue(value) {
  if (value === null || value === undefined) return true;
  
  const s = String(value ?? '').trim().toLowerCase();
  
  if (!s) return true;
  if (s === 'default') return true;
  if (s.includes('please choose')) return true;
  if (s.includes('choose a valid option')) return true;
  
  return false;
}

// ===== HTTP =====

function makeGraphQLRequest(query) {
  return new Promise((resolve) => {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${PAT}`,
      'User-Agent': 'repo-owner-tracker'
    };

    const body = JSON.stringify({ query });

    const req = https.request('https://api.github.com/graphql', { method: 'POST', headers }, (res) => {
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
    });

    req.on('error', (err) => resolve({ success: false, status: 0, data: String(err) }));
    req.write(body);
    req.end();
  });
}

async function makeGraphQLRequestWithRateLimitHandling(query) {
  const r1 = await makeGraphQLRequest(query);

  const errors = r1.data?.errors || [];
  const rateLimitError = errors.find(e => 
    e.message && e.message.includes('API rate limit exceeded')
  );

  if (!rateLimitError) return r1;

  const resetTime = r1.data?.extensions?.rateLimit?.resetAt;
  if (resetTime) {
    const resetMs = new Date(resetTime).getTime();
    const waitMs = Math.max(0, resetMs - Date.now()) + 1000;
    console.log(`⏳ Rate limit hit. Waiting ${(waitMs / 1000).toFixed(0)}s until reset...`);
    await sleep(waitMs);
    return await makeGraphQLRequest(query);
  }

  return r1;
}

// ===== GITHUB API =====

async function listOrgRepos(org, cursor = null) {
  const query = `
    query {
      organization(login: "${org}") {
        repositories(first: 100, after: ${cursor ? `"${cursor}"` : 'null'}, isArchived: false) {
          nodes {
            name
            updatedAt
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;

  const result = await makeGraphQLRequestWithRateLimitHandling(query);

  if (!result.success || result.data?.errors) {
    console.error(`  ❌ ${org}: cannot list repos`);
    if (result.data?.errors) {
      result.data.errors.forEach(e => console.error(`    ${e.message}`));
    }
    return [];
  }

  const repos = result.data?.data?.organization?.repositories?.nodes || [];
  const pageInfo = result.data?.data?.organization?.repositories?.pageInfo || {};

  if (pageInfo.hasNextPage) {
    const moreRepos = await listOrgRepos(org, pageInfo.endCursor);
    return [...repos, ...moreRepos];
  }

  return repos;
}

async function getRepoOwnerProperty(org, repo) {
  const query = `
    query {
      repository(owner: "${org}", name: "${repo}") {
        customProperties {
          nodes {
            propertyName
            ... on StringCustomProperty {
              stringValue
            }
            ... on SingleSelectCustomProperty {
              selectedValue {
                name
              }
            }
          }
        }
      }
    }
  `;

  const result = await makeGraphQLRequestWithRateLimitHandling(query);

  if (!result.success || result.data?.errors) {
    return { value: null, found: false };
  }

  const properties = result.data?.data?.repository?.customProperties?.nodes || [];
  const repoOwner = properties.find(p => p.propertyName === 'RepoOwner');

  if (!repoOwner) {
    return { value: null, found: false };
  }

  let value = repoOwner.stringValue ?? repoOwner.selectedValue?.name ?? null;

  return { value, found: true };
}

// ===== MAIN =====

async function collectData() {
  if (!PAT || !String(PAT).trim()) {
    console.error('❌ GH_PAT is not set.');
    process.exit(1);
  }

  const nowIso = new Date().toISOString();

  const dataDir = path.join(__dirname, '../docs/data');
  ensureDir(dataDir);

  const dashboardFile = path.join(dataDir, 'dashboard-data.json');
  const detailFile = path.join(dataDir, 'repos-detail.json');

  const organizations = [];
  const trendEntry = { date: isoDateOnly(nowIso) };
  const allReposDetail = [];

  for (const org of ORGS) {
    console.log(`\n📦 ${org}`);

    // 1. Hole alle Repos ohne Archive
    const repos = await listOrgRepos(org);
    console.log(`  📊 Found ${repos.length} repositories (excluding archived)`);

    // 2. Prüfe RepoOwner für jedes Repo
    let activeCount = 0;
    const reposDetail = [];

    for (let i = 0; i < repos.length; i++) {
      const repo = repos[i];
      const { value, found } = await getRepoOwnerProperty(org, repo.name);
      
      const isActive = !isDefaultValue(value);

      if (isActive) activeCount++;

      reposDetail.push({
        org,
        repo: repo.name,
        url: `https://github.com/${org}/${repo.name}`,
        repoOwner: value,
        isActive,
        found,
        checkedAt: nowIso
      });

      allReposDetail.push(reposDetail[reposDetail.length - 1]);

      // Log progress every 10 repos
      if ((i + 1) % 10 === 0) {
        console.log(`  ✓ Checked ${i + 1}/${repos.length} repos...`);
      }

      // Small delay to avoid rate limiting
      if (i % 5 === 0) await sleep(100);
    }

    const totalRepos = repos.length;

    organizations.push({
      name: org,
      totalRepos,
      activeRepos: activeCount,
      inactiveRepos: totalRepos - activeCount,
      inactivePercentage: totalRepos > 0 ? ((totalRepos - activeCount) / totalRepos * 100).toFixed(1) : '0',
      lastUpdated: nowIso
    });

    trendEntry[org] = totalRepos;

    console.log(`  ✅ ${org}:`);
    console.log(`     Total: ${totalRepos}`);
    console.log(`     ✅ Aktiv: ${activeCount}`);
    console.log(`     ❌ Nicht Aktiv: ${totalRepos - activeCount}`);
  }

  // Speichere Dashboard
  safeJsonWrite(dashboardFile, {
    generatedAt: nowIso,
    organizations,
    summary: {
      totalRepos: allReposDetail.length,
      totalActive: allReposDetail.filter(r => r.isActive).length,
      totalInactive: allReposDetail.filter(r => !r.isActive).length
    }
  });

  // Speichere Detai
  safeJsonWrite(detailFile, {
    generatedAt: nowIso,
    repos: allReposDetail
  });

  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('✅ Data saved!');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`📊 Dashboard: ${dashboardFile}`);
  console.log(`📋 Details: ${detailFile}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

collectData().catch(console.error);
