import { notFound } from "next/navigation";

import { FlavorDashboard } from "@/components/dashboard/flavor-dashboard";
import { getDashboardFlavors } from "@/lib/dashboard-flavors";

type FlavorDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function FlavorDetailPage({ params }: FlavorDetailPageProps) {
  const { id } = await params;
  const { flavors: initialFlavors, source, referenceCatalog } = await getDashboardFlavors();
  const selectedFlavor = initialFlavors.find((flavor) => flavor.id === id);

  if (!selectedFlavor) {
    notFound();
  }

  return (
    <FlavorDashboard
      initialFlavors={initialFlavors}
      initialSelectedFlavorId={selectedFlavor.id}
      flavorSource={source}
      referenceCatalog={referenceCatalog}
    />
  );
}
