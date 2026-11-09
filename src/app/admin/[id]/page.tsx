import { TenantAdminDetail } from "@/components/platform/TenantAdminDetail";

export default async function TenantAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TenantAdminDetail tenantId={id} />;
}
