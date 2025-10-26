"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeHackathonRepos = scrapeHackathonRepos;
exports.scrapeHackathonTimeline = scrapeHackathonTimeline;
exports.scrapeHackathonInfo = scrapeHackathonInfo;
exports.scrapeMultipleHackathonInfo = scrapeMultipleHackathonInfo;
const axios_1 = __importDefault(require("axios"));
// Extract unique GitHub repo URLs from a hackathon landing page (HTML)
// Returns normalized repo full names like "owner/repo".
async function scrapeHackathonRepos(hackathonUrl, options) {
    const projectLimit = Math.max(1, Math.min(100, options?.projectLimit ?? 30));
    // Devpost special handling: crawl project gallery and then project pages for GitHub links
    try {
        const u = new URL(hackathonUrl);
        if (u.hostname.endsWith('devpost.com')) {
            const repos = await scrapeDevpostRepos(u, projectLimit);
            // For Devpost, do NOT fallback to base page scan to avoid vendor/script repos
            return repos;
        }
    }
    catch {
        // ignore URL parse errors and fall back to simple scan
    }
    let html = '';
    try {
        const res = await axios_1.default.get(hackathonUrl, {
            headers: {
                // Use a browser-like UA to avoid simple bot blocks
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 20000,
            maxRedirects: 5,
            validateStatus: () => true
        });
        if (res.status >= 200 && res.status < 400)
            html = String(res.data || '');
    }
    catch {
        html = '';
    }
    // Find github repo links in two forms:
    // 1) Absolute: https://github.com/<owner>/<repo>(optional .git or trailing path)
    // 2) Relative: href="/<owner>/<repo>" (common on GitHub pages like Trending)
    const abs = /https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\.git|\b|\/)/g;
    const rel = /href=["']\/(?!settings|orgs|topics|collections|marketplace|features|enterprise|sponsors|about|contact|pricing|login|signup|issues|pulls|discussions|explore)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/?)["']/g;
    const repos = new Set();
    const denyOwner = new Set([
        'features', 'enterprise', 'topics', 'collections', 'marketplace', 'about', 'contact', 'pricing', 'login', 'signup', 'orgs', 'settings', 'sponsors', 'issues', 'pulls', 'discussions', 'explore', 'resources', 'solutions', 'trending'
    ]);
    let m;
    while ((m = abs.exec(html)) !== null) {
        const owner = m[1];
        const repo = m[2]?.replace(/\.git$/i, '');
        const ownerLower = owner?.toLowerCase();
        if (owner && repo && ownerLower && !denyOwner.has(ownerLower))
            repos.add(`${owner}/${repo}`);
    }
    while ((m = rel.exec(html)) !== null) {
        const owner = m[1];
        const repo = m[2]?.replace(/\.git$/i, '');
        const ownerLower = owner?.toLowerCase();
        if (owner && repo && ownerLower && !denyOwner.has(ownerLower))
            repos.add(`${owner}/${repo}`);
    }
    return Array.from(repos);
}
async function scrapeDevpostRepos(baseUrl, projectLimit) {
    // Try to find project links from the hackathon gallery
    const basePath = baseUrl.origin + baseUrl.pathname.replace(/\/$/, '') + '/';
    const galleryCandidates = [
        new URL('project-gallery', basePath).toString(),
        new URL('project-gallery/', basePath).toString(),
        new URL('project-gallery?page=1', basePath).toString(),
        new URL('submissions', basePath).toString(),
        new URL('submissions/', basePath).toString(),
        new URL('submissions?page=1', basePath).toString(),
        new URL('winners', basePath).toString(),
    ];
    // Aggregate project links from multiple gallery-like pages
    const projectLinks = new Set();
    const projectRe = /href=["']((?:https?:\/\/[^"']+)?\/(project|software)\/([A-Za-z0-9_-]+))["']/gi;
    for (const gurl of galleryCandidates) {
        try {
            const res = await axios_1.default.get(gurl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                timeout: 20000,
                maxRedirects: 5,
                validateStatus: () => true
            });
            const pageHtml = res.status >= 200 && res.status < 400 ? String(res.data || '') : '';
            if (!pageHtml)
                continue;
            let pm;
            while ((pm = projectRe.exec(pageHtml)) !== null) {
                const full = pm[1];
                const seg = pm[2];
                const slug = pm[3];
                let href = full;
                if (!/^https?:\/\//i.test(href)) {
                    href = `https://devpost.com/${seg}/${slug}`;
                }
                projectLinks.add(href);
                if (projectLinks.size >= projectLimit)
                    break;
            }
            if (projectLinks.size >= projectLimit)
                break;
        }
        catch {
            // continue to next candidate
        }
    }
    // As a fallback for Devpost, parse project links directly from the landing page when gallery is empty
    if (projectLinks.size === 0) {
        try {
            const res = await axios_1.default.get(baseUrl.toString(), {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                timeout: 20000,
                maxRedirects: 5,
                validateStatus: () => true
            });
            const html = res.status >= 200 && res.status < 400 ? String(res.data || '') : '';
            let pm;
            while ((pm = projectRe.exec(html)) !== null) {
                const full = pm[1];
                const seg = pm[2];
                const slug = pm[3];
                let href = full;
                if (!/^https?:\/\//i.test(href)) {
                    href = `https://devpost.com/${seg}/${slug}`;
                }
                projectLinks.add(href);
                if (projectLinks.size >= projectLimit)
                    break;
            }
        }
        catch {
            // ignore
        }
    }
    if (!projectLinks.size)
        return [];
    // Visit each project page and extract GitHub repos
    const repos = new Set();
    // Anchor-level extractor to access link text; reduces vendor/link-badge noise
    const anchorAbs = /<a[^>]*href=["']https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\.git|\b|\/)[^>]*>([\s\S]{0,100}?)<\/a>/gi;
    const vendorHardBlock = new Set(['newrelic/newrelic-browser-agent']);
    for (const plink of Array.from(projectLinks)) {
        try {
            const res = await axios_1.default.get(plink, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                timeout: 20000,
                maxRedirects: 5,
                validateStatus: () => true
            });
            const html = res.status >= 200 && res.status < 400 ? String(res.data || '') : '';
            let m;
            while ((m = anchorAbs.exec(html)) !== null) {
                const owner = m[1];
                const repo = m[2]?.replace(/\.git$/i, '');
                const inner = stripTags(m[3] || '').trim();
                if (!owner || !repo)
                    continue;
                const full = `${owner}/${repo}`;
                if (vendorHardBlock.has(full.toLowerCase()))
                    continue;
                // Reject links in "Built with" sections or where link text suggests dependency/vendor
                const idx = m.index;
                const preCtx = html.slice(Math.max(0, idx - 400), idx);
                const inBuiltWith = /built\s*with/i.test(preCtx);
                const positiveText = /(source|code|repo|repository|github|view\s*code|open\s*source)/i.test(inner);
                const negativeText = /(built\s*with|dependency|library|template|badge|sponsor|analytics)/i.test(inner);
                if (!inBuiltWith && positiveText && !negativeText) {
                    repos.add(full);
                }
            }
            if (repos.size >= projectLimit)
                break; // stop once we collected enough repos
        }
        catch {
            // skip this project link
        }
    }
    return Array.from(repos);
}
function stripTags(s) {
    return s.replace(/<[^>]*>/g, '');
}
// Try to infer a hackathon timeline (start/end and key checkpoints) from the landing page HTML.
// Heuristics:
// - Prefer ISO-like dates yyyy-mm-dd first
// - Also try common "Month DD, YYYY" formats
// - Look for labels near dates like Start/Begin/Opening and End/Finish/Deadline/Submission
// - If multiple dates found and no labels: use earliest as start, latest as end
async function scrapeHackathonTimeline(hackathonUrl) {
    let html = '';
    try {
        const res = await axios_1.default.get(hackathonUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 20000,
            maxRedirects: 5,
            validateStatus: () => true
        });
        if (res.status >= 200 && res.status < 400)
            html = String(res.data || '');
    }
    catch {
        html = '';
    }
    // Collect candidate date strings with context windows
    const isoRe = /(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])/g; // 2025-10-25 or 2025/10/25
    const longRe = /((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+([0-3]?\d)(?:,)?\s+(20\d{2}))/gi;
    const candidates = [];
    let m;
    while ((m = isoRe.exec(html)) !== null) {
        const date = `${m[1]}-${m[2]}-${m[3]}`.replace(/[/.]/g, '-');
        candidates.push({ date, idx: m.index, ctx: html.slice(Math.max(0, m.index - 40), m.index + 60) });
    }
    while ((m = longRe.exec(html)) !== null) {
        const date = m[1];
        candidates.push({ date, idx: m.index, ctx: html.slice(Math.max(0, m.index - 40), m.index + 60) });
    }
    const checkpoints = [];
    const labels = [
        { key: 'start', re: /(start|begin|opening|kick\s*off)/i },
        { key: 'end', re: /(end|finish|closing|deadline|submission\s*deadline|final)/i },
        { key: 'registration', re: /(registration)/i },
        { key: 'submission', re: /(submission|submit)/i },
        { key: 'judging', re: /(judging|review)/i },
        { key: 'winners', re: /(winners|results|announcement)/i }
    ];
    // associate labels with nearest dates based on context
    for (const c of candidates) {
        for (const L of labels) {
            if (L.re.test(c.ctx)) {
                checkpoints.push({ label: L.key, date: normalizeDate(c.date) });
                break;
            }
        }
    }
    // Derive start/end: prefer explicitly labeled ones
    const startLs = checkpoints.filter((c) => c.label === 'start').sort((a, b) => a.date.localeCompare(b.date));
    const endLs = checkpoints.filter((c) => c.label === 'end' || c.label === 'submission').sort((a, b) => a.date.localeCompare(b.date));
    let start = startLs[0]?.date; // earliest labeled start
    let end = endLs[endLs.length - 1]?.date; // latest labeled end/submission
    // If either missing, infer from min/max of all parsed dates
    const parsedDates = candidates
        .map((c) => tryParseDateISO(c.date))
        .filter((d) => Boolean(d));
    if (!start && parsedDates.length)
        start = parsedDates.slice().sort()[0];
    if (!end && parsedDates.length)
        end = parsedDates.slice().sort().slice(-1)[0];
    // Normalize: ensure start <= end; if reversed due to noisy labels, swap.
    if (start && end && start.localeCompare(end) > 0) {
        const tmp = start;
        start = end;
        end = tmp;
    }
    // Dedupe checkpoints and coalesce multiple start/end entries to the chosen boundaries to reduce confusion
    const normalizedCheckpoints = normalizeCheckpoints(checkpoints, start, end);
    return {
        start,
        end,
        checkpoints: normalizedCheckpoints,
        source: hackathonUrl,
        inferred: !(startLs.length || endLs.length)
    };
}
function normalizeDate(s) {
    // Try ISO first
    const iso = tryParseDateISO(s);
    if (iso)
        return iso;
    // Try parsing Month DD, YYYY
    const d = new Date(s);
    if (!isNaN(d.getTime()))
        return formatYmdLocal(d);
    return s;
}
function tryParseDateISO(s) {
    // Accept yyyy-mm-dd or yyyy/mm/dd
    const m = s.match(/^(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])$/);
    if (m)
        return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(s);
    if (!isNaN(d.getTime()))
        return formatYmdLocal(d);
    return null;
}
function dedupeCheckpoints(arr) {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
        const k = x.label + '|' + x.date;
        if (!seen.has(k)) {
            seen.add(k);
            out.push(x);
        }
    }
    return out;
}
function formatYmdLocal(d) {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function normalizeCheckpoints(arr, start, end) {
    // 1) Dedupe exact duplicates
    const deduped = dedupeCheckpoints(arr);
    // 2) If we have a chosen start or end, collapse multiple entries to the chosen boundary date
    const result = [];
    let addedStart = false;
    let addedEnd = false;
    // Keep other labels as-is, but we'll handle start/end specially at the end
    for (const c of deduped) {
        if (c.label === 'start')
            continue;
        if (c.label === 'end' || c.label === 'submission')
            continue;
        result.push(c);
    }
    if (start) {
        result.push({ label: 'start', date: start });
        addedStart = true;
    }
    if (end) {
        result.push({ label: 'end', date: end });
        addedEnd = true;
    }
    // 3) Sort checkpoints by date ascending, then by label for stability
    result.sort((a, b) => {
        const cmp = a.date.localeCompare(b.date);
        if (cmp !== 0)
            return cmp;
        return a.label.localeCompare(b.label);
    });
    return result;
}
exports.default = scrapeHackathonRepos;
// --- Hackathon details scraper ---
async function scrapeHackathonInfo(hackathonUrl) {
    const url = new URL(hackathonUrl);
    const html = await fetchHtml(hackathonUrl);
    // Name: prefer og:title, then <title>, then first <h1>/<h2>
    const ogTitle = matchMetaContent(html, /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    let name = ogTitle || extractTitle(html) || extractFirstHeading(html) || deriveNameFromUrl(url) || url.hostname;
    name = cleanupTitle(name);
    // Dates via existing timeline scraper
    const tl = await scrapeHackathonTimeline(hackathonUrl).catch(() => ({ start: undefined, end: undefined, checkpoints: [], source: hackathonUrl, inferred: true }));
    const startDate = tl.start || '';
    const endDate = tl.end || '';
    // Status
    const status = computeStatus(startDate, endDate);
    // ID from URL (Devpost subdomain slug or path slug)
    const id = deriveIdFromUrl(url);
    // Tags: meta keywords + chip/badge/tag-like elements
    const tags = extractTags(html);
    // testHack heuristic
    const testHack = isTestHack(name, url, tags);
    return { id, name, startDate, endDate, status, testHack, tags: tags.length ? tags : undefined };
}
async function scrapeMultipleHackathonInfo(urls) {
    const chunk = 4;
    const out = [];
    for (let i = 0; i < urls.length; i += chunk) {
        const batch = urls.slice(i, i + chunk);
        const res = await Promise.all(batch.map((u) => scrapeHackathonInfo(u).catch(() => null)));
        for (const item of res)
            if (item)
                out.push(item);
    }
    return out;
}
function computeStatus(startDate, endDate) {
    const now = new Date();
    const s = startDate ? safeParseYmd(startDate) : null;
    const e = endDate ? safeParseYmd(endDate, true) : null;
    if (s && now < s)
        return 'upcoming';
    if (e && now > e)
        return 'ended';
    return 'running';
}
function safeParseYmd(ymd, endOfDay = false) {
    const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m)
        return null;
    const d = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0));
    return isNaN(d.getTime()) ? null : d;
}
function fetchHtml(url) {
    return axios_1.default
        .get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 20000,
        maxRedirects: 5,
        validateStatus: () => true
    })
        .then((r) => (r.status >= 200 && r.status < 400 ? String(r.data || '') : ''))
        .catch(() => '');
}
function matchMetaContent(html, re) {
    const m = re.exec(html);
    return m && m[1] ? String(m[1]).trim() : null;
}
function extractTitle(html) {
    const m = /<title>([\s\S]*?)<\/title>/i.exec(html);
    if (!m)
        return null;
    return String(m[1]).trim();
}
function cleanupTitle(title) {
    // Remove common suffixes like "- Devpost", "| Devpost"
    return title.replace(/\s*[-|]\s*Devpost\s*$/i, '').trim();
}
function extractFirstHeading(html) {
    const m1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    if (m1)
        return stripTags(m1[1]).trim();
    const m2 = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(html);
    if (m2)
        return stripTags(m2[1]).trim();
    return null;
}
function deriveNameFromUrl(u) {
    // For subdomain-based Devpost hackathons, use subdomain words
    if (u.hostname.endsWith('devpost.com')) {
        const parts = u.hostname.split('.');
        if (parts.length >= 3) {
            const slug = parts.slice(0, parts.length - 2).join('-');
            return slug.replace(/[-_]+/g, ' ').trim();
        }
        // Else try first path segment
        const seg = u.pathname.split('/').filter(Boolean)[0];
        if (seg)
            return seg.replace(/[-_]+/g, ' ').trim();
    }
    const seg = u.pathname.split('/').filter(Boolean)[0];
    if (seg)
        return seg.replace(/[-_]+/g, ' ').trim();
    return null;
}
function deriveIdFromUrl(u) {
    if (u.hostname.endsWith('devpost.com')) {
        const parts = u.hostname.split('.');
        if (parts.length >= 3) {
            return parts.slice(0, parts.length - 2).join('-'); // subdomain slug
        }
        const seg = u.pathname.split('/').filter(Boolean)[0];
        if (seg)
            return seg;
    }
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '').replace(/^\//, '').replace(/\//g, '-');
    return path ? `${host}-${path}` : host;
}
function extractTags(html) {
    const tags = new Set();
    // Meta keywords
    const metaKw = matchMetaContent(html, /<meta[^>]+name=["']keywords["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (metaKw) {
        metaKw.split(',').map((s) => s.trim()).filter(Boolean).forEach((t) => tags.add(t));
    }
    // Tag-like anchors/spans with classes
    const tagLike = /<(?:a|span|div)[^>]+class=["'][^"']*(?:tag|chip|badge|label)[^"']*["'][^>]*>([\s\S]{1,80}?)<\/\s*(?:a|span|div)>/gi;
    let m;
    while ((m = tagLike.exec(html)) !== null) {
        const txt = stripTags(m[1] || '').trim();
        if (txt && txt.length <= 60)
            tags.add(txt);
    }
    // Devpost category labels sometimes appear near "Categories"
    const categoryBlock = /Categories[\s\S]{0,400}?<ul[\s\S]*?>([\s\S]*?)<\/ul>/i.exec(html);
    if (categoryBlock) {
        const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
        let lm;
        while ((lm = liRe.exec(categoryBlock[1])) !== null) {
            const val = stripTags(lm[1] || '').trim();
            if (val)
                tags.add(val);
        }
    }
    // Clean up: dedupe, drop very long items, normalize spaces
    return Array.from(tags).map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t && t.length <= 60).slice(0, 20);
}
function isTestHack(name, url, tags) {
    const s = `${name} ${url.toString()} ${tags.join(' ')}`.toLowerCase();
    return /(test|practice|sample|demo|sandbox|playground|tutorial|example)/.test(s);
}
