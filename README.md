# 🔐 Repository Owner Tracker

Security tracking dashboard for repository owner assignments across 8 organizations.

## Organizations Monitored
- AS-ASK-IT
- as-cloud-services
- asitservices
- axelspringer
- Media-Impact
- sales-impact
- spring-media
- welttv

## Features

✅ **Real-time Dashboard** - Visual tracking of repository owner assignments
✅ **Automated Data Collection** - Daily GitHub Actions workflow
✅ **Progress Visualization** - Charts and trends
✅ **Organization Comparison** - See status across all 8 orgs
✅ **GitHub Pages Deployment** - Live website

## Setup

### 1. Create GitHub Personal Access Token (PAT)
- Go to GitHub Settings → Developer settings → Personal access tokens
- Create a token with `repo` and `read:org` scopes
- Save the token securely

### 2. Add Secret to Repository
- Go to Repository Settings → Secrets and variables → Actions
- Create a new secret: `GH_PAT` and paste your token

### 3. Install Dependencies
```bash
npm install