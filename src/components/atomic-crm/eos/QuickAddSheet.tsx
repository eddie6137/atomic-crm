// v1d U4 phone: the + button's "Client action" opens this drawer with the same
// quick-add fields. It stays open after a save for the next entry.
import { useEffect, useRef } from "react";
import { useNotify } from "ra-core";
import { useLocation } from "react-router";
import { FormDrawer } from "../misc/FormDrawer";
import { QuickAdd } from "./QuickAdd";

export const QuickAddSheet = ({
  open,
  onOpenChange,
  companyId,
  lockedCompanyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string | null;
  lockedCompanyId?: string | null;
}) => {
  const notify = useNotify();
  const location = useLocation();
  const opened = useRef(location.pathname);
  useEffect(() => {
    if (open) opened.current = location.pathname;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remember where it opened
  }, [open]);
  useEffect(() => {
    // "More fields" navigates to the full create form: close behind it.
    if (open && location.pathname !== opened.current) onOpenChange(false);
  }, [location.pathname, open, onOpenChange]);
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange}>
      <div className="flex flex-col" data-testid="quick-add-sheet">
        <h2 className="px-4 pt-5 pr-14 text-lg font-semibold">
          New client action
        </h2>
        {open && (
          <QuickAdd
            variant="drawer"
            companyId={companyId}
            lockedCompanyId={lockedCompanyId}
            onCreated={() => notify("Client action added", { type: "success" })}
          />
        )}
      </div>
    </FormDrawer>
  );
};
