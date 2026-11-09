// v1d U4 phone: the + button's "Client action" opens this drawer with the same
// quick-add fields. It stays open after a save for the next entry.
import { useEffect, useRef } from "react";
import { useNotify } from "ra-core";
import { useLocation, useNavigate } from "react-router";
import { FormDrawer } from "../misc/FormDrawer";
import { QUICK_ADD_EVENT, QuickAdd } from "./QuickAdd";
import { quickAddShowPath } from "./clientActions";

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
  const navigate = useNavigate();
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
            onCreated={(rec) => {
              // CE nit 5: a mounted Client Actions view (list behind the sheet)
              // highlights the row or shows the hidden hint, like desktop.
              const ev = new CustomEvent(QUICK_ADD_EVENT, {
                detail: rec,
                cancelable: true,
              });
              if (!window.dispatchEvent(ev)) return;
              // No list on screen: confirm with a link to the highlighted row.
              const to = quickAddShowPath(rec.id, lockedCompanyId);
              notify(
                <span data-testid="quick-add-added-toast">
                  Client action added.{" "}
                  <button
                    type="button"
                    className="underline font-medium"
                    data-testid="quick-add-show"
                    onClick={() => {
                      onOpenChange(false);
                      navigate(to);
                    }}
                  >
                    Show
                  </button>
                </span>,
                { type: "success" },
              );
            }}
          />
        )}
      </div>
    </FormDrawer>
  );
};
