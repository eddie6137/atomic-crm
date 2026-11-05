import type { BulkField } from "./EosBulkActions";
import {
  COMMITMENT_STATUSES,
  ISSUE_STATUSES,
  PRIORITIES,
  PROJECT_STATUSES,
} from "./constants";

const owner: BulkField = {
  key: "owner",
  label: "Owner",
  source: "owner_sales_id",
  kind: "owner",
};
const priority: BulkField = {
  key: "priority",
  label: "Priority",
  source: "priority",
  kind: "select",
  options: PRIORITIES,
};

export const PROJECT_BULK: BulkField[] = [
  {
    key: "status",
    label: "Status",
    source: "status",
    kind: "select",
    options: PROJECT_STATUSES,
  },
  owner,
  { key: "due", label: "Target date", source: "target_date", kind: "date" },
];
export const COMMITMENT_BULK: BulkField[] = [
  {
    key: "status",
    label: "Status",
    source: "status",
    kind: "select",
    options: COMMITMENT_STATUSES,
  },
  owner,
  priority,
  { key: "due", label: "Due date", source: "due_date", kind: "date" },
];
export const ISSUE_BULK: BulkField[] = [
  {
    key: "status",
    label: "Status",
    source: "status",
    kind: "select",
    options: ISSUE_STATUSES,
  },
  owner,
  priority,
  { key: "due", label: "Due date", source: "due_date", kind: "date" },
];
