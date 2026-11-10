/** Synthetic intake items for staging proofs. source is forced to 'fixture' server-side. */
export type FixtureIntake = {
  source_ref: string;
  subject: string;
  from_addr: string;
  excerpt: string;
  /** Exact company name to attribute, or undefined = Needs client. */
  account?: string;
  suggested_title?: string;
  suggested_due_offset_days?: number;
  triage_label?: "action" | "fyi";
};

export const fixtureIntake: FixtureIntake[] = [
  {
    source_ref: "fixture-intake-001",
    subject: "Re: listing copy refresh",
    from_addr: "buyer@client.example.invalid",
    excerpt: "Can you send the revised listing copy by next Friday?",
    account: "Acme Widgets (Synthetic)",
    suggested_title: "Send revised listing copy",
    suggested_due_offset_days: 7,
    triage_label: "action",
  },
  {
    source_ref: "fixture-intake-002",
    subject: "Fwd: pricing question",
    from_addr: "someone@unknown.example.invalid",
    excerpt: "Forwarding a question about the new pricing tier; who owns this?",
    suggested_title: "Answer pricing tier question",
    triage_label: "action",
  },
  {
    source_ref: "fixture-intake-003",
    subject: "FYI: they renewed",
    from_addr: "ops@client.example.invalid",
    excerpt: "FYI the renewal went through, no changes to scope.",
    account: "Acme Widgets (Synthetic)",
    triage_label: "fyi",
  },
];
