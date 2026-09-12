/* eslint-disable react/no-unescaped-entities */
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  completeAiOnboardingAction,
  connectAiProviderAction,
} from "@/app/actions/ai";
import type { LotusProvider } from "@/lib/ai-platform";

type State = "idle" | "checking" | "connected" | "invalid" | "error";
const COPY = {
  anthropic: {
    name: "Anthropic",
    description:
      "Recommended for Lotus's most advanced building, coding, debugging, reasoning, and autonomous development workflows.",
    placeholder: "sk-ant-••••••••••••••••",
  },
  openrouter: {
    name: "OpenRouter",
    description: "Unlocks fast, economical, fallback, and free AI models.",
    placeholder: "sk-or-••••••••••••••••",
  },
} as const;

export function AiOnboarding() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [keys, setKeys] = useState<Record<LotusProvider, string>>({
    anthropic: "",
    openrouter: "",
  });
  const [states, setStates] = useState<Record<LotusProvider, State>>({
    anthropic: "idle",
    openrouter: "idle",
  });
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const connect = (provider: LotusProvider) =>
    startTransition(async () => {
      setStates((s) => ({ ...s, [provider]: "checking" }));
      const result = await connectAiProviderAction({
        provider,
        apiKey: keys[provider],
      });
      if (result.ok) {
        setStates((s) => ({ ...s, [provider]: "connected" }));
        setKeys((s) => ({ ...s, [provider]: "" }));
      } else {
        setStates((s) => ({
          ...s,
          [provider]: result.status === "invalid" ? "invalid" : "error",
        }));
        setMessage(result.error);
      }
    });
  const launch = () =>
    startTransition(async () => {
      for (const provider of ["anthropic", "openrouter"] as const)
        if (keys[provider] && states[provider] !== "connected") {
          const result = await connectAiProviderAction({
            provider,
            apiKey: keys[provider],
          });
          if (!result.ok) {
            setStates((s) => ({
              ...s,
              [provider]: result.status === "invalid" ? "invalid" : "error",
            }));
            setMessage(result.error);
            return;
          }
        }
      await completeAiOnboardingAction();
      router.replace("/");
      router.refresh();
    });
  const connected = Object.values(states).filter(
    (x) => x === "connected",
  ).length;
  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-[#100b08] px-4 py-16 text-white">
      <Image
        src="/lucky-lotus-login-bg.png"
        alt=""
        fill
        priority
        className="object-cover opacity-45"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(10,6,4,.5)_70%)]" />
      <section className="relative z-10 w-full max-w-2xl rounded-[2rem] border border-white/25 bg-black/30 p-6 shadow-2xl backdrop-blur-xl sm:p-10">
        <div className="text-center">
          <Image
            src="/lucky-lotus-logo.png"
            alt="Lucky Lotus"
            width={104}
            height={104}
            className="mx-auto h-24 w-24 object-contain"
          />
          {step === 1 ? (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[.28em] text-[#ffc999]">
                Activate your workspace
              </p>
              <h1 className="mt-3 text-4xl font-semibold">Welcome to Lotus</h1>
              <p className="mx-auto mt-4 max-w-lg leading-7 text-white/75">
                Connect your AI engines for the best building experience. Lotus
                uses your own AI provider accounts so you stay in control of
                your usage, models, and billing.
              </p>
              <div className="mx-auto mt-7 flex max-w-md items-start gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 text-left text-sm text-white/80">
                <ShieldCheck className="shrink-0 text-[#ffc999]" />
                <span>
                  Your keys are encrypted in Lotus and all AI calls stay on the
                  secure server.
                </span>
              </div>
              <button
                onClick={() => setStep(2)}
                className="mt-8 rounded-xl bg-[#e98b66] px-8 py-3 font-semibold shadow-lg"
              >
                Continue
              </button>
            </>
          ) : (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[.28em] text-[#ffc999]">
                AI engines
              </p>
              <h1 className="mt-3 text-3xl font-semibold">
                Connect your providers
              </h1>
              <p className="mt-3 text-white/70">
                For the best Lotus experience, connect both.
              </p>
            </>
          )}
        </div>
        {step === 2 && (
          <>
            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              {(["anthropic", "openrouter"] as const).map((provider) => {
                const item = COPY[provider],
                  state = states[provider];
                return (
                  <article
                    key={provider}
                    className="rounded-2xl border border-white/15 bg-white/10 p-5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-semibold">{item.name}</h2>
                      <span
                        className={`text-xs ${state === "connected" ? "text-emerald-300" : state === "invalid" || state === "error" ? "text-red-300" : "text-white/55"}`}
                      >
                        {state === "checking"
                          ? "Checking…"
                          : state === "connected"
                            ? "Connected"
                            : state === "invalid"
                              ? "Invalid key"
                              : state === "error"
                                ? "Connection error"
                                : "Not connected"}
                      </span>
                    </div>
                    <p className="mt-2 min-h-16 text-xs leading-5 text-white/65">
                      {item.description}
                    </p>
                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/20 bg-black/20 px-3">
                      <KeyRound size={15} />
                      <input
                        type="password"
                        aria-label={`${item.name} API key`}
                        value={keys[provider]}
                        onChange={(e) =>
                          setKeys((s) => ({ ...s, [provider]: e.target.value }))
                        }
                        placeholder={item.placeholder}
                        autoComplete="off"
                        spellCheck={false}
                        className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
                      />
                    </div>
                    <button
                      onClick={() => connect(provider)}
                      disabled={pending || keys[provider].length < 16}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 py-2.5 text-sm font-semibold disabled:opacity-40"
                    >
                      {state === "checking" ? (
                        <LoaderCircle className="animate-spin" size={15} />
                      ) : state === "connected" ? (
                        <CheckCircle2 size={15} />
                      ) : (
                        <Sparkles size={15} />
                      )}{" "}
                      Test Connection
                    </button>
                  </article>
                );
              })}
            </div>
            <p className="mt-5 text-center text-sm text-white/70">
              {connected === 2
                ? "Full Lotus AI stack activated."
                : states.anthropic !== "connected"
                  ? "Advanced Build intelligence unavailable."
                  : "Fast, economical, and free fallback models unavailable."}
            </p>
            {message && (
              <p role="alert" className="mt-3 text-center text-sm text-red-300">
                {message}
              </p>
            )}
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <button
                onClick={launch}
                disabled={pending}
                className="rounded-xl bg-[#e98b66] px-6 py-3 font-semibold disabled:opacity-50"
              >
                {pending ? "Activating…" : "Connect & Launch Lotus"}
              </button>
              <button
                onClick={async () => {
                  await completeAiOnboardingAction();
                  router.replace("/");
                  router.refresh();
                }}
                disabled={pending}
                className="rounded-xl px-5 py-3 text-sm text-white/70 hover:bg-white/10"
              >
                I'll do this later
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
