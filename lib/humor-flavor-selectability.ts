import type { HumorFlavorRow } from "@/lib/supabase/types";
import type { HumorFlavor } from "@/lib/flavor-types";

const BLOCKED_TOKEN_PATTERNS = [
  /\bdo\s*not\s*use\b/i,
  /\bplaceholder\b/i,
];

function hasBlockedToken(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return BLOCKED_TOKEN_PATTERNS.some((pattern) => pattern.test(value));
}

export function isSelectableFlavor(
  flavor: Pick<HumorFlavorRow, "slug" | "description"> & { name?: string | null },
): boolean {
  return !(
    hasBlockedToken(flavor.name) ||
    hasBlockedToken(flavor.slug) ||
    hasBlockedToken(flavor.description)
  );
}

export const PREFERRED_TESTING_FLAVOR_SLUGS = [
  "week8-check-deadpan",
  "jonathan-oversharer",
  "flowery-flows",
  "roast",
] as const;

export type FlavorTestSelectability = {
  selectable: boolean;
  reason: string | null;
};

export function getFlavorTestSelectability(
  flavor: Pick<HumorFlavor, "name" | "slug" | "description" | "steps">,
): FlavorTestSelectability {
  if (!isSelectableFlavor(flavor)) {
    return {
      selectable: false,
      reason: "This humor flavor is marked as do-not-use/placeholder.",
    };
  }

  if (flavor.steps.length === 0) {
    return {
      selectable: false,
      reason: "This humor flavor has no pipeline steps loaded.",
    };
  }

  return {
    selectable: true,
    reason: null,
  };
}

export function chooseDefaultTestingFlavorId(
  flavors: Pick<HumorFlavor, "id" | "name" | "slug" | "description" | "steps">[],
  initialFlavorId?: string | null,
): string {
  const selectabilityById = new Map(
    flavors.map((flavor) => [flavor.id, getFlavorTestSelectability(flavor)]),
  );
  const selectableFlavors = flavors.filter(
    (flavor) => selectabilityById.get(flavor.id)?.selectable,
  );

  const normalizedInitialId = initialFlavorId?.trim() ?? "";
  if (
    normalizedInitialId &&
    selectabilityById.get(normalizedInitialId)?.selectable
  ) {
    return normalizedInitialId;
  }

  for (const slug of PREFERRED_TESTING_FLAVOR_SLUGS) {
    const preferredFlavor = selectableFlavors.find(
      (flavor) => flavor.slug?.trim().toLowerCase() === slug,
    );
    if (preferredFlavor) {
      return preferredFlavor.id;
    }
  }

  return selectableFlavors[0]?.id ?? "";
}
