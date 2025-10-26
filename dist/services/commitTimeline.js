"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeCommitMetrics = computeCommitMetrics;
exports.computeMetricsForRepos = computeMetricsForRepos;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
async function fetchCommits(repo, sinceIso, untilIso, page = 1) {
    const [owner, name] = repo.split('/');
    const headers = { 'User-Agent': 'deverify-commits/1.0', Accept: 'application/vnd.github+json' };
    if (config_1.config.githubToken)
        headers.Authorization = `token ${config_1.config.githubToken}`;
    const params = { per_page: 100, page };
    if (sinceIso)
        params.since = sinceIso;
    if (untilIso)
        params.until = untilIso;
    const url = `https://api.github.com/repos/${owner}/${name}/commits`;
    const r = await axios_1.default.get(url, { headers, params, timeout: 15000 });
    return Array.isArray(r.data) ? r.data : [];
}
async function computeCommitMetrics(repo, startIso, endIso) {
    const notes = [];
    // Helper: detect any commits before hackathon start (strict disqualification rule)
    async function hasAnyCommitBeforeStart() {
        try {
            const [owner, name] = repo.split('/');
            const headers = { 'User-Agent': 'deverify-commits/1.0', Accept: 'application/vnd.github+json' };
            if (config_1.config.githubToken)
                headers.Authorization = `token ${config_1.config.githubToken}`;
            const params = { per_page: 1, until: new Date(startIso).toISOString(), page: 1 };
            const url = `https://api.github.com/repos/${owner}/${name}/commits`;
            const r = await axios_1.default.get(url, { headers, params, timeout: 15000 });
            const arr = Array.isArray(r.data) ? r.data : [];
            return arr.length > 0;
        }
        catch {
            // If GitHub API fails here, don't auto-disqualify; record a note and fall back to 30-day window heuristic below
            notes.push('pre_start_check_failed');
            return false;
        }
    }
    // during
    let during = [];
    try {
        const page1 = await fetchCommits(repo, startIso, endIso, 1);
        during = page1; // keep it simple; first 100 should be fine for most hackathons
        if (page1.length === 100)
            notes.push('truncated_during_commits');
    }
    catch (e) {
        notes.push('during_fetch_failed');
    }
    // before window (last 30 days before start) and after window (30 days after end)
    const start = new Date(startIso).toISOString();
    const end = new Date(endIso).toISOString();
    const beforeWindowStart = new Date(new Date(startIso).getTime() - 30 * 86400000).toISOString();
    const afterWindowEnd = new Date(new Date(endIso).getTime() + 30 * 86400000).toISOString();
    let before = [];
    let after = [];
    try {
        before = await fetchCommits(repo, beforeWindowStart, start, 1);
    }
    catch {
        notes.push('before_fetch_failed');
    }
    try {
        after = await fetchCommits(repo, end, afterWindowEnd, 1);
    }
    catch {
        notes.push('after_fetch_failed');
    }
    const commitsDuring = during.length;
    const commitsBefore = before.length;
    const commitsAfter = after.length;
    // GitHub API returns commits in reverse chronological order (newest first) by default.
    // To avoid ordering assumptions, compute min/max timestamps explicitly.
    const duringDates = [];
    if (commitsDuring > 0) {
        for (const c of during) {
            const d = c?.commit?.committer?.date || c?.commit?.author?.date;
            if (d)
                duringDates.push(new Date(d).toISOString());
        }
    }
    let firstDuringAt = null; // earliest
    let lastDuringAt = null; // latest
    if (duringDates.length) {
        let minTs = Infinity;
        let maxTs = -Infinity;
        for (const iso of duringDates) {
            const t = Date.parse(iso);
            if (!Number.isNaN(t)) {
                if (t < minTs)
                    minTs = t;
                if (t > maxTs)
                    maxTs = t;
            }
        }
        firstDuringAt = Number.isFinite(minTs) ? new Date(minTs).toISOString() : null;
        lastDuringAt = Number.isFinite(maxTs) ? new Date(maxTs).toISOString() : null;
    }
    // days active during window
    let daysActiveDuring = 0;
    if (commitsDuring > 0) {
        const daySet = new Set();
        for (const c of during) {
            const d = c?.commit?.committer?.date || c?.commit?.author?.date;
            if (d)
                daySet.add(new Date(d).toISOString().slice(0, 10));
        }
        daysActiveDuring = daySet.size;
    }
    const avgPerDay = daysActiveDuring ? commitsDuring / daysActiveDuring : 0;
    // Simple scoring heuristic:
    // - Base on commitsDuring (more is better up to a cap)
    // - Reward activity spread (daysActiveDuring)
    // - Penalize if commits are only before or only after
    // Score 0-10
    let score = 0;
    score += Math.min(6, Math.floor(Math.min(commitsDuring, 30) / 5)); // up to 6 points
    score += Math.min(3, Math.floor(Math.min(daysActiveDuring, 15) / 5)); // up to 3 points
    if (commitsDuring === 0)
        score = 0;
    if (commitsBefore === 0 && commitsAfter === 0 && commitsDuring > 0)
        notes.push('repo_created_for_hackathon_possible');
    if (commitsBefore > 0 && commitsDuring === 0 && commitsAfter > 0)
        notes.push('no_activity_during_window');
    if (avgPerDay > 10)
        notes.push('burst_activity');
    score = Math.max(0, Math.min(10, score));
    // Strict disqualification: any commit before the hackathon start disqualifies the project
    // Primary check via lightweight API call (any commit until startIso). If that fails, fallback: if our 30-day sample has commitsBefore>0, also disqualify.
    let disqualified = false;
    let disqualificationReason;
    try {
        const preStart = await hasAnyCommitBeforeStart();
        if (preStart) {
            disqualified = true;
            disqualificationReason = 'pre_hack_commits_detected';
            notes.push('disqualified_pre_start_commit');
        }
        else if (commitsBefore > 0) {
            // Fallback heuristic if API check failed or returned 0 but our sampled window shows prior commits
            disqualified = true;
            disqualificationReason = 'pre_hack_commits_detected_within_30d';
            notes.push('disqualified_pre_start_commit_30d');
        }
    }
    catch {
        // no-op
    }
    return {
        repo,
        commitsDuring,
        commitsBefore,
        commitsAfter,
        firstDuringAt,
        lastDuringAt,
        daysActiveDuring,
        avgCommitsPerDayDuring: Number(avgPerDay.toFixed(2)),
        score,
        disqualified,
        disqualificationReason,
        notes
    };
}
exports.default = computeCommitMetrics;
// Bulk helper: compute metrics for a list of owner/repo strings
async function computeMetricsForRepos(repos, startIso, endIso) {
    const out = [];
    // simple chunked concurrency of 5
    const chunk = 5;
    for (let i = 0; i < repos.length; i += chunk) {
        const batch = repos.slice(i, i + chunk);
        const results = await Promise.all(batch.map((r) => computeCommitMetrics(r, startIso, endIso)));
        out.push(...results);
    }
    // sort: non-disqualified first, then by score, then by commitsDuring
    out.sort((a, b) => {
        const dq = (a.disqualified ? 1 : 0) - (b.disqualified ? 1 : 0);
        if (dq !== 0)
            return dq;
        const byScore = b.score - a.score;
        if (byScore !== 0)
            return byScore;
        return b.commitsDuring - a.commitsDuring;
    });
    return out;
}
