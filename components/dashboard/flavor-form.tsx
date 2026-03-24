import { useEffect, useState } from "react";

import type { HumorFlavorDraft } from "@/lib/flavor-types";

type FlavorFormProps = {
  initialValue: HumorFlavorDraft;
  submitLabel: string;
  onSubmit: (value: HumorFlavorDraft) => void;
  onCancel: () => void;
};

export function FlavorForm({ initialValue, submitLabel, onSubmit, onCancel }: FlavorFormProps) {
  const [draft, setDraft] = useState(initialValue);

  useEffect(() => {
    setDraft(initialValue);
  }, [initialValue]);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(draft);
      }}
    >
      <label className="block">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Flavor Name</span>
        <input
          required
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Tone</span>
        <input
          required
          value={draft.tone}
          onChange={(event) => setDraft((current) => ({ ...current, tone: event.target.value }))}
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Description</span>
        <textarea
          required
          rows={4}
          value={draft.description}
          onChange={(event) =>
            setDraft((current) => ({ ...current, description: event.target.value }))
          }
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-50 transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
