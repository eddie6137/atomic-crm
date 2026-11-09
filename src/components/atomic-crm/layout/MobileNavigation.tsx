import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Home, ListTodo, Plus, Settings, Target, Users } from "lucide-react";
import { useTranslate } from "ra-core";
import {
  Link,
  matchPath,
  useLocation,
  useMatch,
  useNavigate,
} from "react-router";
import { ContactCreateSheet } from "../contacts/ContactCreateSheet";
import { useState } from "react";
import { NoteCreateSheet } from "../notes/NoteCreateSheet";

export const MobileNavigation = () => {
  const location = useLocation();
  const translate = useTranslate();

  let currentPath: string | boolean = "/";
  if (matchPath("/", location.pathname)) {
    currentPath = "/";
  } else if (matchPath("/contacts/*", location.pathname)) {
    currentPath = "/contacts";
  } else if (matchPath("/companies/*", location.pathname)) {
    currentPath = "/companies";
  } else if (
    matchPath("/client-actions/*", location.pathname) ||
    matchPath("/eos_commitments/*", location.pathname)
  ) {
    currentPath = "/client-actions";
  } else if (matchPath("/deals/*", location.pathname)) {
    currentPath = "/deals";
  } else if (/^\/eos/.test(location.pathname)) {
    currentPath = "/eos";
  } else {
    currentPath = false;
  }

  // CTO nit (v1d U2): hide the floating create + global bottom nav while the
  // Client Actions drawer/sheet is open so they don't overlap Priority on iPhone.
  const drawerOpen =
    typeof document !== "undefined" &&
    document.body.dataset.eosDrawerOpen === "1";
  // Re-render on dataset changes via a cheap poll of location+search (drawer uses URL ?item=).
  const itemOpen = /(?:\?|&)item=/.test(location.search + location.hash);

  if (drawerOpen || itemOpen) return null;

  return (
    <nav
      aria-label={translate("crm.navigation.label")}
      className="fixed bottom-0 left-0 right-0 z-50 bg-secondary h-14"
      data-testid="mobile-navigation"
      style={{
        // Safe-area inset (needs viewport-fit=cover) replaces the old iOS-PWA-only 15px hack.
        paddingBottom: "env(safe-area-inset-bottom)",
        height: "calc(3.5rem + env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex justify-center">
        <>
          <NavigationButton
            href="/"
            Icon={Home}
            label={translate("ra.page.dashboard")}
            isActive={currentPath === "/"}
          />
          <NavigationButton
            href="/contacts"
            Icon={Users}
            label={translate("resources.contacts.name", {
              smart_count: 2,
            })}
            isActive={currentPath === "/contacts"}
          />
          <CreateButton />
          <NavigationButton
            href="/client-actions"
            Icon={ListTodo}
            label="Actions"
            isActive={currentPath === "/client-actions"}
          />
          <NavigationButton
            href="/eos"
            Icon={Target}
            label="EOS"
            isActive={currentPath === "/eos"}
          />
          <SettingsButton />
        </>
      </div>
    </nav>
  );
};

const NavigationButton = ({
  href,
  Icon,
  label,
  isActive,
}: {
  href: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  isActive: boolean;
}) => (
  <Link
    to={href}
    className={cn(
      buttonVariants({ variant: "ghost" }),
      "flex-col gap-1 h-auto py-2 px-1 rounded-md w-16",
      isActive ? null : "text-muted-foreground",
    )}
  >
    <Icon className="size-6" />
    <span className="text-[0.6rem] font-medium">{label}</span>
  </Link>
);

const CreateButton = () => {
  const translate = useTranslate();
  const contact_id = useMatch("/contacts/:id/*")?.params.id;
  const [contactCreateOpen, setContactCreateOpen] = useState(false);
  const [noteCreateOpen, setNoteCreateOpen] = useState(false);
  const navigate = useNavigate();
  const company_id = useMatch("/companies/:id/*")?.params.id;

  return (
    <>
      <ContactCreateSheet
        open={contactCreateOpen}
        onOpenChange={setContactCreateOpen}
      />
      <NoteCreateSheet
        open={noteCreateOpen}
        onOpenChange={setNoteCreateOpen}
        contact_id={contact_id}
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="default"
              size="icon"
              className="h-16 w-16 rounded-full -mt-3"
              aria-label={translate("ra.action.create")}
            />
          }
        >
          <Plus className="size-10" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuItem
            className="h-12 px-4 text-base"
            onClick={() => {
              setContactCreateOpen(true);
            }}
          >
            {translate("resources.contacts.forcedCaseName")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="h-12 px-4 text-base"
            onClick={() => {
              setNoteCreateOpen(true);
            }}
          >
            {translate("resources.notes.forcedCaseName")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="h-12 px-4 text-base"
            data-testid="mobile-create-client-action"
            onClick={() => {
              navigate(
                company_id
                  ? `/eos_commitments/create?source=${encodeURIComponent(JSON.stringify({ company_id: Number(company_id) || company_id }))}`
                  : "/eos_commitments/create",
              );
            }}
          >
            Client action
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

const SettingsButton = () => {
  const translate = useTranslate();
  const location = useLocation();
  const isActive = !!matchPath("/settings", location.pathname);

  return (
    <NavigationButton
      href="/settings"
      Icon={Settings}
      label={translate("crm.settings.title")}
      isActive={isActive}
    />
  );
};
