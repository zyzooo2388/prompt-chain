import { getFlavorHealth, type FlavorHealth } from "@/lib/flavor-health";
import { getFlavorTestSelectability, type FlavorTestSelectability } from "@/lib/humor-flavor-selectability";
import type { FlavorValidationReferenceCatalog, HumorFlavor } from "@/lib/flavor-types";

export type FlavorAudit = {
  health: FlavorHealth | null;
  selectability: FlavorTestSelectability;
  usable: boolean;
  status: FlavorHealth["status"] | "placeholder_do_not_use" | "unavailable";
  reason: string | null;
};

function buildUnavailableReason(
  health: FlavorHealth | null,
  selectability: FlavorTestSelectability,
): string | null {
  if (selectability.reason) {
    return selectability.reason;
  }

  if (!health) {
    return "Flavor validation data could not be computed.";
  }

  if (health.testable) {
    return null;
  }

  if (health.blockingReasons.length > 0) {
    return health.blockingReasons[0] ?? health.statusReason;
  }

  const firstDiagnostic = health.diagnostics[0] ?? null;
  if (firstDiagnostic) {
    return firstDiagnostic;
  }

  if (health.failureReasons.length > 0) {
    return `Validation failed: ${health.failureReasons.join(", ")}.`;
  }

  return health.statusReason;
}

export function getFlavorAudit(
  flavor: HumorFlavor,
  flavors: HumorFlavor[],
  referenceCatalog: FlavorValidationReferenceCatalog,
): FlavorAudit {
  const health = getFlavorHealth(flavor.id, flavors, referenceCatalog);
  const selectability = getFlavorTestSelectability(flavor);
  const usable = Boolean(selectability.selectable && health?.testable);
  const status = !selectability.selectable
    ? "placeholder_do_not_use"
    : health?.status ?? "unavailable";

  return {
    health,
    selectability,
    usable,
    status,
    reason: usable ? null : buildUnavailableReason(health, selectability),
  };
}

export function getFlavorAuditById(
  flavors: HumorFlavor[],
  referenceCatalog: FlavorValidationReferenceCatalog,
): Map<string, FlavorAudit> {
  return new Map(
    flavors.map((flavor) => [
      flavor.id,
      getFlavorAudit(flavor, flavors, referenceCatalog),
    ]),
  );
}
