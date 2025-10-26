import axios from 'axios';
import { config } from '../config';

export async function fetchGitHubMetadata(repoUrl: string) {
  // repoUrl: https://github.com/owner/repo or with .git
  const m = repoUrl.match(/github.com\/(.+?)\/(.+?)(?:\.git|$|\/)/i);
  if (!m) throw new Error('invalid github url');
  const owner = m[1];
  const repo = m[2];
  const headers: any = { Accept: 'application/vnd.github.v3+json' };
  if (config.githubToken) headers.Authorization = `token ${config.githubToken}`;

  const base = 'https://api.github.com';
  const out: any = { repo: `${owner}/${repo}` };

  // README
  function computeReadmeInfo(md: string) {
    const text = md || '';
    const lower = text.toLowerCase();
    const length = text.length;
    const headingCount = (text.match(/^#{1,6}\s+/gm) || []).length;
    const hasInstall = /(^|\n)#+\s*(install|installation|setup)\b/i.test(text) || /npm i |yarn add |pip install |poetry add |cargo add /i.test(text);
    const hasUsage = /(^|\n)#+\s*(usage|how to run|getting started)\b/i.test(text) || /npm run |yarn \w+|python .*\.py|node .*\.js|docker run /i.test(text);
    const hasLicense = /license/i.test(text) || /(^|\n)#+\s*license\b/i.test(text);
    const hasContrib = /contributing|contribution/i.test(text) || /(^|\n)#+\s*contrib/i.test(text);
    const hasDemo = /(demo|live|devpost|video|youtube|loom|vercel|netlify|gh-pages)/i.test(text);
    const hasScreenshot = /(screenshot|image|gif|![\[](.*?)[\)]|<img\s+)/i.test(text);
    const boilerplateHits: string[] = [];
    const boilerplatePatterns: Array<[RegExp, string]> = [
      [/create\s*-?react\s*-?app|cra\b/i, 'create-react-app'],
      [/generated\s+by\s+create\s*-?next\s*-?app|next\.js\s+boilerplate/i, 'nextjs-boilerplate'],
      [/vite\s*(template|starter)/i, 'vite-template'],
      [/boilerplate|starter\s+kit|scaffold/i, 'generic-boilerplate'],
      [/expo\s*(template|starter)/i, 'expo-template'],
      [/cookiecutter|yeoman\s+generator/i, 'generator'],
    ];
    for (const [re, tag] of boilerplatePatterns) {
      if (re.test(text)) boilerplateHits.push(tag);
    }
    const minimal = length < 250 && headingCount === 0 && !hasInstall && !hasUsage;
    const richnessScore = (
      (length >= 1000 ? 2 : length >= 400 ? 1 : 0) +
      (headingCount >= 5 ? 1 : headingCount >= 2 ? 0.5 : 0) +
      (hasInstall ? 0.5 : 0) +
      (hasUsage ? 0.5 : 0) +
      (hasDemo ? 0.25 : 0) +
      (hasScreenshot ? 0.25 : 0)
    );
    const boilerplateScore = boilerplateHits.length ? -1 * Math.min(1.5, boilerplateHits.length * 0.5) : 0;
    return {
      length,
      headingCount,
      hasInstall,
      hasUsage,
      hasLicense,
      hasContrib,
      hasDemo,
      hasScreenshot,
      minimal,
      boilerplateHits,
      boilerplateScore,
      richnessScore
    };
  }
  try {
    const r = await axios.get(`${base}/repos/${owner}/${repo}/readme`, { headers });
    if (r?.data?.content) {
      const buff = Buffer.from(r.data.content, 'base64');
      out.readme = buff.toString('utf8').slice(0, 4000);
      out.hasReadme = true;
      out.readmeInfo = computeReadmeInfo(out.readme);
    } else {
      out.readme = null;
      out.hasReadme = false;
      out.readmeInfo = null;
    }
  } catch (err) {
    out.readme = null;
    out.hasReadme = false;
    out.readmeInfo = null;
  }

  // repo details
  try {
    const r = await axios.get(`${base}/repos/${owner}/${repo}`, { headers });
    out.size = r.data.size; // in KB roughly
    out.fork = r.data.fork;
    out.languages = (await axios.get(r.data.languages_url, { headers })).data;
    out.open_issues = r.data.open_issues_count;
  } catch (err) {
    // ignore
  }

  // commits - latest
  try {
    const r = await axios.get(`${base}/repos/${owner}/${repo}/commits`, { headers, params: { per_page: 1 } });
    const commit = r.data[0];
    out.latestCommitSha = commit.sha;
    out.latestCommitDate = commit.commit?.committer?.date || commit.commit?.author?.date;
    if (out.latestCommitDate) {
      out.latestCommitDaysAgo = Math.floor((Date.now() - new Date(out.latestCommitDate).getTime()) / (1000 * 60 * 60 * 24));
    }
  } catch (err) {
    // ignore
  }

  // contributors count
  try {
    const r = await axios.get(`${base}/repos/${owner}/${repo}/contributors`, { headers, params: { per_page: 1, anon: true } });
    const link = r.headers.link;
    if (link) {
      // try to parse last page
      const m2 = link.match(/&page=(\d+)>; rel="last"/);
      out.numContributors = m2 ? Number(m2[1]) : r.data.length;
    } else {
      out.numContributors = r.data.length;
    }
  } catch (err) {
    out.numContributors = 0;
  }

  // CI / checks for latest commit
  try {
    if (out.latestCommitSha) {
      const r = await axios.get(`${base}/repos/${owner}/${repo}/commits/${out.latestCommitSha}/status`, { headers });
      out.ciStatus = r.data.state || 'none';
    }
  } catch (err) {
    out.ciStatus = 'none';
  }

  // heuristic checks
  out.hasTests = false;
  try {
    const files = ['package.json', 'pyproject.toml', 'requirements.txt', 'Cargo.toml'];
    const manifestHits: string[] = [];
    for (const f of files) {
      try {
        const resp = await axios.get(`${base}/repos/${owner}/${repo}/contents/${f}`, { headers });
        if (resp?.data) manifestHits.push(f);
      } catch (e) {
        // ignore
      }
    }
    out.manifestFiles = manifestHits;
    out.hasTests = Boolean(manifestHits.includes('package.json')) && false; // TODO: better detection by inspecting scripts
  } catch (err) {
    out.manifestFiles = [];
  }

  // large binary heuristic
  out.largeBinaryDetected = (out.size || 0) > 100000; // repo size > 100MB heuristic

  return out;
}
