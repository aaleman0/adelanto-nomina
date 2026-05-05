"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  type BackofficeContractAction,
  runBackofficeContractAction,
} from "@/lib/contracts/backoffice-actions";

export async function regenerateContractLinkAction(formData: FormData) {
  await runContractAction(formData, "regenerate_expired");
}

export async function retryContractFlowAction(formData: FormData) {
  await runContractAction(formData, "retry");
}

async function runContractAction(
  formData: FormData,
  action: BackofficeContractAction,
) {
  const contractRequestId = readFormValue(formData, "contract_request_id");
  const employeeId = readFormValue(formData, "employee_id");

  if (!contractRequestId || !employeeId) {
    redirect("/");
  }

  const result = await runBackofficeContractAction({
    contractRequestId,
    action,
  });
  const detailPath = `/contracts/${employeeId}`;

  revalidatePath("/");
  revalidatePath(detailPath);
  redirect(`${detailPath}?action_status=${result.status}`);
}

function readFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" && value.trim() ? value.trim() : null;
}
