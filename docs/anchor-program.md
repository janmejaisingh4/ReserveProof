# Anchor program guide

Program crate: `programs/reserveproof`

## Instructions

### `initialize_treasury(treasury_id)`

Creates a treasury account at:

`PDA(["treasury", authority_pubkey, SHA256("reserveproof:id:v1" || treasury_id)])`

The authority must sign and pay rent. IDs are 1-64 ASCII characters and are restricted to letters, digits, `.`, `_`, `:`, and `-`.

### `record_snapshot(treasury_id, snapshot_id, denomination, eligible_assets, liabilities_total, merkle_root)`

Requires the registered treasury authority to sign and pay rent. It creates an immutable snapshot account at:

`PDA(["snapshot", treasury_pubkey, SHA256("reserveproof:id:v1" || snapshot_id)])`

The IDs are hashed into fixed 32-byte PDA seeds, so supported 1-64 byte IDs do not exceed Solana's per-seed length limit.

The `denomination` is a nonzero 32-byte identifier that states the unit used by both totals. The program computes `is_solvent = eligible_assets >= liabilities_total`. Insolvency is a valid recorded outcome, not an instruction error.

The fixed-width totals are `u64`; values must be pre-aggregated and represented in the same denomination. The program does not verify how either total or the Merkle root was produced.

## Scenario tests

Run:

```bash
NO_DNA=1 anchor build --no-idl
cargo test --workspace
```

Unit tests exercise accepted/rejected IDs, the 64-byte limit, deterministic ID-seed derivation, denomination validation, assets above/equal/below liabilities, zero totals, and `u64::MAX` boundaries. The `solana-program-test` lifecycle test loads the built SBF artifact and exercises successful treasury creation, duplicate treasury rejection, solvent and insolvent snapshots, duplicate snapshot rejection, invalid denomination and ID rejection, and an unauthorized signer.

## Build notes

With the toolchain currently installed in this workspace, SBF compilation succeeds using:

```bash
NO_DNA=1 anchor build --no-idl
```

IDL generation is blocked by the Anchor 0.30.1 `anchor-syn` / `proc_macro2` incompatibility documented in the root README. The `solana-program-test` suite runs against the Solana 1.18.26 test runtime used by Anchor 0.30.1. It is an in-process program test, not a test against a running local validator or a deployed cluster.
