import { RecordContextProvider, useListContext, useTranslate } from "ra-core";

import type { Company } from "../types";
import { CompanyCard } from "./CompanyCard";

const times = (nbChildren: number, fn: (key: number) => any) =>
  Array.from({ length: nbChildren }, (_, key) => fn(key));

const LoadingGridList = () => (
  <div className="flex flex-wrap w-[1008px] gap-1">
    {times(15, (key) => (
      <div
        className="h-[200px] w-[194px] flex flex-col bg-gray-200"
        key={key}
      />
    ))}
  </div>
);

const LoadedGridList = () => {
  const { data, error, isPending, selectedIds, onToggleItem } =
    useListContext<Company>();
  const selected = new Set(selectedIds ?? []);
  const translate = useTranslate();

  if (isPending || error) return null;

  return (
    <div
      className="w-full gap-2 grid"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
      }}
    >
      {data.map((record) => (
        <RecordContextProvider key={record.id} value={record}>
          <div className="relative">
            <CompanyCard />
            <input
              type="checkbox"
              aria-label={`Select ${record.name}`}
              data-testid="company-select"
              className={`absolute top-2 left-2 size-4 ${selected.size ? "" : "opacity-40 hover:opacity-100"}`}
              checked={selected.has(record.id)}
              onChange={() => onToggleItem(record.id)}
            />
          </div>
        </RecordContextProvider>
      ))}

      {data.length === 0 && (
        <div className="p-2">
          {translate("resources.companies.empty.title", {
            _: "No companies found",
          })}
        </div>
      )}
    </div>
  );
};

export const ImageList = () => {
  const { isPending } = useListContext();
  return isPending ? <LoadingGridList /> : <LoadedGridList />;
};
