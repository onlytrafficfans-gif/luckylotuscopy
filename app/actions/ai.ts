"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth-session";
import {
  completeAiOnboarding,
  getAiProfile,
  getAiUsageSummary,
  getOpenRouterCredit,
  listProviderStatuses,
  removeProviderCredential,
  saveProviderCredential,
  testProviderCredential,
  updateAiPreferences,
} from "@/lib/ai-account";
import { LOTUS_MODELS, type LotusProvider } from "@/lib/ai-platform";

const persistent = () => {
  if (!process.env.DATABASE_URL || process.env.NODE_ENV === "test")
    throw new Error("Persistent AI provider storage is not configured.");
};
const userId = async () => (await requireCurrentUser()).id;
const publicError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  return /Too many|Persistent AI/.test(message)
    ? message
    : "The AI provider could not be updated. Check the key and try again.";
};

export async function getAiSetupAction() {
  persistent();
  const id = await userId();
  const [profile, providers, usage, openRouterCredit] = await Promise.all([
    getAiProfile(id),
    listProviderStatuses(id),
    getAiUsageSummary(id),
    getOpenRouterCredit(id),
  ]);
  return { profile, providers, usage, openRouterCredit, models: LOTUS_MODELS };
}
export async function getAiPreferencesAction() { persistent();return getAiProfile(await userId()) }
export async function connectAiProviderAction(input: unknown) {
  try {
    persistent();
    const result = await saveProviderCredential(await userId(), input);
    revalidatePath("/");
    revalidatePath("/onboarding");
    return result;
  } catch (error) {
    return {
      ok: false as const,
      status: "error" as const,
      error: publicError(error),
    };
  }
}
export async function testAiProviderAction(provider: LotusProvider) {
  try {
    persistent();
    return await testProviderCredential(await userId(), provider);
  } catch (error) {
    return {
      ok: false as const,
      status: "error" as const,
      error: publicError(error),
    };
  }
}
export async function removeAiProviderAction(provider: LotusProvider) {
  persistent();
  await removeProviderCredential(await userId(), provider);
  revalidatePath("/");
  return { ok: true as const };
}
export async function completeAiOnboardingAction() {
  persistent();
  await completeAiOnboarding(await userId());
  revalidatePath("/");
  return { ok: true as const };
}
export async function updateAiPreferencesAction(input: unknown) {
  try {
    persistent();
    return {
      ok: true as const,
      profile: await updateAiPreferences(await userId(), input),
    };
  } catch {
    return { ok: false as const, error: "Choose valid AI preferences." };
  }
}
