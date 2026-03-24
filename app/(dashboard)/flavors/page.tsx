import { FlavorDashboard } from "@/components/dashboard/flavor-dashboard";
import { getDashboardFlavors } from "@/lib/dashboard-flavors";
import { chooseDefaultTestingFlavorId } from "@/lib/humor-flavor-selectability";

export default async function FlavorsPage() {
  const { flavors: initialFlavors, source, referenceCatalog } = await getDashboardFlavors();
  const defaultFlavorId = chooseDefaultTestingFlavorId(initialFlavors);
  const selectedFlavor =
    initialFlavors.find((flavor) => flavor.id === defaultFlavorId) ??
    initialFlavors[0] ??
    null;

  return (
    <FlavorDashboard
      initialFlavors={initialFlavors}
      initialSelectedFlavorId={selectedFlavor?.id ?? null}
      flavorSource={source}
      referenceCatalog={referenceCatalog}
    />
  );
}
