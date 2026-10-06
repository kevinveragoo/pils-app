import "server-only";

import type { User } from "@prisma/client";
import { db } from "@/lib/db";

type InstrumentInstance = { instrument: string; instance?: number };

export async function recordRedcapActivity(input: {
  user: User;
  workflow: string;
  recordId: string;
  staffName?: string;
  serviceDate?: string;
  instrumentInstances: InstrumentInstance[];
  submittedData: unknown;
}) {
  try {
    await db.redcapActivity.create({
      data: {
        userId: input.user.id,
        actorName: input.user.name,
        actorUsername: input.user.username,
        workflow: input.workflow,
        recordId: input.recordId,
        staffName: input.staffName?.trim() || null,
        serviceDate: input.serviceDate?.trim() || null,
        instrumentInstances: JSON.stringify(input.instrumentInstances),
        submittedData: JSON.stringify(input.submittedData),
      },
    });
    return true;
  } catch (error) {
    // REDCap has already accepted the submission. Do not report a failed save
    // and risk the user submitting the same clinical entry a second time.
    console.error("Unable to record local REDCap activity:", error);
    return false;
  }
}
