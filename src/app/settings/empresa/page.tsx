import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { CompanySettingsForm } from "@/components/settings/company-settings-form";

export default function CompanySettingsPage() {
  return (
    <AppShell>
      <PageHeader title="Datos de la empresa" />
      <CompanySettingsForm />
    </AppShell>
  );
}
