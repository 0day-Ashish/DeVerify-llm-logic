import mongoose, { Schema } from 'mongoose';

export interface IHackathonInfo extends Document {
  hackId: string;          // stable identifier derived from URL (slug)
  sourceUrl: string;       // original URL we scraped from
  name: string;
  startDate: string;       // YYYY-MM-DD or ''
  endDate: string;         // YYYY-MM-DD or ''
  status: 'upcoming' | 'running' | 'ended';
  testHack: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  lastScrapedAt: Date;
}

const HackathonInfoSchema = new Schema<IHackathonInfo>({
  hackId: { type: String, required: true, index: true, unique: true },
  sourceUrl: { type: String, required: true },
  name: { type: String, required: true },
  startDate: { type: String, default: '' },
  endDate: { type: String, default: '' },
  status: { type: String, enum: ['upcoming','running','ended'], required: true },
  testHack: { type: Boolean, default: false },
  tags: { type: [String], default: [] },
  lastScrapedAt: { type: Date, default: () => new Date() }
}, { timestamps: true, collection: 'info' });

export const HackathonInfo = mongoose.models.HackathonInfo || mongoose.model<IHackathonInfo>('HackathonInfo', HackathonInfoSchema);

export default HackathonInfo;
