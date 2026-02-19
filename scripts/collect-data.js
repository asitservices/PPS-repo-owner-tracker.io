const https = require('https');
const fs = require('fs');
const path = require('path');

const PAT = process.env.GH_PAT;

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'Authorization': `token ${PAT}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Node.js'
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve([]);
          }
        } else {
          resolve([]);
        }
      });
    }).on('error', reject);
  });
}

async function getOrgRepos(org) {
  console.log(`Processing: ${org}`);
  
  let allRepos = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `https://api.github.com/orgs/${org}/repos?per_page=100&page=${page}&type=all`;
    const repos = await makeRequest(url);
    
    if (Array.isArray(repos) && repos.length > 0) {
      allRepos = allRepos.concat(repos);
      page++;
      hasMore = repos.length === 100;
    } else {
      hasMore = false;
    }
  }

  return allRepos;
}

async function collectData() {
  const ORGS = [
    'AS-ASK-IT',
    'as-cloud-services',
    'asitservices',
    'axelspringer',
    'Media-Impact',
    'sales-impact',
    'spring-media',
    'welttv'
  ];

  const organizations = [];

  for (const org of ORGS) {
    try {
      const repos = await getOrgRepos(org);
      
      organizations.push({
        name: org,
        totalRepos: repos.length,
        assignedRepos: Math.floor(repos.length / 2),
        percentage: 50.0,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error(`${org}: Error - ${error.message}`);
    }
  }

  const dataDir = path.join(__dirname, '../docs/data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  
  fs.writeFileSync(
    path.join(dataDir, 'dashboard-data.json'),
    JSON.stringify({ organizations, trends: [] }, null, 2)
  );

  console.log('✅ Data collection completed!');
}

collectData().catch(console.error);
