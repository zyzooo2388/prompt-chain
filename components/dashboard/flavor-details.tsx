import { useEffect } from "react";

import { FlavorForm } from "@/components/dashboard/flavor-form";
import type { FlavorAudit } from "@/lib/flavor-audit";
import type { HumorFlavor, HumorFlavorDraft } from "@/lib/flavor-types";

type FlavorDetailsProps = {
  flavor: HumorFlavor | null;
  audit: FlavorAudit | null;
  mode: "idle" | "create" | "edit";
  draft: HumorFlavorDraft;
  actionError: string | null;
  isDuplicating: boolean;
  onCreateFlavor: () => void;
  onEditFlavor: () => void;
  onDuplicateFlavor: () => void | Promise<void>;
  onDeleteFlavor: () => void;
  onCancel: () => void;
  onSave: (value: HumorFlavorDraft) => void;
};

export function FlavorDetails({
  flavor,
  audit,
  mode,
  draft,
  actionError,
  isDuplicating,
  onCreateFlavor,
  onEditFlavor,
  onDuplicateFlavor,
  onDeleteFlavor,
  onCancel,
  onSave,
}: FlavorDetailsProps) {
  useEffect(() => {
    const numericFlavorId =
      flavor && Number.isInteger(flavor.sourceRow.id) && flavor.sourceRow.id > 0
        ? flavor.sourceRow.id
        : flavor
          ? Number(flavor.id)
          : null;

    console.info("[flavor-details] selected flavor id received", {
      selectedFlavorId: flavor?.id ?? null,
      selectedFlavorDbRowId: flavor?.sourceRow.id ?? null,
      selectedFlavorNumericId:
        typeof numericFlavorId === "number" && Number.isInteger(numericFlavorId) && numericFlavorId > 0
          ? numericFlavorId
          : null,
      rawSelectedFlavorRow: flavor?.sourceRow ?? null,
      selectedFlavor: flavor,
    });
  }, [flavor]);

  if (mode !== "idle") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {mode === "create" ? "New Flavor" : "Edit Flavor"}
            </p>
            <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {mode === "create" ? "Create Humor Flavor" : `Edit ${flavor?.name ?? "Flavor"}`}
            </p>
          </div>
        </div>

        <FlavorForm
          initialValue={draft}
          submitLabel={mode === "create" ? "Create Humor Flavor" : "Save Humor Flavor"}
          onSubmit={onSave}
          onCancel={onCancel}
        />
      </div>
    );
  }

  if (!flavor) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No humor flavor selected.
        </p>
        <button
          type="button"
          onClick={onCreateFlavor}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-50 transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Create Humor Flavor
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onEditFlavor}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-50 transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Edit Humor Flavor
        </button>
        <button
          type="button"
          onClick={() => void onDuplicateFlavor()}
          disabled={isDuplicating}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-500 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
        >
          {isDuplicating ? "Duplicating..." : "Duplicate Working Flavor"}
        </button>
        <button
          type="button"
          onClick={onDeleteFlavor}
          className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition hover:border-red-500 hover:text-red-900 dark:border-red-900 dark:text-red-300 dark:hover:border-red-700 dark:hover:text-red-100"
        >
          Delete Humor Flavor
        </button>
      </div>

      {actionError ? (
        <p className="text-sm text-red-700 dark:text-red-300">{actionError}</p>
      ) : null}

      {audit?.health ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Health: {audit.status}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Fatal issues: {audit.health.fatalIssueCount} | Warnings: {audit.health.warningCount}
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {audit.usable ? audit.health.statusReason : audit.reason ?? audit.health.statusReason}
          </p>
          {audit.usable && audit.health.warningCount > 0 ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              Advisory: {audit.health.issues.find((issue) => issue.severity === "warning")?.message ?? audit.health.statusReason}
            </p>
          ) : null}
          {!audit.usable && audit.health.blockingReasons.length > 0 ? (
            <p className="mt-2 text-xs text-red-700 dark:text-red-300">
              Blocking reason: {audit.health.blockingReasons[0]}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <p className="text-sm uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Flavor Name</p>
        <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">{flavor.name}</p>
      </div>

      <div>
        <p className="text-sm uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Tone</p>
        <p className="mt-1 text-zinc-700 dark:text-zinc-300">{flavor.tone}</p>
      </div>

      <div>
        <p className="text-sm uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Description</p>
        <p className="mt-1 text-zinc-700 dark:text-zinc-300">{flavor.description}</p>
      </div>
    </div>
  );
}
