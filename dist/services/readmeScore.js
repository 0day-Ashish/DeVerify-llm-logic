"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateReadme = evaluateReadme;
function evaluateReadme(readmeRaw) {
    const text = (readmeRaw || '').trim();
    const lower = text.toLowerCase();
    const hasReadme = text.length > 20; // non-empty and not trivial
    // detect one-line project summary near top: first non-heading paragraph 5-50 words
    let summary = false;
    if (hasReadme) {
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < Math.min(lines.length, 40); i++) {
            const ln = lines[i].trim();
            if (!ln)
                continue;
            if (ln.startsWith('#'))
                continue; // heading
            if (ln.startsWith('![') || ln.startsWith('<img'))
                continue; // image/badge
            // skip badges
            if (/\[!\[.*?\]\(.*?\)\]\(.*?\)/.test(ln))
                continue;
            const words = ln.split(/\s+/).filter(Boolean);
            if (words.length >= 5 && words.length <= 50) {
                summary = true;
                break;
            }
        }
    }
    // how to run: typical single command or phrase
    const howToRunPatterns = [
        /npm\s+start/i,
        /yarn\s+start/i,
        /pnpm\s+start/i,
        /node\s+\S+\.js/i,
        /python\s+\S+\.py/i,
        /python\s+-m\s+\S+/i,
        /uvicorn\s+\S+/i,
        /flask\s+run/i,
        /streamlit\s+run\s+\S+/i,
        /go\s+run\s+\S+/i,
        /cargo\s+run/i,
        /dotnet\s+run/i,
        /open\s+index\.html/i,
        /docker\s+run\s+/i,
    ];
    const howToRunHead = /(^|\n)#+\s*(how\s*to\s*run|running|start|usage|getting\s*started)\b/i;
    const howToRun = howToRunPatterns.some((re) => re.test(text)) || howToRunHead.test(text);
    // helpful extras
    const install = /(npm\s+i(nstall)?|yarn\s+add|pnpm\s+i(nstall)?|pip\s+install|pip3\s+install|poetry\s+install|conda\s+install|bundle\s+install|composer\s+install)/i.test(text)
        || /(^|\n)#+\s*(install|installation|setup)\b/i.test(text);
    const usage = /(^|\n)#+\s*(usage|how\s*to\s*run|getting\s*started)\b/i.test(text)
        || /npm\s+run\s+|yarn\s+\w+\s|python\s+\S+\.py|curl\s+http/i.test(text);
    const demoOrShot = /(http(s)?:\/\/\S*(vercel|netlify|heroku|render|railway|github\.io|devpost|youtube|youtu\.be|loom|vimeo|demo|live))/i.test(text)
        || /!\[[^\]]*\]\([^\)]+\)/i.test(text) || /<img\s[^>]*src=/i.test(text);
    const techListHead = /(^|\n)#+\s*(tech\s*stack|built\s*with|technologies)\b/i;
    const techNames = /(node\.js|typescript|javascript|react|next\.js|vite|python|flask|django|fastapi|go(lang)?|rust|java|spring|c\#|\.net|solidity|hardhat|foundry|tailwind|express)/i;
    const techList = techListHead.test(text) || (techNames.test(text) && /,|\||·|\//.test(text.slice(0, 400)));
    const testsOrCI = /(tests?|unit|jest|pytest|mocha|ci|github\s*actions|build\s*status|badge)/i.test(text);
    const licenseOrContrib = /(^|\n)#+\s*(license|licence|contribut(ing|ors?))\b/i.test(text)
        || /(mit\b|apache\s*2|gpl|bsd)/i.test(text);
    const headings = (text.match(/^#{1,6}\s+/gm) || []).length;
    const codeFences = (text.match(/```[\s\S]*?```/g) || []).length;
    const formatting = headings >= 2 && codeFences >= 1;
    // simple secret detector (non-fatal): looks for api_key=..., sk-..., ghp_... etc.
    const secretsFound = /(api[_-]?key\s*[:=]\s*['\"][A-Za-z0-9\-_]{10,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|aws_(secret|access)_key|private\s*key|-----BEGIN\s+PRIVATE\s+KEY-----)/i.test(text);
    // required group
    const requiredOk = hasReadme && summary && howToRun;
    const base = requiredOk ? 40 : 0;
    // extras points (cap sum to 60)
    let extras = 0;
    if (install)
        extras += 10;
    if (usage)
        extras += 10;
    if (demoOrShot)
        extras += 10;
    if (techList)
        extras += 8;
    if (testsOrCI)
        extras += 6;
    if (licenseOrContrib)
        extras += 6;
    if (formatting)
        extras += 10;
    if (extras > 60)
        extras = 60;
    let total = base + extras;
    if (total > 100)
        total = 100;
    let label = 'needs-improvement';
    if (total >= 85)
        label = 'great';
    else if (total >= 60)
        label = 'okay';
    const notes = [];
    if (!hasReadme)
        notes.push('readme_missing_or_empty');
    if (hasReadme && !summary)
        notes.push('missing_one_line_summary');
    if (hasReadme && !howToRun)
        notes.push('missing_how_to_run');
    if (secretsFound)
        notes.push('secrets_like_strings_detected');
    return {
        required: { summary, howToRun, hasReadme },
        helpful: { install, usage, demoOrShot, techList, testsOrCI, licenseOrContrib, formatting },
        secretsFound,
        base,
        extras,
        total,
        label,
        notes
    };
}
exports.default = evaluateReadme;
