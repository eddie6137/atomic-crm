import { CRM } from "@/components/atomic-crm/root/CRM";

const amplifyDealStages = [
  { value: "lead", label: "Lead" },
  { value: "qualified", label: "Qualified" },
  { value: "discovery", label: "Discovery" },
  { value: "proposal", label: "Proposal" },
  { value: "negotiation", label: "Negotiation" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

/**
 * Amplify thin-customize: 7 deal stages (see amplify-agentic-os
 * docs/egm/mini-crm/atomic-amplify-7-stages-patch.md).
 */
const App = () => (
  <CRM
    title="Amplify CRM"
    dealStages={amplifyDealStages}
    dealPipelineStatuses={["won"]}
  />
);

export default App;
