"use server";

import { mergeClusters, rescueCluster, setTriage } from "@jobhunt/core/applications";
import { promoteClusterCompany } from "@jobhunt/core/companies";
import { TRIAGE_STATUSES } from "@jobhunt/core/domain";
import { scoreCluster } from "@jobhunt/core/scoring";
import { z } from "zod";
import { idSchema, runAction } from "@/lib/action";

export async function setTriageAction(clusterId: string, triage: string) {
  return runAction(async () => {
    await setTriage(idSchema.parse(clusterId), z.enum(TRIAGE_STATUSES).parse(triage));
  });
}

export async function rescoreAction(clusterId: string) {
  return runAction(() => scoreCluster(idSchema.parse(clusterId), { force: true }));
}

export async function rescueAction(clusterId: string) {
  return runAction(async () => {
    const id = idSchema.parse(clusterId);
    await rescueCluster(id);
    return scoreCluster(id, { force: true }).catch(() => "failed" as const);
  });
}

export async function mergeAction(sourceClusterId: string, targetClusterId: string) {
  return runAction(() => mergeClusters(idSchema.parse(sourceClusterId), idSchema.parse(targetClusterId)));
}

export async function promoteCompanyAction(clusterId: string) {
  return runAction(async () => {
    const company = await promoteClusterCompany(idSchema.parse(clusterId));
    return { companyId: company?.id ?? null };
  });
}
