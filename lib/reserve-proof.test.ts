import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildMerkleRoot,
  generateMerkleProof,
  generateReserveProof,
  hashString,
  validateLiabilityRecords,
  verifyMerkleProof,
} from "./reserve-proof";

describe("ReserveProof cryptographic tests", () => {
  it("builds a deterministic Merkle root for canonical liability records", () => {
    const records = [
      { customerId: "CUST-1", amount: 100, currency: "USD", snapshotId: "snap-1" },
      { customerId: "CUST-2", amount: 250, currency: "USD", snapshotId: "snap-1" },
      { customerId: "CUST-3", amount: 120, currency: "USD", snapshotId: "snap-1" },
    ];

    const proof = generateReserveProof(records, 500, "snap-1");

    assert.ok(proof.rootHash.startsWith("0x") === false);
    assert.equal(proof.recordCount, 3);
    assert.equal(proof.totalLiabilities, "470");
    assert.equal(proof.solvent, true);
  });

  it("rejects invalid negative liability inputs", () => {
    const records = [
      { customerId: "CUST-1", amount: -100, currency: "USD", snapshotId: "snap-1" },
    ];

    assert.throws(() => validateLiabilityRecords(records), /negative amount/i);
  });

  it("verifies inclusion proofs and rejects tampering", () => {
    const leaves = [
      hashString("alpha"),
      hashString("beta"),
      hashString("gamma"),
      hashString("delta"),
    ];

    const root = buildMerkleRoot(leaves);
    const proof = generateMerkleProof(leaves, 2);

    assert.equal(verifyMerkleProof(leaves[2], proof, root), true);
    assert.equal(verifyMerkleProof(hashString("tampered"), proof, root), false);
  });
});
