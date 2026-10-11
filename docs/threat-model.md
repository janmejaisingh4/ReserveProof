# ReserveProof threat model

## Trust boundaries

The system has four critical trust boundaries that should remain conceptually separate:

1. Asset evidence: treasury ownership or control of eligible reserve assets.
2. Liability commitment: the canonical customer dataset committed with a Merkle root.
3. Solvency proof: the aggregate check `sum(L_i) <= A` over the committed dataset.
4. Completeness and reconciliation: the process that ensures the dataset is not silently incomplete.

## Primary adversaries

- Treasury operator: may try to cherry-pick or omit obligations.
- Customer: may attempt to forge a liability record or claim inclusion where none exists.
- External auditor: may try to manipulate valuations or snapshot timing.
- Network or RPC provider: may provide stale or inconsistent reserve state.

## Risk mitigations

### Canonical liability records

- Use integer units and reject floating-point values.
- Require a canonical ordering and deterministic serialization.
- Prevent duplicate customer identifiers.
- Include a snapshot identifier and domain-separated leaf hashing.

### Merkle commitments

- The root commits to the full set of customer liabilities in a fixed order.
- Each customer receives an inclusion proof that can be independently verified.
- Proof verification rejects malformed or tampered pairs.
- The root does not stand in for dataset completeness by itself.

### Aggregate solvency proof

- The demo verifies `totalLiabilities <= eligibleAssets` using integer arithmetic.
- Coverage ratio is reported as a derived metric, not as a guarantee of economic solvency.
- Proof generation is coupled to the snapshot id and the canonical liability set.

### Completeness mechanism

The MVP intentionally documents that completeness requires a separate control process such as:

- append-only registry or signed ledger
- customer-facing omission reporting
- auditor-controlled reconciliation windows
- attestation of source-of-record data integrity

This prevents a single operator from silently omitting liabilities under the same snapshot id.

## Assumptions and exclusions

This prototype does not claim that a valid Merkle inclusion proof guarantees:

- legal title to reserves
- complete dataset coverage
- correct valuation of assets
- absence of off-balance-sheet liabilities
- true economic solvency in all market conditions

Any production deployment should add independent reserve attestations, reconciliation, and governance controls.

## Anchor program behavior

The Anchor program provides a narrow on-chain attestation registry:

1. `initialize_treasury` creates a treasury PDA derived from the authority and the domain-separated hash of a validated 1-64 byte ASCII treasury ID.
2. `record_snapshot` requires the registered authority and creates a snapshot PDA derived from the treasury and the domain-separated hash of the snapshot ID. PDA initialization makes a snapshot ID immutable and non-repeatable for that treasury.
3. The program stores the denomination tag, submitted asset and liability totals, Merkle root, authority, and timestamp. It computes `is_solvent` as `eligible_assets >= liabilities_total`; the caller cannot set this result.

The authority remains trusted to provide accurate totals, a meaningful denomination tag, a genuine Merkle root, and an appropriate snapshot. Account constraints protect the treasury association and authority, but do not establish the provenance of those values. The program does not perform CPI calls to asset programs, verify Merkle/ZK proofs, or establish dataset completeness.

Rust unit tests cover valid and invalid identifiers, the identifier length boundary, deterministic PDA ID-seed derivation, denomination validation, both sides of the solvency comparison, equality, zero totals, and `u64` boundaries. An in-process Solana program-test suite also exercises the compiled SBF instructions for PDA creation, signer authorization, duplicate-account rejection, and snapshot outcomes. This does not replace testing against a running local validator or cluster.
