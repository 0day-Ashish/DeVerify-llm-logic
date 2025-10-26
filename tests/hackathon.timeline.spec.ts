import { scrapeHackathonTimeline } from '../src/services/hackathonScraper';
import axios from 'axios';
import cheerio from 'cheerio';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('scrapeHackathonTimeline normalization', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('picks earliest start and latest end and collapses duplicate end checkpoints', async () => {
    const html = `
      <html>
        <body>
          <div>Kick-off: Aug 21, 2025</div>
          <div>Submission deadline: Oct 25, 2025</div>
          <div>Final showcase: Oct 26, 2025</div>
          <a href="https://github.com/owner/repo">repo</a>
        </body>
      </html>
    `;
    mockedAxios.get.mockResolvedValue({ status: 200, data: html } as any);

    const tl = await scrapeHackathonTimeline('http://example.com');
    expect(tl.start).toBe('2025-08-21');
    expect(tl.end).toBe('2025-10-26');
    const endCheckpoints = tl.checkpoints.filter((c) => c.label === 'end');
    expect(endCheckpoints).toHaveLength(1);
    expect(endCheckpoints[0]?.date).toBe('2025-10-26');
  });

  it('swaps start/end if reversed due to noisy labels', async () => {
    const html = `
      <html>
        <body>
          <div>End: Aug 21, 2025</div>
          <div>Start: Oct 26, 2025</div>
        </body>
      </html>
    `;
    mockedAxios.get.mockResolvedValue({ status: 200, data: html } as any);

    const tl = await scrapeHackathonTimeline('http://example.com');
    expect(tl.start).toBe('2025-08-21');
    expect(tl.end).toBe('2025-10-26');
  });
});

export type DevpostHackathon = {
    id: string;
    name: string;
    startDate: string; // ISO-ish
    endDate: string;   // ISO-ish
    status: "upcoming" | "running" | "ended";
    testHack: boolean;
    tags?: string[];
};

const DEVPOST_BASE = "https://devpost.com";

function isoOrEmpty(d?: string | null) {
    if (!d) return "";
    try {
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return d; // return raw if can't parse
        return dt.toISOString();
    } catch {
        return d;
    }
}

async function fetchHtml(url: string) {
    const res = await axios.get(url, {
        headers: { "User-Agent": "deverify-scraper/1.0 (+https://example.com)" },
        timeout: 15000,
    });
    return res.data as string;
}

function parseStatus(startISO: string, endISO: string) {
    const now = Date.now();
    const s = startISO ? Date.parse(startISO) : NaN;
    const e = endISO ? Date.parse(endISO) : NaN;
    if (!isNaN(s) && !isNaN(e)) {
        if (now < s) return "upcoming";
        if (now > e) return "ended";
        return "running";
    }
    // fallback
    return "ended";
}

function extractIdFromPath(href: string) {
    try {
        const u = new URL(href, DEVPOST_BASE);
        const parts = u.pathname.split("/").filter(Boolean);
        return parts.pop() || u.pathname;
    } catch {
        // fallback raw
        const parts = href.split("/").filter(Boolean);
        return parts.pop() || href;
    }
}

