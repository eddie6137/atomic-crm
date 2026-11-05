import { useState } from "react";
import { useDataProvider, useNotify } from "ra-core";
import { Button } from "@/components/ui/button";
import { EosNav } from "../EosNav";
import { fixtureCommitments, fixtureIssues } from "./fixture";
import { applyImport, type Lookup } from "./sheetImport";

/**
 * v1a: imports the SYNTHETIC fixture only. Live Team-sheet import waits for the
 * Google Sheets connector + CTO mapping confirmation (§4.3). No write-back.
 */
export const EosImportPage = () => {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const run = async () => {
    setBusy(true);
    try {
      const [companies, sales] = await Promise.all([
        dataProvider.getList("companies", {
          pagination: { page: 1, perPage: 1000 },
          sort: { field: "name", order: "ASC" },
          filter: {},
        }),
        dataProvider.getList("sales", {
          pagination: { page: 1, perPage: 1000 },
          sort: { field: "id", order: "ASC" },
          filter: {},
        }),
      ]);
      const lookup: Lookup = {
        companies: companies.data as any,
        sales: sales.data as any,
      };
      const out = [
        await applyImport(
          dataProvider,
          fixtureCommitments,
          "eos_commitments",
          lookup,
        ),
        await applyImport(dataProvider, fixtureIssues, "eos_issues", lookup),
      ];
      setResults(out);
      notify(
        out.every((o) => o.reconciliation?.ok)
          ? "Import reconciled OK"
          : "Import finished — check reconciliation",
        { type: "info" },
      );
    } catch (e: any) {
      notify(e.message ?? "Import failed", { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-2">
      <EosNav />
      <h2 className="text-xl font-semibold">
        Import &amp; reconcile (fixture)
      </h2>
      <p className="text-sm text-muted-foreground max-w-prose">
        Lossless import of a synthetic Issues/Commitments fixture: every
        non-empty row and every column is kept (unknown columns as raw JSON),
        unresolved rows land in <b>Needs review</b>, then the database is
        re-read and reconciled by row count + SHA-256 checksums. Re-running the
        same snapshot is idempotent. Live Team sheet import is disabled until
        the Google Sheets connector is approved.
      </p>
      <div>
        <Button onClick={run} disabled={busy} data-testid="eos-run-import">
          {busy ? "Importing…" : "Run fixture import"}
        </Button>
      </div>
      {results.map((r) => (
        <div
          key={r.batchId}
          className="rounded border p-3 text-sm"
          data-testid="eos-recon"
        >
          <div className="font-medium">
            {r.report.tab_name} → {r.report.target}{" "}
            {r.skipped ? "(already imported, idempotent skip)" : ""}
          </div>
          <div>
            Row positions {r.report.row_positions} · non-empty{" "}
            {r.report.nonempty_rows} · records {r.report.canonical_records} ·
            needs review {r.report.needs_review_records} · columns{" "}
            {r.report.column_count} (unmapped:{" "}
            {r.report.unmapped_columns.join(", ") || "none"})
          </div>
          <div className="font-mono break-all">
            raw {r.report.raw_checksum.slice(0, 16)}… · semantic{" "}
            {r.report.semantic_checksum.slice(0, 16)}…
          </div>
          <div
            className={r.reconciliation?.ok ? "text-green-700" : "text-red-600"}
          >
            Reconciliation: {r.reconciliation?.ok ? "OK" : "MISMATCH"} — DB
            records {r.reconciliation?.db_records}, raw rows{" "}
            {r.reconciliation?.db_raw_rows}, checksum match{" "}
            {String(
              r.reconciliation?.semantic_checksum_db ===
                r.report.semantic_checksum,
            )}
          </div>
          <details>
            <summary className="cursor-pointer">Review reasons</summary>
            <ul className="list-disc pl-5">
              {r.report.review.map((x: any) => (
                <li key={x.row}>
                  Row {x.row}: {x.reasons.join("; ")}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ))}
    </div>
  );
};
EosImportPage.path = "/eos/import";
