import { CRM } from "@/components/atomic-crm/root/CRM";

/**
 * Amplify CRM stages.
 * Keep `delayed` so Waiting/pipeline-parked deals validate in Settings
 * (validateItemsInUse blocks saving if deals reference a stage not listed).
 * Upstream `opportunity` is remapped to `lead` in the DB for this install.
 */
const amplifyDealStages = [
  { value: "lead", label: "Lead" },
  { value: "qualified", label: "Qualified" },
  { value: "discovery", label: "Discovery" },
  { value: "proposal", label: "Proposal" },
  { value: "negotiation", label: "Negotiation" },
  { value: "delayed", label: "Delayed" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const amplifyDealCategories = [
  { value: "other", label: "Other" },
  { value: "opportunity", label: "Opportunity" },
  { value: "copywriting", label: "Copywriting" },
  { value: "print-project", label: "Print project" },
  { value: "ui-design", label: "UI Design" },
  { value: "website-design", label: "Website design" },
];

const amplifyTaskTypes = [
  { value: "none", label: "None" },
  { value: "email", label: "Email" },
  { value: "demo", label: "Demo" },
  { value: "lunch", label: "Lunch" },
  { value: "meeting", label: "Meeting" },
  { value: "follow-up", label: "Follow-up" },
  { value: "thank-you", label: "Thank you" },
  { value: "ship", label: "Ship" },
  { value: "call", label: "Call" },
  { value: "project", label: "Project" },
  { value: "to-do", label: "To Do" },
];

/**
 * Amplify thin-customize: stages + task types (see amplify-agentic-os
 * docs/egm/mini-crm/atomic-amplify-7-stages-patch.md).
 */
const App = () => (
  <CRM
    title="Amplify CRM"
    dealStages={amplifyDealStages}
    dealCategories={amplifyDealCategories}
    dealPipelineStatuses={["won"]}
    taskTypes={amplifyTaskTypes}
  />
);

export default App;
