import { Octokit } from '@octokit/rest';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function getGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

async function main() {
  try {
    const octokit = await getGitHubClient();
    
    // Get authenticated user
    const { data: user } = await octokit.users.getAuthenticated();
    console.log(`\n✅ Authenticated as: ${user.login}`);
    
    // Repository details
    const repoName = 'boules-tournament-manager';
    const repoDescription = 'A comprehensive web application for managing boules tournaments with multi-tournament support, automatic progression, and secure access control';
    
    console.log(`\n📦 Creating GitHub repository: ${repoName}...`);
    
    // Check if repository already exists
    try {
      const { data: existingRepo } = await octokit.repos.get({
        owner: user.login,
        repo: repoName,
      });
      console.log(`\n⚠️  Repository already exists: ${existingRepo.html_url}`);
      console.log(`\n📋 To push your code, use the Replit Git pane or run these commands in the Shell:`);
      console.log(`\n   git remote add origin ${existingRepo.clone_url}`);
      console.log(`   git branch -M main`);
      console.log(`   git push -u origin main`);
      return;
    } catch (error: any) {
      if (error.status !== 404) {
        throw error;
      }
      // Repository doesn't exist, continue with creation
    }
    
    // Create the repository
    const { data: repo } = await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      description: repoDescription,
      private: false,
      auto_init: false,
    });
    
    console.log(`\n✅ Repository created successfully!`);
    console.log(`   Repository URL: ${repo.html_url}`);
    console.log(`   Clone URL: ${repo.clone_url}`);
    
    console.log(`\n📋 Next steps:`);
    console.log(`\n1. Use the Replit Git pane (left sidebar) to push your code, or`);
    console.log(`2. Run these commands in the Shell:`);
    console.log(`\n   git remote add origin ${repo.clone_url}`);
    console.log(`   git branch -M main`);
    console.log(`   git push -u origin main`);
    
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Details: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    process.exit(1);
  }
}

main();
