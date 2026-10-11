"use client";

import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Lock, ShieldCheck, ShieldAlert, Wallet } from "lucide-react";

const queryClient = new QueryClient();

const demoRecords = [
  { customerId: "CUST-1024", amount: 1200000, currency: "USD", snapshotId: "2026-10-11T00:00:00Z" },
  { customerId: "CUST-2048", amount: 850000, currency: "USD", snapshotId: "2026-10-11T00:00:00Z" },
  { customerId: "CUST-3072", amount: 670000, currency: "USD", snapshotId: "2026-10-11T00:00:00Z" },
  { customerId: "CUST-4096", amount: 940000, currency: "USD", snapshotId: "2026-10-11T00:00:00Z" },
];

async function fetchSolvencyProof(payload: Record<string, unknown>) {
  const response = await fetch("/api/solvency", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Unable to compute proof");
  }

  return data;
}

function ReserveProofBoard() {
  const [assets, setAssets] = useState(4000000);
  const [snapshotId, setSnapshotId] = useState("2026-10-11T00:00:00Z");

  const payload = useMemo(
    () => ({
      snapshotId,
      eligibleAssets: assets,
      records: demoRecords,
    }),
    [assets, snapshotId],
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["reserve-proof", payload],
    queryFn: () => fetchSolvencyProof(payload),
    enabled: false,
  });

  const handleVerify = async () => {
    await refetch();
  };

  const coverage = data?.proof?.coverageRatio ?? "1.0000";
  const solvent = data?.isSolvent ?? true;
  const customerProofMap = new Map(
    ((data?.proof?.customerProofs as Array<{ customerId: string; leafHash: string }> | undefined) ?? []).map(
      (proof) => [proof.customerId, proof.leafHash],
    ),
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-5 py-8 md:px-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-sky-950/30">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-sky-300">ReserveProof</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">
              Treasury solvency without exposing customer liabilities.
            </h1>
          </div>
          <div className="hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-200 md:flex md:items-center md:gap-2">
            <ShieldCheck className="h-4 w-4" />
            Snapshot verified
          </div>
        </div>
        <p className="max-w-4xl text-base leading-7 text-slate-300">
          The demo verifies that the treasury controls eligible assets sufficient to cover the committed customer liabilities while preserving privacy through a canonical Merkle commitment and customer inclusion proofs.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="card-surface rounded-2xl p-6">
          <div className="mb-5 flex items-center gap-3">
            <Wallet className="h-5 w-5 text-sky-400" />
            <h2 className="text-xl font-semibold text-white">Treasury snapshot</h2>
          </div>

          <div className="space-y-4">
            <label className="block text-sm text-slate-300">
              Snapshot id
              <input
                value={snapshotId}
                onChange={(event) => setSnapshotId(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-white focus:border-sky-500 focus:outline-none"
              />
            </label>

            <label className="block text-sm text-slate-300">
              Eligible assets (USD, integer units)
              <input
                type="number"
                min={0}
                value={assets}
                onChange={(event) => setAssets(Number(event.target.value))}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-white focus:border-sky-500 focus:outline-none"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={handleVerify}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 font-medium text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
          >
            {isLoading ? "Verifying..." : "Verify solvency"}
            <ArrowRight className="h-4 w-4" />
          </button>

          {error ? <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">{String(error)}</p> : null}
        </div>

        <div className="card-surface rounded-2xl p-6">
          <div className="mb-5 flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h2 className="text-xl font-semibold text-white">Proof summary</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Eligible assets</div>
              <div className="mt-2 text-2xl font-semibold text-white">{Number(data?.proof?.assets ?? assets).toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Total liabilities</div>
              <div className="mt-2 text-2xl font-semibold text-white">{Number(data?.proof?.totalLiabilities ?? 0).toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 sm:col-span-2">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Coverage ratio</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-300">{coverage}</div>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
            {solvent ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <ShieldAlert className="h-5 w-5 text-amber-400" />}
            {data ? (solvent ? "Solvent snapshot passes the aggregate constraint." : "Snapshot fails the aggregate constraint.") : "Awaiting verification."}
          </div>
        </div>
      </section>

      <section className="card-surface rounded-2xl p-6">
        <div className="mb-5 flex items-center gap-3">
          <Lock className="h-5 w-5 text-violet-400" />
          <h2 className="text-xl font-semibold text-white">Customer liability commitment</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm text-slate-200">
            <thead>
              <tr className="text-xs uppercase tracking-[0.2em] text-slate-400">
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Currency</th>
                <th className="px-3 py-2">Merkle leaf</th>
              </tr>
            </thead>
            <tbody>
              {demoRecords.map((record) => (
                <tr key={record.customerId} className="rounded-xl bg-slate-950/55">
                  <td className="rounded-l-xl px-3 py-3 font-medium text-white">{record.customerId}</td>
                  <td className="px-3 py-3">{Number(record.amount).toLocaleString()}</td>
                  <td className="px-3 py-3">{record.currency}</td>
                  <td className="rounded-r-xl px-3 py-3 font-mono text-xs text-sky-300">
                    {customerProofMap.get(record.customerId) ?? "pending"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card-surface rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white">Verification status</h3>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p>• Merkle root is built from canonical customer records.</p>
            <p>• Leaf hashes are domain-separated and deterministic.</p>
            <p>• Inclusion proofs are generated per customer and verified independently.</p>
            <p>• The aggregate sum is checked against eligible assets before the snapshot is marked solvent.</p>
          </div>
        </div>

        <div className="card-surface rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white">Threat model</h3>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p>• A compromised operator cannot silently change a customer record without breaking the root and its proofs.</p>
            <p>• A customer can validate inclusion without learning other customer liabilities.</p>
            <p>• The system does not claim proof of dataset completeness from Merkle membership alone.</p>
            <p>• Asset ownership and control are verified separately from the liability commitment.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <QueryClientProvider client={queryClient}>
      <ReserveProofBoard />
    </QueryClientProvider>
  );
}
