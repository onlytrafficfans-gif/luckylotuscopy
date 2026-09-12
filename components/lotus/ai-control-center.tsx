"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Activity,
  ChevronDown,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  connectAiProviderAction,
  getAiSetupAction,
  removeAiProviderAction,
  testAiProviderAction,
  updateAiPreferencesAction,
} from "@/app/actions/ai";
import type {
  CostPreference,
  LotusMode,
  LotusProvider,
} from "@/lib/ai-platform";

type Setup = Awaited<ReturnType<typeof getAiSetupAction>>;
const format = (value: number) =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(2)}M`
    : value >= 1_000
      ? `${Math.round(value / 1_000)}K`
      : value.toLocaleString();

export function AiCapacityWidget() {
  const [setup, setSetup] = useState<Setup | null>(null);
  useEffect(() => {
    getAiSetupAction()
      .then(setSetup)
      .catch(() => {});
  }, []);
  if (!setup) return null;
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-[#eadfd8] bg-white px-3 py-2 text-xs font-semibold dark:border-white/10 dark:bg-white/5">
        <Activity size={15} className="text-[#dc7e59]" />{" "}
        {format(setup.usage.month)} tokens this month
        <ChevronDown size={13} />
      </summary>
      <div className="absolute right-0 top-12 z-50 w-[min(340px,calc(100vw-2rem))] rounded-2xl border border-[#eadfd8] bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#211b18]">
        <h2 className="font-semibold">AI Usage</h2>
        <p className="mt-1 text-xs text-[#806b60]">
          Actual usage recorded through Lotus
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ["Today", setup.usage.today],
            ["This week", setup.usage.week],
            ["This month", setup.usage.month],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-xl bg-[#fff5ee] p-2 dark:bg-white/5"
            >
              <strong className="block text-sm">{format(Number(value))}</strong>
              <span className="text-[10px] text-[#806b60]">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {setup.usage.byModels.length ? (
            setup.usage.byModels.map((item) => (
              <div
                key={item.modelAlias}
                className="flex justify-between text-xs"
              >
                <span>
                  {setup.models.find((model) => model.alias === item.modelAlias)
                    ?.displayName ?? item.modelAlias}
                </span>
                <strong>{format(item.tokens)}</strong>
              </div>
            ))
          ) : (
            <p className="text-xs text-[#806b60]">
              No AI requests recorded yet.
            </p>
          )}
        </div>
        <p className="mt-4 border-t border-[#eadfd8] pt-3 text-xs dark:border-white/10">
          Estimated spend:{" "}
          <strong>
            {setup.usage.estimatedSpend === null
              ? "Not supplied by providers"
              : `$${setup.usage.estimatedSpend.toFixed(4)}`}
          </strong>
        </p>
      </div>
    </details>
  );
}

export function AiControlCenter() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [keys, setKeys] = useState<Record<LotusProvider, string>>({
    anthropic: "",
    openrouter: "",
  });
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const refresh = () => getAiSetupAction().then(setSetup);
  useEffect(() => {
    refresh().catch(() => setMessage("AI settings could not be loaded."));
  }, []);
  const run = (job: () => Promise<void>) =>
    startTransition(async () => {
      setMessage("");
      try {
        await job();
      } catch {
        setMessage("The request could not be completed.");
      }
    });
  if (!setup)
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-[#806b60]">
        <LoaderCircle className="animate-spin" size={16} />
        Loading secure AI settings…
      </div>
    );
  const connected = setup.providers.filter((item) => item.connected).length;
  return (
    <div>
      <div className="flex items-start gap-3 rounded-xl bg-[#fff7f1] p-4 text-sm dark:bg-white/5">
        <ShieldCheck className="mt-0.5 shrink-0 text-[#b87850]" size={18} />
        <p className="leading-6 text-[#6d584d] dark:text-[#c8b8ae]">
          Keys are verified with each provider, encrypted in the database, and
          never returned to this browser. All AI requests execute through the
          Lotus server.
        </p>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {(["anthropic", "openrouter"] as const).map((provider) => {
          const status = setup.providers.find((x) => x.provider === provider)!;
          return (
            <section
              key={provider}
              className="rounded-2xl border border-[#eadfd8] p-4 dark:border-white/10"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold capitalize">{provider}</h3>
                  <p className="mt-1 text-xs text-[#806b60]">
                    {provider === "anthropic"
                      ? "Advanced building, debugging, and reasoning."
                      : "Fast, economical, fallback, and free models."}
                  </p>
                </div>
                <span
                  className={`text-xs font-semibold ${status.connected ? "text-emerald-700" : "text-[#806b60]"}`}
                >
                  {status.connected ? "Connected ✓" : "Not connected"}
                </span>
              </div>
              {status.keyHint && (
                <p className="mt-3 font-mono text-xs">{status.keyHint}</p>
              )}
              <p className="mt-2 text-xs text-[#806b60]">
                Used this month: <strong>{format(setup.usage.byProviders.find((item) => item.provider === provider)?.tokens ?? 0)} tokens</strong>
              </p>
              {status.connected && <p className="mt-1 text-xs text-[#806b60]">Provider health: <strong className={status.health === "degraded" ? "text-amber-700" : "text-emerald-700"}>{status.health === "healthy" ? "Healthy" : status.health === "degraded" ? "Needs attention" : "Awaiting first check"}</strong></p>}
              {provider === "openrouter" && setup.openRouterCredit !== null && (
                <div className="mt-2 text-xs text-[#806b60]">
                  <p>Real credit remaining: <strong>${setup.openRouterCredit.toFixed(2)}</strong></p>
                  <p>Estimated Economy capacity: <strong>~{format(Math.floor(setup.openRouterCredit / 0.16 * 1_000_000))} tokens</strong></p>
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#eadfd8] px-3 dark:border-white/10">
                  <KeyRound size={14} />
                  <input
                    aria-label={`${provider} API key`}
                    type="password"
                    value={keys[provider]}
                    onChange={(e) =>
                      setKeys((s) => ({ ...s, [provider]: e.target.value }))
                    }
                    placeholder={
                      status.connected
                        ? "Paste a replacement key"
                        : "Paste API key"
                    }
                    autoComplete="off"
                    spellCheck={false}
                    className="h-10 min-w-0 flex-1 bg-transparent text-xs outline-none"
                  />
                </div>
                <button
                  disabled={pending || keys[provider].length < 16}
                  onClick={() =>
                    run(async () => {
                      const result = await connectAiProviderAction({
                        provider,
                        apiKey: keys[provider],
                      });
                      if (!result.ok) {
                        setMessage(result.error);
                        return;
                      }
                      setKeys((s) => ({ ...s, [provider]: "" }));
                      setMessage(`${provider} connected and verified.`);
                      await refresh();
                    })
                  }
                  className="rounded-xl bg-[#e98b66] px-3 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {status.connected ? "Replace Key" : "Connect"}
                </button>
              </div>
              {status.connected && (
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        const result = await testAiProviderAction(provider);
                        setMessage(
                          result.ok
                            ? `${provider} connection verified.`
                            : result.error,
                        );
                        await refresh();
                      })
                    }
                    className="rounded-lg border border-[#eadfd8] px-3 py-2 text-xs dark:border-white/10"
                  >
                    Test Connection
                  </button>
                  <button
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        await removeAiProviderAction(provider);
                        setMessage(`${provider} removed.`);
                        await refresh();
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600"
                  >
                    <Trash2 size={12} />
                    Remove Key
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-[#806b60]">
        {connected === 2
          ? "Full Lotus AI stack activated."
          : connected === 0
            ? "Connect both providers for the full Lotus experience."
            : setup.providers.find((x) => x.provider === "anthropic")?.connected
              ? "Fast, economical, and free fallback models unavailable."
              : "Advanced Build intelligence unavailable."}
      </p>
      <section className="mt-6 rounded-2xl border border-[#eadfd8] p-5 dark:border-white/10">
        <h3 className="font-semibold">AI Preferences</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="grid gap-1.5 text-sm font-medium">
            Default mode
            <select
              value={setup.profile.defaultMode}
              onChange={(e) =>
                setSetup({
                  ...setup,
                  profile: {
                    ...setup.profile,
                    defaultMode: e.target.value as LotusMode,
                  },
                })
              }
              className="input"
            >
              <option value="auto">Auto</option>
              <option value="build">Build</option>
              <option value="fast">Fast</option>
              <option value="economy">Economy</option>
              <option value="free">Free</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Cost preference
            <select
              value={setup.profile.costPreference}
              onChange={(e) =>
                setSetup({
                  ...setup,
                  profile: {
                    ...setup.profile,
                    costPreference: e.target.value as CostPreference,
                  },
                })
              }
              className="input"
            >
              <option value="quality_first">Quality First</option>
              <option value="balanced">Balanced</option>
              <option value="save_tokens">Save Tokens</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Maximum escalation
            <select
              value={setup.profile.maxEscalationLevel}
              onChange={(e) =>
                setSetup({
                  ...setup,
                  profile: {
                    ...setup.profile,
                    maxEscalationLevel: Number(e.target.value),
                  },
                })
              }
              className="input"
            >
              {[1, 2, 3, 4, 5].map((x) => (
                <option key={x} value={x}>
                  Level {x}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          disabled={pending}
          onClick={() =>
            run(async () => {
              const result = await updateAiPreferencesAction(setup.profile);
              setMessage(result.ok ? "AI preferences saved." : result.error);
              if (result.ok) await refresh();
            })
          }
          className="mt-4 rounded-xl bg-[#e98b66] px-4 py-2 text-sm font-semibold text-white"
        >
          Save preferences
        </button>
        <p className="mt-3 text-xs text-[#806b60]">
          Save Tokens never overrides critical authentication, migration,
          security, or destructive-operation safeguards.
        </p>
      </section>
      <details className="mt-6 rounded-2xl border border-[#eadfd8] p-5 dark:border-white/10">
        <summary className="cursor-pointer font-semibold">
          Advanced Model Settings
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead>
              <tr className="text-[#806b60]">
                <th className="pb-2">Lotus tier</th>
                <th>Model</th>
                <th>Provider</th>
                <th>Context</th>
                <th>Capabilities</th>
              </tr>
            </thead>
            <tbody>
              {setup.models.map((model) => (
                <tr
                  key={model.alias}
                  className="border-t border-[#eee2da] dark:border-white/10"
                >
                  <td className="py-3 font-mono">{model.alias}</td>
                  <td>
                    <strong>{model.displayName}</strong>
                    <br />
                    <span className="text-[#806b60]">{model.id}</span>
                  </td>
                  <td className="capitalize">{model.provider}</td>
                  <td>{format(model.contextWindow)}</td>
                  <td>
                    {[
                      model.supportsTools && "Tools",
                      model.supportsVision && "Vision",
                      model.supportsReasoning && "Reasoning",
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {message && (
        <p role="status" className="mt-4 text-sm font-medium text-[#a95f3f]">
          {message}
        </p>
      )}
    </div>
  );
}
