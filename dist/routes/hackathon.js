"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const zod_1 = require("zod");
const hackathonScraper_1 = require("../services/hackathonScraper");
const hackathonInfo_1 = require("../models/hackathonInfo");
const commitTimeline_1 = require("../services/commitTimeline");
const hackathonJudge_1 = require("../services/hackathonJudge");
const logger_1 = require("../lib/logger");
const checkResult_1 = require("../models/checkResult");
const router = express_1.default.Router();
const ownerRepoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const bodySchema = zod_1.z.object({
    hackathonUrl: zod_1.z.string().url().optional(),
    startIso: zod_1.z.string().datetime().optional(),
    endIso: zod_1.z.string().datetime().optional(),
    repoLimit: zod_1.z.number().int().min(1).max(50).optional(),
    useLlm: zod_1.z.boolean().optional(),
    // Optional direct inputs
    repoUrls: zod_1.z.array(zod_1.z.string().url()).optional(),
    repos: zod_1.z.array(zod_1.z.string().regex(ownerRepoPattern, 'must be owner/repo')).optional()
});
router.post('/analyze', async (req, res) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'bad_request', details: parsed.error.errors });
    }
    const { hackathonUrl, startIso, endIso, repoLimit = 15, useLlm = false, repoUrls = [], repos: providedRepos = [] } = parsed.data;
    try {
        // 1) Determine repos list: prefer user-provided repos/repoUrls, else scrape if hackathonUrl present
        const fromUrls = (repoUrls || []).map(parseOwnerRepoFromUrl).filter((x) => Boolean(x));
        let repos = [];
        if ((providedRepos && providedRepos.length) || (fromUrls && fromUrls.length)) {
            repos = [...(providedRepos || []), ...fromUrls];
        }
        else if (hackathonUrl) {
            // Scrape repos from hackathon page (pass repoLimit so Devpost crawler doesn't over-fetch)
            repos = await (0, hackathonScraper_1.scrapeHackathonRepos)(hackathonUrl, { projectLimit: repoLimit });
        }
        if (!repos.length) {
            return res.status(200).json({ timeline: null, repos: [], note: 'no_repos_found' });
        }
        // 2) Determine timeline
        let start = startIso;
        let end = endIso;
        let inferred = false;
        let checkpoints = [];
        if ((!start || !end) && hackathonUrl) {
            try {
                const tl = await (0, hackathonScraper_1.scrapeHackathonTimeline)(hackathonUrl);
                start = start || tl.start;
                end = end || tl.end;
                inferred = tl.inferred;
                checkpoints = tl.checkpoints || [];
            }
            catch (e) {
                // ignore, proceed with undefined
            }
        }
        if (!start || !end) {
            return res.status(200).json({
                timeline: { start: start || null, end: end || null, inferred: true, checkpoints },
                repos: repos.slice(0, repoLimit).map((r) => ({ repo: r, metrics: null })),
                note: 'timeline_not_found'
            });
        }
        // Normalize dates to day-granularity UTC boundaries to avoid timezone reversals
        const startDay = toYmd(start);
        const endDay = toYmd(end);
        let ordered = orderTimeline(startDay, endDay);
        const startAtUtc = toUtcDayStart(ordered.start);
        const endAtUtc = toUtcDayEnd(ordered.end);
        // 3) Compute commit activity metrics for top N repos
        const selected = repos.slice(0, repoLimit);
        const metrics = await (0, commitTimeline_1.computeMetricsForRepos)(selected, startAtUtc, endAtUtc);
        // Optionally have the LLM render a judgement per repo based on timeline
        if (useLlm) {
            const judged = [];
            // modest concurrency to limit latency
            const chunk = 3;
            for (let i = 0; i < metrics.length; i += chunk) {
                const batch = metrics.slice(i, i + chunk);
                const results = await Promise.all(batch.map((m) => (0, hackathonJudge_1.judgeRepoTimeline)(m, start, end)));
                judged.push(...results);
            }
            // attach decisions back to corresponding metrics
            const decisions = new Map(judged.map((j) => [j.repo, j]));
            for (const m of metrics) {
                // @ts-expect-error runtime field for response only
                m.llmDecision = decisions.get(m.repo) || null;
            }
        }
        return res.status(200).json({
            timeline: { start: ordered.start, end: ordered.end, inferred, checkpoints },
            normalizedTimeline: {
                startDay: ordered.start,
                endDay: ordered.end,
                startAtUtc,
                endAtUtc,
                swapped: ordered.swapped
            },
            repos: metrics,
            count: metrics.length
        });
    }
    catch (err) {
        logger_1.logger.error({ err }, 'hackathon analyze failed');
        return res.status(500).json({ error: 'internal_error', message: err?.message || 'unknown' });
    }
});
// New: Only scrape timeline from the hackathon URL (no repo scraping here)
const timelineSchema = zod_1.z.object({
    hackathonUrl: zod_1.z.string().url()
});
router.post('/timeline', async (req, res) => {
    const parsed = timelineSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'bad_request', details: parsed.error.errors });
    const { hackathonUrl } = parsed.data;
    try {
        const tl = await (0, hackathonScraper_1.scrapeHackathonTimeline)(hackathonUrl);
        const startDay = tl.start ? toYmd(tl.start) : null;
        const endDay = tl.end ? toYmd(tl.end) : null;
        let normalized = null;
        if (startDay && endDay) {
            const ordered = orderTimeline(startDay, endDay);
            normalized = {
                startDay: ordered.start,
                endDay: ordered.end,
                startAtUtc: toUtcDayStart(ordered.start),
                endAtUtc: toUtcDayEnd(ordered.end),
                swapped: ordered.swapped
            };
        }
        // Convenience: surface top-level ISO datetimes for immediate use with /check
        const startIso = normalized?.startAtUtc || tl.start || null;
        const endIso = normalized?.endAtUtc || tl.end || null;
        return res.status(200).json({
            timeline: { start: tl.start || null, end: tl.end || null, inferred: tl.inferred, checkpoints: tl.checkpoints },
            normalizedTimeline: normalized,
            startIso,
            endIso
        });
    }
    catch (err) {
        logger_1.logger.error({ err }, 'hackathon timeline failed');
        return res.status(500).json({ error: 'internal_error', message: err?.message || 'unknown' });
    }
});
// Scrape hackathon details (id, name, dates, status, tags) for a list of URLs
const detailsSchema = zod_1.z.object({
    urls: zod_1.z.array(zod_1.z.string().url()).min(1)
});
router.post('/details', async (req, res) => {
    const parsed = detailsSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'bad_request', details: parsed.error.errors });
    try {
        // Scrape with sourceUrl pairing to avoid incorrect URL associations
        const results = await Promise.all(parsed.data.urls.map((u) => (0, hackathonScraper_1.scrapeMultipleHackathonInfo)([u])
            .then((arr) => (arr && arr[0] ? { info: arr[0], sourceUrl: u } : null))
            .catch(() => null)));
        const items = results.filter((x) => Boolean(x)).map((r) => ({ ...r.info, sourceUrl: r.sourceUrl }));
        // Persist (upsert) each record for later frontend browsing
        const savedIds = [];
        for (const it of items) {
            const doc = {
                hackId: it.id,
                sourceUrl: it.sourceUrl,
                name: it.name,
                startDate: it.startDate || '',
                endDate: it.endDate || '',
                status: it.status,
                testHack: !!it.testHack,
                tags: it.tags || [],
                lastScrapedAt: new Date()
            };
            const saved = await hackathonInfo_1.HackathonInfo.findOneAndUpdate({ hackId: doc.hackId }, { $set: doc }, { upsert: true, new: true }).lean();
            if (saved && saved._id)
                savedIds.push(String(saved._id));
        }
        return res.status(200).json({ items, count: items.length, saved: savedIds.length, docIds: savedIds });
    }
    catch (err) {
        logger_1.logger.error({ err }, 'hackathon details scrape failed');
        return res.status(500).json({ error: 'internal_error', message: err?.message || 'unknown' });
    }
});
// List stored hackathon details for frontend
router.get('/details', async (req, res) => {
    try {
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
        const statusQ = String(req.query.status || '').toLowerCase();
        const q = String(req.query.q || '').trim();
        const filt = {};
        if (statusQ && ['upcoming', 'running', 'ended'].includes(statusQ))
            filt.status = statusQ;
        if (q)
            filt.name = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
        const docs = await hackathonInfo_1.HackathonInfo.find(filt).sort({ updatedAt: -1 }).limit(limit).lean();
        // Map DB shape -> API shape (id instead of hackId)
        const items = docs.map((d) => ({
            id: d.hackId,
            name: d.name,
            startDate: d.startDate,
            endDate: d.endDate,
            status: d.status,
            testHack: d.testHack,
            tags: d.tags,
            sourceUrl: d.sourceUrl,
            _id: d._id
        }));
        return res.status(200).json({ items, count: items.length });
    }
    catch (err) {
        logger_1.logger.error({ err }, 'hackathon details list failed');
        return res.status(500).json({ error: 'internal_error' });
    }
});
// Fetch one stored hackathon detail by hackId (slug)
router.get('/details/by/:hackId', async (req, res) => {
    try {
        const hackId = req.params.hackId;
        const d = await hackathonInfo_1.HackathonInfo.findOne({ hackId }).lean();
        if (!d)
            return res.status(404).json({ error: 'not_found' });
        return res.status(200).json({
            id: d.hackId,
            name: d.name,
            startDate: d.startDate,
            endDate: d.endDate,
            status: d.status,
            testHack: d.testHack,
            tags: d.tags,
            sourceUrl: d.sourceUrl,
            _id: d._id
        });
    }
    catch (err) {
        logger_1.logger.error({ err }, 'hackathon details get failed');
        return res.status(500).json({ error: 'internal_error' });
    }
});
// New: Check provided repos against a given timeline window (no hackathon scraping)
const checkSchema = zod_1.z.object({
    startIso: zod_1.z.string().datetime(),
    endIso: zod_1.z.string().datetime(),
    useLlm: zod_1.z.boolean().optional(),
    includeReadme: zod_1.z.boolean().optional(),
    includeReadmeLlm: zod_1.z.boolean().optional(),
    repoLimit: zod_1.z.number().int().min(1).max(50).optional(),
    repoUrls: zod_1.z.array(zod_1.z.string().url()).optional(),
    repos: zod_1.z.array(zod_1.z.string().regex(ownerRepoPattern, 'must be owner/repo')).optional()
});
router.post('/check', async (req, res) => {
    const parsed = checkSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: 'bad_request', details: parsed.error.errors });
    const { startIso, endIso, useLlm = false, includeReadme = false, includeReadmeLlm = false, repoLimit = 25, repoUrls = [], repos: providedRepos = [] } = parsed.data;
    try {
        // Build mapping from normalized owner/repo -> original input URL so we can display exact inputs later
        const urlMap = new Map();
        for (const u of (repoUrls || [])) {
            const r = parseOwnerRepoFromUrl(u);
            if (r && !urlMap.has(r))
                urlMap.set(r, u);
        }
        const fromUrls = (repoUrls || []).map(parseOwnerRepoFromUrl).filter((x) => Boolean(x));
        const repos = [...(providedRepos || []), ...fromUrls].slice(0, repoLimit);
        if (!repos.length)
            return res.status(200).json({ note: 'no_repos_provided', repos: [] });
        // Normalize dates and compute metrics
        const startDay = toYmd(startIso);
        const endDay = toYmd(endIso);
        const ordered = orderTimeline(startDay, endDay);
        const startAtUtc = toUtcDayStart(ordered.start);
        const endAtUtc = toUtcDayEnd(ordered.end);
        const metrics = await (0, commitTimeline_1.computeMetricsForRepos)(repos, startAtUtc, endAtUtc);
        // Attach full GitHub URL for convenience (alongside owner/repo)
        for (const m of metrics) {
            m.repoUrl = `https://github.com/${m.repo}`;
            // Also attach the exact input URL if the user provided it (may include tree/blob/branch)
            m.inputUrl = urlMap.get(m.repo) || m.repoUrl;
        }
        // Optional: augment with README evaluation (lightweight rubric 0-100)
        if (includeReadme) {
            const { fetchGitHubMetadata } = await Promise.resolve().then(() => __importStar(require('../services/github')));
            const { evaluateReadme } = await Promise.resolve().then(() => __importStar(require('../services/readmeScore')));
            const { judgeReadmeWithLLM } = includeReadmeLlm ? await Promise.resolve().then(() => __importStar(require('../services/readmeJudge'))) : { judgeReadmeWithLLM: null };
            const chunk = 3;
            for (let i = 0; i < metrics.length; i += chunk) {
                const batch = metrics.slice(i, i + chunk);
                const metas = await Promise.all(batch.map((m) => fetchGitHubMetadata(`https://github.com/${m.repo}`).catch(() => null)));
                metas.forEach((gh, idx) => {
                    const target = batch[idx];
                    if (gh && typeof gh.readme === 'string') {
                        // @ts-expect-error attach runtime field
                        target.readmeEval = evaluateReadme(gh.readme);
                        // Also attach a simplified strength label for convenience
                        // @ts-expect-error attach runtime field
                        target.readmeStrength = (target.readmeEval?.label === 'great' || target.readmeEval?.label === 'okay') ? 'high' : 'low';
                        if (includeReadmeLlm && judgeReadmeWithLLM) {
                            // schedule LLM judgement per item
                            // @ts-expect-error attach placeholder
                            target._readmeText = gh.readme;
                        }
                    }
                    else {
                        // @ts-expect-error attach runtime field
                        target.readmeEval = null;
                        // @ts-expect-error attach runtime field
                        target.readmeStrength = 'low';
                    }
                });
                // If LLM requested, call in a smaller parallel batch to limit latency
                if (includeReadmeLlm && judgeReadmeWithLLM) {
                    const llmTexts = batch.map((t) => t._readmeText || '');
                    const llmRes = await Promise.all(llmTexts.map((txt) => judgeReadmeWithLLM(txt)));
                    llmRes.forEach((jr, idx) => {
                        // @ts-expect-error attach runtime field
                        batch[idx].readmeEvalLlm = jr;
                        // cleanup temporary
                        // @ts-expect-error cleanup
                        delete batch[idx]._readmeText;
                    });
                }
            }
        }
        if (useLlm) {
            const judged = [];
            const chunk = 3;
            for (let i = 0; i < metrics.length; i += chunk) {
                const batch = metrics.slice(i, i + chunk);
                const results = await Promise.all(batch.map((m) => (0, hackathonJudge_1.judgeRepoTimeline)(m, ordered.start, ordered.end)));
                judged.push(...results);
            }
            const decisions = new Map(judged.map((j) => [j.repo, j]));
            for (const m of metrics) {
                // @ts-expect-error attach runtime field
                m.llmDecision = decisions.get(m.repo) || null;
            }
        }
        // Persist the full result so the frontend can fetch by id later
        const payload = {
            timeline: { start: ordered.start, end: ordered.end },
            normalizedTimeline: {
                startDay: ordered.start,
                endDay: ordered.end,
                startAtUtc,
                endAtUtc,
                swapped: ordered.start.localeCompare(ordered.end) > 0
            },
            repos: metrics,
            count: metrics.length
        };
        let saved = null;
        try {
            saved = await checkResult_1.CheckResult.create({
                startIso,
                endIso,
                useLlm,
                includeReadme,
                includeReadmeLlm,
                repoLimit,
                reposInput: repos,
                repoUrlsOriginal: repoUrls,
                ...payload
            });
        }
        catch (e) {
            logger_1.logger.warn({ err: e }, 'failed to persist check result');
        }
        return res.status(200).json({ ...payload, checkId: saved?._id || null });
    }
    catch (err) {
        logger_1.logger.error({ err }, 'hackathon check failed');
        return res.status(500).json({ error: 'internal_error', message: err?.message || 'unknown' });
    }
});
// Fetch a saved check result by id (for frontend consumption)
router.get('/check/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const doc = await checkResult_1.CheckResult.findById(id).lean();
        if (!doc)
            return res.status(404).json({ error: 'not_found' });
        // Return exactly what was stored
        return res.status(200).json(doc);
    }
    catch (err) {
        logger_1.logger.error({ err }, 'hackathon check get failed');
        return res.status(500).json({ error: 'internal_error' });
    }
});
// Convenience: list recent saved check results
router.get('/check', async (req, res) => {
    try {
        const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
        const docs = await checkResult_1.CheckResult.find({}).sort({ createdAt: -1 }).limit(limit).lean();
        const items = docs.map((d) => ({
            _id: d._id,
            startIso: d.startIso,
            endIso: d.endIso,
            count: d.count,
            createdAt: d.createdAt
        }));
        return res.status(200).json({ items, count: items.length });
    }
    catch (err) {
        logger_1.logger.error({ err }, 'hackathon check list failed');
        return res.status(500).json({ error: 'internal_error' });
    }
});
exports.default = router;
// Helpers: normalize hackathon day strings to safe UTC boundaries
function parseOwnerRepoFromUrl(u) {
    try {
        const url = new URL(u);
        if (url.hostname !== 'github.com')
            return null;
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length < 2)
            return null;
        const owner = parts[0];
        let repo = parts[1];
        repo = repo.replace(/\.git$/i, '');
        const candidate = `${owner}/${repo}`;
        return ownerRepoPattern.test(candidate) ? candidate : null;
    }
    catch {
        return null;
    }
}
function toYmd(s) {
    // Accept ISO-like datetime or date; return YYYY-MM-DD
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m)
        return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(s);
    if (!isNaN(d.getTime()))
        return d.toISOString().slice(0, 10);
    return s;
}
function toUtcDayStart(ymd) {
    const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0, 0));
    return dt.toISOString();
}
function toUtcDayEnd(ymd) {
    const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 23, 59, 59, 999));
    return dt.toISOString();
}
function orderTimeline(startYmd, endYmd) {
    if (startYmd && endYmd && startYmd.localeCompare(endYmd) > 0) {
        return { start: endYmd, end: startYmd, swapped: true };
    }
    return { start: startYmd, end: endYmd, swapped: false };
}
