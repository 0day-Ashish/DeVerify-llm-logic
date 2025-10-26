import mongoose, { Schema } from 'mongoose';

export interface ICheckResult extends Document {
  startIso: string;
  endIso: string;
  useLlm?: boolean;
  includeReadme?: boolean;
  includeReadmeLlm?: boolean;
  repoLimit?: number;
  reposInput?: string[];
  repoUrlsOriginal?: string[];
  createdAt: Date;
  updatedAt: Date;
  // Store the entire response payload so frontend can fetch it directly
  timeline: any;
  normalizedTimeline: any;
  repos: any[];
  count: number;
}

const CheckResultSchema = new Schema<ICheckResult>({
  startIso: { type: String, required: true },
  endIso: { type: String, required: true },
  useLlm: { type: Boolean, default: false },
  includeReadme: { type: Boolean, default: false },
  includeReadmeLlm: { type: Boolean, default: false },
  repoLimit: { type: Number },
  reposInput: { type: [String], default: [] },
  repoUrlsOriginal: { type: [String], default: [] },
  timeline: { type: Schema.Types.Mixed },
  normalizedTimeline: { type: Schema.Types.Mixed },
  repos: { type: Schema.Types.Mixed, default: [] },
  count: { type: Number, default: 0 }
}, { timestamps: true });

export const CheckResult = mongoose.models.CheckResult || mongoose.model<ICheckResult>('CheckResult', CheckResultSchema);

export default CheckResult;
