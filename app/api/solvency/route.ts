import { NextRequest } from "next/server";
import { z } from "zod";

import { generateReserveProof, validateLiabilityRecords } from "@/lib/reserve-proof";

const liabilitySchema = z.object({
  customerId: z.string().min(1),
  amount: z.union([z.number(), z.string()]),
  currency: z.string().min(3).max(10),
  snapshotId: z.string().min(1),
  salt: z.string().optional(),
});

const requestSchema = z.object({
  snapshotId: z.string().min(1),
  eligibleAssets: z.union([z.number(), z.string()]),
  records: z.array(liabilitySchema).min(1),
});

export async function GET() {
  return Response.json({
    service: "ReserveProof API",
    status: "online",
    supportedMethods: ["POST"],
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          error: "Invalid request payload",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { eligibleAssets, records, snapshotId } = parsed.data;
    const normalizedRecords = records.map((record) => ({
      ...record,
      snapshotId: record.snapshotId || snapshotId,
    }));

    validateLiabilityRecords(normalizedRecords);

    const proof = generateReserveProof(normalizedRecords, eligibleAssets, snapshotId);

    return Response.json({
      snapshotId,
      proof,
      isSolvent: proof.solvent,
      message: proof.solvent
        ? "Treasury satisfies the aggregate solvency constraint for the committed snapshot."
        : "Treasury fails the aggregate solvency constraint for the committed snapshot.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}
