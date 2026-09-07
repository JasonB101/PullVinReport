"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { normalizeVin, validateVin, VIN_LENGTH } from "@/lib/vin";

type Props = {
  initialVin?: string;
  /** Which background the form sits on. */
  variant?: "on-dark" | "on-light";
  autoFocus?: boolean;
  submitLabel?: string;
};

export function VinForm({
  initialVin = "",
  variant = "on-light",
  autoFocus = false,
  submitLabel = "Check this VIN",
}: Props) {
  const router = useRouter();
  const [vin, setVin] = useState(normalizeVin(initialVin));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onDark = variant === "on-dark";
  const remaining = VIN_LENGTH - vin.length;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateVin(vin);
    if (!result.valid) {
      setError(result.error ?? "That VIN doesn't look right.");
      return;
    }
    setError(null);
    setPending(true);
    router.push(`/preview?vin=${encodeURIComponent(result.vin)}`);
  }

  return (
    <form onSubmit={onSubmit} className="w-full" noValidate>
      <label
        htmlFor="vin"
        className={`block text-xs font-semibold uppercase tracking-widest ${
          onDark ? "text-brand-200" : "text-slate-500"
        }`}
      >
        Enter your 17-character VIN
      </label>

      <div
        className={`mt-2.5 flex flex-col gap-2.5 rounded-2xl p-2.5 sm:flex-row sm:items-center ${
          onDark
            ? "bg-white/10 ring-1 ring-inset ring-white/20 backdrop-blur"
            : "bg-white shadow-card ring-1 ring-slate-200"
        }`}
      >
        <input
          id="vin"
          name="vin"
          value={vin}
          onChange={(event) => {
            setVin(normalizeVin(event.target.value).slice(0, VIN_LENGTH));
            setError(null);
          }}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          maxLength={VIN_LENGTH}
          placeholder="1HGCM82633A004352"
          aria-invalid={Boolean(error)}
          aria-describedby="vin-help"
          className={`w-full flex-1 rounded-xl bg-transparent px-4 py-3.5 font-mono text-base tracking-[0.14em] outline-none sm:text-lg ${
            onDark
              ? "text-white placeholder:text-slate-500"
              : "text-slate-900 placeholder:text-slate-300"
          }`}
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? "Checking…" : submitLabel}
        </button>
      </div>

      <p
        id="vin-help"
        className={`mt-2.5 text-xs ${
          error
            ? onDark
              ? "font-medium text-red-300"
              : "font-medium text-red-600"
            : onDark
              ? "text-slate-400"
              : "text-slate-500"
        }`}
        role={error ? "alert" : undefined}
      >
        {error ??
          (vin.length === 0
            ? "Find it on the driver-side dashboard, the door jamb sticker, or your insurance card."
            : remaining > 0
              ? `${remaining} character${remaining === 1 ? "" : "s"} to go — no charge to check.`
              : "Looks good. You'll see a preview before paying.")}
      </p>
    </form>
  );
}
