import { createHash } from "node:crypto";

export type LiabilityRecord = {
  customerId: string;
  amount: number | string;
  currency: string;
  snapshotId: string;
  salt?: string;
};

export type MerkleProofStep = {
  direction: "left" | "right";
  siblingHash: string;
};

export type CustomerInclusionProof = {
  customerId: string;
  leafHash: string;
  merkleProof: MerkleProofStep[];
  verified: boolean;
};

export type SolvencyAudit = {
  snapshotId: string;
  assets: string;
  totalLiabilities: string;
  coverageRatio: string;
  rootHash: string;
  leafHashes: string[];
  customerProofs: CustomerInclusionProof[];
  solvent: boolean;
  recordCount: number;
};

const DOMAIN_SEPARATOR = "reserveproof:v1";

function stableStringify(value: unknown): string {
  return JSON.stringify(sortObjectKeys(value), null, 0);
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortObjectKeys(nestedValue)]),
    );
  }

  return value;
}

export function normalizeAmount(value: number | string): bigint {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`Invalid non-negative integer amount: ${value}`);
    }
    if (value < 0) {
      throw new Error(`Negative amount values are not allowed: ${value}`);
    }
    return BigInt(Math.trunc(value));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("-")) {
      throw new Error(`Negative amount values are not allowed: ${value}`);
    }
    if (!/^[0-9]+$/.test(trimmed)) {
      throw new Error(`Invalid non-negative integer amount: ${value}`);
    }
    return BigInt(trimmed);
  }

  throw new Error(`Unsupported amount type: ${typeof value}`);
}

export function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashPair(left: string, right: string): string {
  return hashString(`${DOMAIN_SEPARATOR}|${left}|${right}`);
}

function hashRecord(record: LiabilityRecord): string {
  const canonical = stableStringify({
    customerId: record.customerId,
    amount: normalizeAmount(record.amount).toString(),
    currency: record.currency,
    snapshotId: record.snapshotId,
    salt: record.salt ?? "",
  });

  return hashString(`${DOMAIN_SEPARATOR}|leaf|${canonical}`);
}

export function validateLiabilityRecords(records: LiabilityRecord[]): LiabilityRecord[] {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("At least one liability record is required");
  }

  const seenIds = new Set<string>();

  return records.map((record, index) => {
    if (!record.customerId || !record.customerId.trim()) {
      throw new Error(`Record ${index} is missing a customerId`);
    }

    if (!record.currency || !record.currency.trim()) {
      throw new Error(`Record ${index} is missing a currency`);
    }

    if (!record.snapshotId || !record.snapshotId.trim()) {
      throw new Error(`Record ${index} is missing a snapshotId`);
    }

    const amount = normalizeAmount(record.amount);
    if (amount < BigInt(0)) {
      throw new Error(`Record ${index} has a negative amount`);
    }

    if (seenIds.has(record.customerId)) {
      throw new Error(`Duplicate customerId: ${record.customerId}`);
    }
    seenIds.add(record.customerId);

    return {
      ...record,
      amount: amount.toString(),
      currency: record.currency.trim().toUpperCase(),
      customerId: record.customerId.trim(),
      snapshotId: record.snapshotId.trim(),
    };
  });
}

export function buildMerkleRoot(leafHashes: string[]): string {
  if (leafHashes.length === 0) {
    throw new Error("Merkle tree cannot be built with zero leaves");
  }

  let level = [...leafHashes];
  while (level.length > 1) {
    const nextLevel: string[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1] ?? left;
      nextLevel.push(hashPair(left, right));
    }
    level = nextLevel;
  }

  return level[0];
}

export function generateMerkleProof(leafHashes: string[], index: number): MerkleProofStep[] {
  if (index < 0 || index >= leafHashes.length) {
    throw new Error(`Index ${index} is out of range for ${leafHashes.length} leaves`);
  }

  const proof: MerkleProofStep[] = [];
  let current = [...leafHashes];
  let currentIndex = index;

  while (current.length > 1) {
    const isRightNode = currentIndex % 2 === 1;
    const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;
    const siblingHash = current[siblingIndex] ?? current[currentIndex];

    proof.push({
      direction: isRightNode ? "left" : "right",
      siblingHash,
    });

    const nextLevel: string[] = [];
    for (let levelIndex = 0; levelIndex < current.length; levelIndex += 2) {
      const left = current[levelIndex];
      const right = current[levelIndex + 1] ?? current[levelIndex];
      nextLevel.push(hashPair(left, right));
    }

    current = nextLevel;
    currentIndex = Math.floor(currentIndex / 2);
  }

  return proof;
}

export function verifyMerkleProof(leafHash: string, proof: MerkleProofStep[], rootHash: string): boolean {
  let computed = leafHash;

  for (const step of proof) {
    computed = step.direction === "left" ? hashPair(step.siblingHash, computed) : hashPair(computed, step.siblingHash);
  }

  return computed === rootHash;
}

export function generateReserveProof(
  records: LiabilityRecord[],
  eligibleAssets: number | string,
  snapshotId?: string,
): SolvencyAudit {
  const safeRecords = validateLiabilityRecords(records).map((record) => ({
    ...record,
    snapshotId: snapshotId ?? record.snapshotId,
  }));

  const assets = normalizeAmount(eligibleAssets).toString();
  const normalizedRecords = safeRecords.map((record) => ({
    ...record,
    amount: normalizeAmount(record.amount).toString(),
  }));

  const sortedRecords = [...normalizedRecords].sort((left, right) => left.customerId.localeCompare(right.customerId));
  const leafHashes = sortedRecords.map((record) => hashRecord(record));
  const rootHash = buildMerkleRoot(leafHashes);

  const totalLiabilities = sortedRecords.reduce(
    (sum, record) => sum + normalizeAmount(record.amount),
    BigInt(0),
  );
  const coverageRatio = totalLiabilities === BigInt(0) ? "∞" : (Number(assets) / Number(totalLiabilities)).toFixed(4);
  const solvent = totalLiabilities <= normalizeAmount(assets);

  const customerProofs = sortedRecords.map((record, index) => {
    const leafHash = leafHashes[index];
    const merkleProof = generateMerkleProof(leafHashes, index);
    return {
      customerId: record.customerId,
      leafHash,
      merkleProof,
      verified: verifyMerkleProof(leafHash, merkleProof, rootHash),
    };
  });

  return {
    snapshotId: sortedRecords[0]?.snapshotId ?? snapshotId ?? "unknown",
    assets,
    totalLiabilities: totalLiabilities.toString(),
    coverageRatio,
    rootHash,
    leafHashes,
    customerProofs,
    solvent,
    recordCount: sortedRecords.length,
  };
}
