import mongoose, { Schema } from 'mongoose';

export type MintEvidence = {
  chain?: 'alfajores' | 'celo';
  contractAddress?: string;
  txHash?: string;
  tokenId?: string;
  tokenURI?: string | null;
  mintVerified?: boolean;
  metadataStatus?: 'pinned' | 'resolvable' | 'missing' | 'mismatch' | null;
};

export type LLMResult = {
  raw?: string;
  parsed?: {
    score: number;
    confidence: 'low' | 'medium' | 'high';
    explanation: string;
    reasons: string[];
    flags: string[];
  } | null;
};

export interface ISubmission extends Document {
  repoUrl: string;
  demoUrl?: string;
  submitterWallet?: string;
  status: 'pending' | 'running' | 'scored' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  attempts: number;
  github?: any;
  signals?: any;
  mintEvidence?: MintEvidence;
  llm?: LLMResult;
  score?: number;
  explanation?: string;
  flags?: string[];
  ipfsProof?: { ipfsHash?: string | null } | null;
}

const SubmissionSchema = new Schema<ISubmission>({
  repoUrl: { type: String, required: true },
  demoUrl: { type: String },
  submitterWallet: { type: String },
  status: { type: String, default: 'pending' },
  attempts: { type: Number, default: 0 },
  github: { type: Schema.Types.Mixed },
  signals: { type: Schema.Types.Mixed },
  mintEvidence: { type: Schema.Types.Mixed },
  llm: { type: Schema.Types.Mixed },
  score: { type: Number },
  explanation: { type: String },
  flags: { type: [String], default: [] },
  ipfsProof: { type: Schema.Types.Mixed }
}, { timestamps: true });

export const Submission = mongoose.models.Submission || mongoose.model<ISubmission>('Submission', SubmissionSchema);

export default Submission;
