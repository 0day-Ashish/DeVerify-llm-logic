import axios from "axios";
import cheerio from "cheerio";

export type DevpostHackathon = {
    id: string;
    name: string;
    startDate: string; // ISO-ish date
    endDate: string;
    status: "upcoming" | "running" | "ended";
    testHack: boolean;
    tags?: string[];
};

const DEVPOST_BASE = "https://devpost.com";
const USER_AGENT = "deverify-scraper/1.0 (+https://github.com/)";
async function fetchHtml(url: string) {
    const res = await axios.get(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        timeout: 15000,
    });
    return res.data as string;
}

function toISOIfPossible(input?: string | null): string {
    if (!input) return "";
    const parsed = new Date(input);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
    // try stripping ordinal suffixes and commas
    try {
        const cleaned = input.replace(/(st|nd|rd|th)/gi, "").replace(/\s+/g, " ").trim();
        const p2 = new Date(cleaned);
        if (!isNaN(p2.getTime())) return p2.toISOString();
    } catch {
        // ignore
    }
    return input;
}

function parseStatus(startISO: string, endISO: string): "upcoming" | "running" | "ended" {
    const now = Date.now();
    const s = startISO ? Date.parse(startISO) : NaN;
    const e = endISO ? Date.parse(endISO) : NaN;
    if (!isNaN(s) && !isNaN(e)) {
        if (now < s) return "upcoming";
        if (now > e) return "ended";
        return "running";
    }
    if (!isNaN(s) && isNaN(e)) {
        return now < s ? "upcoming" : "running";
    }
    if (isNaN(s) && !isNaN(e)) {
        return now > e ? "ended" : "running";
    }
    return "ended";
}

function extractIdFromHref(href: string) {
    try {
        const u = new URL(href, DEVPOST_BASE);
        const parts = u.pathname.split("/").filter(Boolean);
        // Devpost hackathon URLs are usually /hackathons/<slug>
        // return last segment as id
        return parts.pop() || u.pathname;
    } catch {
        const parts = href.split("/").filter(Boolean);
        return parts.pop() || href;
    }
}

