/**
 * STUB ingestion: synthetic Slack/Fireflies-style proposals. No live Slack/Fireflies
 * reads happen in v1b; a real worker needs CTO OK (spec §5).
 * Account/owner are given by NAME and resolved by exact match at load time, never guessed.
 */
export type FixtureProposal = {
  source: "slack" | "fireflies";
  source_ref: string;
  source_url: string;
  excerpt: string;
  target_table: "eos_commitments" | "eos_issues";
  title: string;
  account?: string;
  owner?: string;
  due_date?: string;
  priority?: string;
  speaker?: string;
  confidence: number;
};

export const fixtureProposals: FixtureProposal[] = [
  {
    source: "fireflies",
    source_ref: "ff-meeting-synthetic-001#00:12:31",
    source_url: "https://app.fireflies.ai/view/synthetic-001",
    excerpt: "We'll send the revised listing copy by next Friday.",
    target_table: "eos_commitments",
    title: "Send revised listing copy",
    account: "Acme Widgets (Synthetic)",
    owner: "EOS Tester",
    due_date: "2026-11-13",
    speaker: "EOS Tester",
    confidence: 0.82,
  },
  {
    source: "slack",
    source_ref: "C0SYNTH/p1793900000000100",
    source_url: "https://example.invalid/slack/C0SYNTH/p1793900000000100",
    excerpt: "Northwind's inventory feed failed again overnight.",
    target_table: "eos_issues",
    title: "Inventory feed failed overnight",
    account: "Northwind Demo Co",
    owner: "Pat Demo",
    priority: "high",
    confidence: 0.74,
  },
  {
    source: "slack",
    source_ref: "C0SYNTH/p1793900000000200",
    source_url: "https://example.invalid/slack/C0SYNTH/p1793900000000200",
    excerpt: "Someone should follow up with the new prospect about pricing.",
    target_table: "eos_commitments",
    title: "Follow up with prospect on pricing",
    account: "Unknown Prospect Inc",
    confidence: 0.41,
  },
];

export const fingerprintOf = (p: FixtureProposal) =>
  `${p.source}|${p.source_ref}|${p.target_table}|${p.excerpt.trim().toLowerCase()}`;
