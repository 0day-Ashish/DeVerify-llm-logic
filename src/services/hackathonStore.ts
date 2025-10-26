import mongoose, { Schema, Document, Model } from "mongoose";
import { DevpostHackathon } from "./hackathonScraper";

interface IHackathonDoc extends Document {
    hackId: string;
    name: string;
    dataJson: string;
    createdAt: Date;
    updatedAt: Date;
}

const HackathonSchema = new Schema<IHackathonDoc>(
    {
        hackId: { type: String, required: true, index: true, unique: true },
        name: { type: String, required: true },
        dataJson: { type: String, required: true },
    },
    {
        timestamps: true,
        collection: "hack-info",
    }
);

const HackathonModel: Model<IHackathonDoc> =
    (mongoose.models?.HackathonInfo as Model<IHackathonDoc>) ||
    mongoose.model<IHackathonDoc>("HackathonInfo", HackathonSchema);

/**
 * Save or upsert an array of DevpostHackathon objects.
 * Stores the full object as a JSON string in `dataJson`.
 */
export async function saveHackathons(hacks: DevpostHackathon[]) {
    const results: IHackathonDoc[] = [];
    for (const h of hacks) {
        const dataJson = JSON.stringify(h);
        const doc = await HackathonModel.findOneAndUpdate(
            { hackId: h.id },
            { name: h.name, dataJson },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).exec();
        if (doc) results.push(doc);
    }
    return results;
}