async function parseHackathonPage(href: string): Promise<DevpostHackathon | null> {
    try {
        const full = href.startsWith("http") ? href : new URL(href, DEVPOST_BASE).href;
        const html = await fetchHtml(full);
        const $ = cheerio.load(html);

        // Try JSON-LD first
        let startDate: string | null = null;
        let endDate: string | null = null;
        let tags: string[] = [];

        $('script[type="application/ld+json"]').each((i, el) => {
            const txt = $(el).html();
            if (!txt) return;
            try {
                const obj = JSON.parse(txt);
                const candidates = Array.isArray(obj) ? obj : [obj];
                for (const c of candidates) {
                    if (!c) continue;
                    if (c["@type"] === "Event" || String(c.type).toLowerCase() === "event") {
                        if (c.startDate) startDate = startDate || String(c.startDate);
                        if (c.endDate) endDate = endDate || String(c.endDate);
                        if (c.keywords) {
                            if (Array.isArray(c.keywords)) tags = tags.concat(c.keywords.map(String));
                            else if (typeof c.keywords === "string") tags = tags.concat(c.keywords.split(",").map((s: string) => s.trim()));
                        }
                    }
                    if (c["@graph"] && Array.isArray(c["@graph"])) {
                        for (const g of c["@graph"]) {
                            if (g && (g["@type"] === "Event" || String(g.type).toLowerCase() === "event")) {
                                if (g.startDate) startDate = startDate || String(g.startDate);
                                if (g.endDate) endDate = endDate || String(g.endDate);
                                if (g.keywords) {
                                    if (Array.isArray(g.keywords)) tags = tags.concat(g.keywords.map(String));
                                    else if (typeof g.keywords === "string") tags = tags.concat(g.keywords.split(",").map((s: string) => s.trim()));
                                }
                            }
                        }
                    }
                }
            } catch {
                // ignore JSON parse errors
            }
        });

        // Fallback name/title
        const title =
            $("h1").first().text().trim() ||
            $(".hero-title").first().text().trim() ||
            $("meta[property='og:title']").attr("content") ||
            $("title").text().trim() ||
            "";

        // Fallback date extraction from visible text
        if (!startDate || !endDate) {
            const dateSelectors = [
                ".dates",
                ".event-dates",
                ".hackathon-header .dates",
                ".info .date",
                ".event-details__dates",
            ];
            let dateText = "";
            for (const sel of dateSelectors) {
                const t = $(sel).first().text().trim();
                if (t) {
                    dateText = t;
                    break;
                }
            }
            if (dateText) {
                // extract month/day/year patterns and ISO patterns
                const dateMatches = dateText.match(/([A-Za-z]{3,}\s+\d{1,2}(?:,\s*\d{4})?|\d{4}-\d{2}-\d{2})/g);
                if (dateMatches && dateMatches.length > 0) {
                    const p0 = new Date(dateMatches[0]);
                    if (!isNaN(p0.getTime())) startDate = startDate || p0.toISOString();
                    if (dateMatches.length > 1) {
                        const p1 = new Date(dateMatches[1]);
                        if (!isNaN(p1.getTime())) endDate = endDate || p1.toISOString();
                    }
                }
            }

            // meta tags fallback
            const metaStart = $("meta[name='startDate'], meta[property='event:start_date'], meta[itemprop='startDate']").attr("content");
            const metaEnd = $("meta[name='endDate'], meta[property='event:end_date'], meta[itemprop='endDate']").attr("content");
            if (metaStart) startDate = startDate || metaStart;
            if (metaEnd) endDate = endDate || metaEnd;
        }

        // Tags fallback from page links
        if (tags.length === 0) {
            const tagCandidates = $(".tags a, .tags .tag, .hackathon-tags a, .keywords a");
            tagCandidates.each((i, el) => {
                const t = $(el).text().trim();
                if (t) tags.push(t);
            });
        }

        const id = extractIdFromHref(href);
        const name = title || id;
        const startISO = toISOIfPossible(startDate || "");
        const endISO = toISOIfPossible(endDate || "");

        const status = parseStatus(startISO, endISO);

        const lowered = (name + " " + (tags || []).join(" ")).toLowerCase();
        const testHack = /test|practice|sandbox/i.test(lowered) || (tags || []).some(t => /test|practice|sandbox/i.test(t));

        const result: DevpostHackathon = {
            id,
            name,
            startDate: startISO,
            endDate: endISO,
            status,
            testHack,
        };
        if (tags.length) result.tags = Array.from(new Set(tags)).filter(Boolean);

        return result;
    } catch (err) {
        // log to console for debugging but don't throw (keeps the overall scrape alive)
        // eslint-disable-next-line no-console
        console.warn(`failed to parse hackathon page ${href}:`, (err as Error).message || err);
        return null;
    }
}

export async function scrapeDevpostHackathons(listUrl: string): Promise<DevpostHackathon[]> {
    try {
        const html = await fetchHtml(listUrl);
        const $ = cheerio.load(html);

        // Collect candidate links to hackathons
        const anchors = new Set<string>();
        $("a[href]").each((i, el) => {
            const href = $(el).attr("href");
            if (!href) return;
            // common devpost hackathon paths: /hackathons/<slug>
            if (/\/hackathons?\/[^\/\?]+/i.test(href)) {
                try {
                    const full = new URL(href, DEVPOST_BASE).href;
                    anchors.add(full);
                } catch {
                    anchors.add(href);
                }
            }
        });

        const results: DevpostHackathon[] = [];
        // iterate sequentially to be polite; change to parallel with throttling if needed
        for (const href of anchors) {
            const parsed = await parseHackathonPage(href);
            if (parsed) results.push(parsed);
            // small delay to avoid hammering Devpost
            await new Promise((r) => setTimeout(r, 250));
        }

        return results;
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("failed to scrape devpost listing:", (err as Error).message || err);
        return [];
    }
}
