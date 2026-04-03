import type { HumorFlavor } from "@/lib/flavor-types";
import type { FlavorAudit } from "@/lib/flavor-audit";

type FlavorListProps = {
  flavors: HumorFlavor[];
  selectedFlavorId: string;
  auditById: Map<string, FlavorAudit>;
  onSelectFlavor: (id: string) => void;
  onCreateFlavor: () => void;
};

export function FlavorList({
  flavors,
  selectedFlavorId,
  auditById,
  onSelectFlavor,
  onCreateFlavor,
}: FlavorListProps) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onCreateFlavor}
        className="w-full rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors duration-200 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        Create Humor Flavor
      </button>

      <ul className="space-y-2">
        {flavors.map((flavor) => {
          const isActive = flavor.id === selectedFlavorId;
          const audit = auditById.get(flavor.id);
          const status = audit?.status ?? (audit?.usable ? "working" : "unavailable");
          const statusClassName =
            status === "working"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-300"
              : status === "usable_with_warning"
                ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-300"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-300";

          return (
            <li key={flavor.id}>
              <button
                type="button"
                onClick={() => onSelectFlavor(flavor.id)}
                className={`relative block w-full overflow-hidden rounded-xl border px-4 py-3 text-left transition-colors duration-200 hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  isActive
                    ? "border-gray-900 bg-gray-100 dark:border-gray-500 dark:bg-gray-700"
                    : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
                }`}
              >
                <span
                  className={`absolute inset-y-2 left-0 w-1 rounded-r ${
                    isActive ? "bg-gray-900 dark:bg-gray-200" : "bg-transparent"
                  }`}
                />
                <p className="font-medium text-gray-900 transition-colors duration-200 dark:text-white">
                  {flavor.displayLabel}
                </p>
                <p className="mt-2">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${statusClassName}`}>
                    {status}
                  </span>
                </p>
                <p className="mt-1 text-sm text-gray-500 transition-colors duration-200 dark:text-gray-400">
                  {flavor.description || flavor.tone}
                </p>
                {!audit?.usable && audit?.reason ? (
                  <p className="mt-2 text-xs text-red-700 dark:text-red-300">{audit.reason}</p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