async function parseHackathonPage(href: string): Promise<DevpostHackathon | null> {
    try {
        const full = href.startsWith("http") ? href : new URL(href, DEVPOST_BASE).href;
        const html = await fetchHtml(full);
        const $ = cheerio.load(html);

        // Try JSON-LD first (Devpost often includes structured data)
        let startDate: string | null = null;
        let endDate: string | null = null;
        let tags: string[] = [];
        const jsonLd = $('script[type="application/ld+json"]').map((i, el) => $(el).html()).get();
        for (const block of jsonLd) {
            try {
                const obj = JSON.parse(block || "{}");
                if (obj["@type"] === "Event" || obj.type === "Event") {
                    if (obj.startDate) startDate = obj.startDate;
                    if (obj.endDate) endDate = obj.endDate;
                    if (obj.keywords) {
                        if (Array.isArray(obj.keywords)) tags = obj.keywords;
                        else if (typeof obj.keywords === "string") tags = obj.keywords.split(",").map(s => s.trim());
                    }
                    break;
                }
                // sometimes Devpost includes a "site" object with nested event arrays
                if (obj && obj["@graph"] && Array.isArray(obj["@graph"])) {
                    const ev = obj["@graph"].find((g: any) => g["@type"] === "Event");
                    if (ev) {
                        startDate = startDate || ev.startDate;
                        endDate = endDate || ev.endDate;
                        if (ev.keywords) {
                            if (Array.isArray(ev.keywords)) tags = ev.keywords;
                            else if (typeof ev.keywords === "string") tags = ev.keywords.split(",").map((s: string) => s.trim());
                        }
                    }
                }
            } catch {
                // ignore JSON parse failures
            }
        }

        // Fallbacks if JSON-LD not present / incomplete
        const title = $("h1, .hero-title, .hackathon-title").first().text().trim() || $("meta[property='og:title']").attr("content") || "";
        if (!startDate || !endDate) {
            // Devpost often shows timeline blocks, try to find date strings
            const dateText = $('.hackathon-header .dates, .event-dates, .dates, .info .date').first().text().trim();
            if (dateText) {
                // e.g. "Oct 1 — Oct 31, 2024" or "Ends Oct 31, 2024"
                // naive extraction: find all date-like substrings
                const dateMatches = dateText.match(/([A-Za-z]{3,}\s+\d{1,2}(?:,\s*\d{4})?|\d{4}-\d{2}-\d{2})/g);
                if (dateMatches && dateMatches.length >= 1) {
                    const parsed = dateMatches.map(d => new Date(d));
                    if (!isNaN(parsed[0].getTime())) startDate = startDate || parsed[0].toISOString();
                    if (!isNaN(parsed[1]?.getTime())) endDate = endDate || parsed[1].toISOString();
                }
            }

            // Look for metadata attributes
            const metaStart = $("meta[name='startDate'], meta[property='event:start_date']").attr("content");
            const metaEnd = $("meta[name='endDate'], meta[property='event:end_date']").attr("content");
            if (metaStart) startDate = startDate || metaStart;
            if (metaEnd) endDate = endDate || metaEnd;
        }

        // Tags: look for tag list on page
        if (tags.length === 0) {
            tags = $(".tags a, .tags .tag, .hackathon-tags a")
                .map((i, el) => $(el).text().trim())
                .get()
                .filter(Boolean);
        }

        const id = extractIdFromPath(href);
        const name = title || id;
        const startISO = isoOrEmpty(startDate || "");
        const endISO = isoOrEmpty(endDate || "");

        const status = parseStatus(startISO, endISO);
        const lowered = name.toLowerCase() + " " + (tags || []).join(" ").toLowerCase();
        const testHack = lowered.includes("test") || lowered.includes("practice") || (tags || []).some(t => /test|practice/i.test(t));

        return {
            id,
            name,
            startDate: startISO,
            endDate: endISO,
            status,
            testHack,
            tags: tags.length ? tags : undefined,
        };
    } catch (err) {
        // swallow single page errors so overall scrape continues
        return null;
    }
}

export async function scrapeDevpostHackathons(listUrl: string): Promise<DevpostHackathon[]> {
    const html = await fetchHtml(listUrl);
    const $ = cheerio.load(html);

    // Find candidate hackathon links. Devpost uses /hackathons/<slug>
    const anchors = $("a[href*='/hackathons/'], a[href*='/hackathon/']")
        .map((i, el) => $(el).attr("href"))
        .get()
        .filter(Boolean);

    // Deduplicate and normalize
    const unique = Array.from(new Set(anchors)).map(h => {
        try {
            return new URL(h, DEVPOST_BASE).href;
        } catch {
            return h;
        }
    });

    // Visit each link sequentially (keeps requests polite); you can increase concurrency if desired
    const results: DevpostHackathon[] = [];
    for (const href of unique) {
        const parsed = await parseHackathonPage(href);
        if (parsed) results.push(parsed);
        // small delay to be polite
        await new Promise(r => setTimeout(r, 250));
    }

    return results;
}
