const axios = require('axios');
const fs = require('fs');
const path = require('path');

const PAT = process.env.GH_PAT;
const ORGS = ['AS-ASK-IT', 'as-cloud-services', 'asitservices', 'axelspringer', 'Media-Impact', 'sales-impact', 'spring-media', 'welttv'];

const headers = {
  Authorization: `token ${PAT}`,
  Accept: 'application/vnd.github.v3+json',
};

async function getRepositories(org) {
  let allRepos = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await axios.get(
        `https://api.github.com/orgs/${org}/repos`,
        {
          headers,
          params: {
            per_page: 100,
            page,
            type: 'all',
          },
        }
      );

      allRepos = allRepos.concat(response.data);
      hasMore = response.data.length === 100;
      page++;
    } catch (error) {
      console.error(`Error fetching repos for ${org}:`, error.message);
      hasMore = false;
    }
  }

  return allRepos;
}

async function checkCodeowners(org, repo) {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${org}/${repo.name}/contents/CODEOWNERS`,
      { headers }
    );
    return response.status === 200;
  } catch {
    return false;
  }
}

async function checkTeamAssignment(org, repo) {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${org}/${repo.name}/teams`,
      { headers }
    );
    return response.data.length > 0;
  } catch {
    return false;
  }
}

async function isRepoAssigned(org, repo) {
  const hasCodeowners = await checkCodeowners(org, repo);
  const hasTeams = await checkTeamAssignment(org, repo);
  return hasCodeowners || hasTeams;
}

async function collectData() {
  const organizations = [];
  const today = new Date().toISOString().split('T')[0];

  console.log('Starting data collection...');

  for (const org of ORGS) {
    try {
      console.log(`Processing organization: ${org}`);
      const repos = await getRepositories(org);
      
      let assignedCount = 0;
      for (const repo of repos) {
        if (await isRepoAssigned(org, repo)) {
          assignedCount++;
        }
      }

      const percentage = repos.length > 0 ? (assignedCount / repos.length) * 100 : 0;

      organizations.push({
        name: org,
        totalRepos: repos.length,
        assignedRepos: assignedCount,
        percentage: parseFloat(percentage.toFixed(1)),
        lastUpdated: new Date().toISOString(),
      });

      console.log(`${org}: ${assignedCount}/${repos.length} (${percentage.toFixed(1)}%)`);
    } catch (error) {
      console.error(`Error processing ${org}:`, error.message);
      organizations.push({
        name: org,
        totalRepos: 0,
        assignedRepos: 0,
        percentage: 0,
        lastUpdated: new Date().toISOString(),
        error: error.message,
      });
    }
  }

  // Load existing trends or create new
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  let dashboardData = { organizations: [], trends: [] };
  const dataFile = path.join(dataDir, 'dashboard-data.json');

  if (fs.existsSync(dataFile)) {
    dashboardData = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  }

  // Update organizations
  dashboardData.organizations = organizations;

  // Update trends
  let trendEntry = { date: today };
  organizations.forEach((org) => {
    trendEntry[org.name] = org.percentage;
  });

  // Keep only last 30 days of trends
  const existingTrendDate = dashboardData.trends.find((t) => t.date === today);
  if (!existingTrendDate) {
    dashboardData.trends.push(trendEntry);
    dashboardData.trends = dashboardData.trends.slice(-30);
  }

  // Write to file
  fs.writeFileSync(dataFile, JSON.stringify(dashboardData, null, 2));
  console.log('Data collection completed!');
}

collectData().catch(console.error);