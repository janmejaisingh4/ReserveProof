# ReserveProof

ReserveProof is a privacy-preserving treasury solvency verification MVP built for DAOs, exchanges, custodians, and stablecoin issuers. It demonstrates three core ideas:

- A treasury can prove the value of eligible assets at a snapshot.
- A liability ledger can be committed with a canonical Merkle root.
- A customer can verify inclusion without learning the entire dataset.

## Product objective

The application verifies the aggregate statement:

`sum(L_i) <= A`

where `A` is the value of eligible assets under treasury control and `L_i` is each customer liability in integer units.

## Architecture

- Frontend: Next.js App Router with Tailwind and a solvency dashboard.
- API: Node.js/TypeScript route handler that validates inputs and runs the proof engine.
- Proof engine: deterministic Merkle commitment and inclusion proof library in `lib/reserve-proof.ts`.
- Rust/Anchor program: `programs/reserveproof` for authority-controlled treasury registration and immutable snapshot records.
- Threat model and design notes: `docs/threat-model.md`.

## Getting started

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## API contract

`POST /api/solvency`

Request body:

```json
{
  "snapshotId": "2026-10-11T00:00:00Z",
  "eligibleAssets": 4000000,
  "records": [
    { "customerId": "CUST-1001", "amount": 1200000, "currency": "USD", "snapshotId": "2026-10-11T00:00:00Z" },
    { "customerId": "CUST-2002", "amount": 900000, "currency": "USD", "snapshotId": "2026-10-11T00:00:00Z" }
  ]
}
```

Response includes:

- `proof.rootHash`
- `proof.totalLiabilities`
- `proof.coverageRatio`
- `proof.customerProofs[]`
- `isSolvent`

## Security boundaries

This MVP intentionally separates:

1. Asset ownership and control evidence
2. Liability commitment authenticity
3. The aggregate solvency statement
4. Data completeness and reconciliations

A valid Merkle proof proves membership of a committed record. It does not prove that the full liability set is complete, and it does not establish legal ownership of reserves.

## Threat model

See `docs/threat-model.md` for the full operational, cryptographic, and governance assumptions.

## Anchor program

The Anchor program is under `programs/reserveproof`. An authority initializes a treasury PDA, then creates one immutable snapshot PDA per snapshot ID. The program derives the solvent flag from the submitted eligible-asset and liability totals; callers cannot choose that flag.

This is an authority-attested record, not a proof verifier: the program does not independently establish control of assets, completeness of liabilities, correctness of the off-chain sum, or validity of the Merkle root. Those trust boundaries are described in `docs/threat-model.md`.

See `docs/anchor-program.md` for instruction arguments, PDA seeds, scenario tests, and build notes.

Build the SBF program and run the Rust plus Solana program-test scenarios with:

```bash
NO_DNA=1 anchor build --no-idl
cargo test --workspace
```

The current local toolchain reports Anchor CLI 0.30.1 with Solana CLI 3.1.13, outside Anchor 0.30.1's documented Solana 1.18 compatibility range. `NO_DNA=1 anchor build --no-idl` compiles the SBF program successfully. Full IDL generation currently fails in Anchor 0.30.1's `anchor-syn` because its `proc_macro2::Span::source_file()` call is unavailable in the resolved dependency/toolchain combination. Use a mutually compatible Anchor, Solana, and Rust toolchain to generate the IDL or deploy.

## Validation

```bash
npm run build
npx tsx --test lib/**/*.test.ts
NO_DNA=1 anchor build --no-idl
cargo test --workspace
```
