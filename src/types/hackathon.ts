export type HackathonStatus = 'upcoming' | 'running' | 'ended';

export interface HackathonInfo {
  id: string;          // stable identifier derived from URL (slug or host+path)
  name: string;        // human-readable name from page title/meta
  startDate: string;   // YYYY-MM-DD when available, else empty string
  endDate: string;     // YYYY-MM-DD when available, else empty string
  status: HackathonStatus; // computed from dates vs now
  testHack: boolean;   // heuristic flag for test/demo/practice hackathons
  tags?: string[];     // optional tags/keywords parsed from page
}
