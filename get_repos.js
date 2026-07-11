const fetch = require('node-fetch');

async function getRepos() {
  const res = await fetch('https://api.github.com/users/cenexasystems/repos');
  const repos = await res.json();
  console.log("Repos:");
  repos.forEach(r => console.log(r.full_name));
}
getRepos();
