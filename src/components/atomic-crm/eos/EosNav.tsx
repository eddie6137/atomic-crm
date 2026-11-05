import { Link, useLocation } from "react-router";

const tabs = [
  { to: "/eos", label: "Accounts" },
  { to: "/eos_projects", label: "Projects" },
  { to: "/eos_commitments", label: "Commitments" },
  { to: "/eos_issues", label: "Issues" },
  { to: "/eos/import", label: "Import & reconcile" },
];

export const EosNav = () => {
  const { pathname } = useLocation();
  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b mb-2"
      data-testid="eos-nav"
    >
      {tabs.map((t) => {
        const active =
          t.to === "/eos" ? pathname === "/eos" : pathname.startsWith(t.to);
        return (
          <Link
            key={t.to}
            to={t.to}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 ${active ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
};
