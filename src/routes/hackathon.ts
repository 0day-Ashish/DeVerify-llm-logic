import express from "express";
import { scrapeDevpostHackathons } from "../services/hackathonScraper";
import { saveHackathons } from "../services/hackathonStore";

const router = express.Router();

// Add this endpoint to fetch devpost hackathons and save to DB
router.post("/scrape", async (req, res) => {
    try {
        const listUrl =
            (req.body && req.body.url) ||
            "https://devpost.com/hackathons?open_to[]=public&status[]=ended";
        const hacks = await scrapeDevpostHackathons(listUrl);
        const savedDocs = await saveHackathons(hacks);
        return res.json({
            ok: true,
            count: hacks.length,
            saved: savedDocs.length,
            hacks,
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: String(err) });
    }
});

export default router;
