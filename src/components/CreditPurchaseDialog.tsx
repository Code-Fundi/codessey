"use client";

import { useEffect, useMemo, useState } from "react";
import { Github, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CUSTOM_MIN_USD, PRESET_PACKS } from "@/lib/credits";
import type { CoinPackId } from "@/lib/database.types";
import { formatRefreshWait } from "@/lib/credit-status";
import { CUSTOM_CENTS_PER_COIN, WORLDLABS_API_KEYS_URL } from "@/lib/generation";
import { paystackBrowserClient } from "@/lib/paystack.client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  clearWorldLabsBrowserKey,
  getWorldLabsBrowserKey,
  setWorldLabsBrowserKey,
} from "@/lib/worldlabs-key";

export type CreditsDialogReason =
  | "purchase"
  | "expired"
  | "signin"
  | "guestbook"
  | "plaque"
  | "worldlabs";

interface CreditPurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signedIn: boolean;
  reason?: CreditsDialogReason;
  secondsUntilRefresh?: number;
  onPurchased?: () => void;
  nextPath?: string;
}

const ACCENT: Record<string, string> = {
  amber: "bg-amber-500/20 border-amber-400/40 hover:bg-amber-500/30",
  emerald: "bg-emerald-500/20 border-emerald-400/40 hover:bg-emerald-500/30",
  violet: "bg-violet-500/20 border-violet-400/40 hover:bg-violet-500/30",
};

export function CreditPurchaseDialog({
  open,
  onOpenChange,
  signedIn,
  reason = "purchase",
  secondsUntilRefresh = 0,
  onPurchased,
  nextPath,
}: CreditPurchaseDialogProps) {
  const [packId, setPackId] = useState<CoinPackId>("p10");
  const [customUsd, setCustomUsd] = useState("6");
  const [busy, setBusy] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const expired = reason === "expired" || reason === "guestbook" || reason === "plaque";

  useEffect(() => {
    if (!open) return;
    const stored = getWorldLabsBrowserKey();
    setHasKey(Boolean(stored));
    setKeyDraft(stored ?? "");
  }, [open]);

  const selectedCoins = useMemo(() => {
    if (packId === "custom") {
      const usd = Number(customUsd);
      if (!Number.isFinite(usd) || usd < CUSTOM_MIN_USD) return 0;
      return Math.floor((usd * 100) / CUSTOM_CENTS_PER_COIN);
    }
    return PRESET_PACKS.find((p) => p.id === packId)?.coins ?? 0;
  }, [packId, customUsd]);

  const signInWithGithub = async () => {
    const supabase = createSupabaseBrowserClient();
    const next =
      nextPath ||
      (typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) toast.error(error.message);
  };

  const saveKey = () => {
    const value = keyDraft.trim();
    if (!value) {
      clearWorldLabsBrowserKey();
      setHasKey(false);
      toast.success("World Labs key cleared from this browser.");
      return;
    }
    setWorldLabsBrowserKey(value);
    setHasKey(true);
    toast.success("World Labs key saved in this browser.");
  };

  const purchase = async () => {
    if (!signedIn) {
      toast.error("Sign in with GitHub to purchase coins.");
      return;
    }
    setBusy(true);
    try {
      const checkout = await paystackBrowserClient.initializeCheckout({
        packId,
        customUsd: packId === "custom" ? Number(customUsd) : undefined,
      });
      await paystackBrowserClient.openCheckout({
        publicKey: checkout.publicKey,
        email: checkout.email,
        amount: checkout.amount,
        reference: checkout.reference,
        currency: checkout.currency,
        metadata: {
          pack_id: checkout.packId,
          coins: checkout.coins,
        },
        onSuccess: async (reference) => {
          try {
            await paystackBrowserClient.verify(reference);
            toast.success(`Added ${checkout.coins} coins.`);
            onPurchased?.();
            onOpenChange(false);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Verify failed.");
          } finally {
            setBusy(false);
          }
        },
        onCancel: async () => {
          await paystackBrowserClient.failPayment(checkout.reference).catch(() => undefined);
          setBusy(false);
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout failed.");
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[min(90dvh,720px)] min-h-0 overflow-y-auto overscroll-contain bg-[#090C10]/95 backdrop-blur-xl border-white/10 text-foreground">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-extrabold gradient-text">
            Codessey coins
          </DialogTitle>
          <DialogDescription className="text-white/55">
            World generation requires your World Labs key in this browser. Codessey coins sign the
            guestbook and claim a founder&apos;s plaque (1 credit each). New GitHub accounts get 2
            credits.
            {secondsUntilRefresh > 0
              ? ` Next free credit in ${formatRefreshWait(secondsUntilRefresh)}.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {reason === "worldlabs" && (
          <div className="rounded-xl border border-blue-400/25 bg-blue-500/10 px-3 py-2.5 text-sm text-blue-100/90 leading-snug">
            Paste a World Labs API key below to generate. Codessey does not use a platform key.
          </div>
        )}

        {expired && (
          <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 overflow-hidden">
            <img
              src="/server-cooldown.png"
              alt=""
              className="w-full h-32 object-cover object-center"
            />
            <p className="px-3 py-2.5 text-sm text-amber-100/90 leading-snug">
              {reason === "guestbook"
                ? "Add coins to sign this guestbook, or generate freely with a World Labs key."
                : reason === "plaque"
                  ? "Add coins to claim the founder's plaque, or generate freely with a World Labs key."
                  : "Give our servers time to cool off but skip the queue with a World Labs key or coins."}
            </p>
          </div>
        )}

        {!signedIn ? (
          <Button
            type="button"
            onClick={() => void signInWithGithub()}
            className="w-full h-11 bg-white text-black hover:bg-white/90 font-semibold"
          >
            <Github size={16} className="mr-2" />
            Sign in with GitHub to create world
          </Button>
        ) : (
          <p className="text-[11px] text-white/40 text-center">Signed in with GitHub</p>
        )}

        <section className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <KeyRound size={14} />
            Add World Labs API key
          </div>
          <p className="text-[11px] text-white/50 leading-relaxed">
            Saved only in this browser, never on our servers.{" "}
            <a
              href={WORLDLABS_API_KEYS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
            >
              Get a key
            </a>
          </p>
          {hasKey && (
            <p className="text-[11px] text-blue-200/90">
              Your key is required to generate worlds and never leaves this browser.
            </p>
          )}
          <Input
            type="password"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="wlt_…"
            className="h-10 bg-black/30 border-white/10 text-white"
            autoComplete="off"
          />
          <Button
            type="button"
            onClick={saveKey}
            className="w-full h-10 bg-blue-700 hover:bg-blue-800 text-white font-semibold"
          >
            {keyDraft.trim() ? "Save key in this browser" : "Clear saved key"}
          </Button>
        </section>

        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/35">
          <span className="flex-1 h-px bg-white/10" />
          or buy Codessey coins
          <span className="flex-1 h-px bg-white/10" />
        </div>

        <div className={cn("space-y-3", !signedIn && "opacity-45 pointer-events-none")}>
          <div className="grid grid-cols-3 gap-2">
            {PRESET_PACKS.map((pack) => (
              <button
                key={pack.id}
                type="button"
                onClick={() => setPackId(pack.id)}
                disabled={!signedIn}
                className={cn(
                  "rounded-xl border px-2 py-3 text-left transition-all",
                  ACCENT[pack.accent],
                  packId === pack.id && "ring-2 ring-white/70 scale-[1.02]",
                )}
              >
                <CoinStack count={pack.coinStack} />
                <p className="mt-2 text-sm font-bold text-white">${pack.usd}</p>
                <p className="text-[11px] text-white/60">{pack.coins} coins</p>
              </button>
            ))}
          </div>

          <div
            className={cn(
              "rounded-xl border border-white/10 bg-white/[0.03] p-3",
              packId === "custom" && "ring-2 ring-white/40",
            )}
          >
            <label className="text-[10px] uppercase tracking-[0.16em] text-white/40">Custom</label>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-white/60 text-sm">$</span>
              <Input
                type="number"
                min={CUSTOM_MIN_USD}
                step={1}
                value={customUsd}
                disabled={!signedIn}
                onFocus={() => setPackId("custom")}
                onChange={(e) => {
                  setPackId("custom");
                  setCustomUsd(e.target.value);
                }}
                className="h-10 bg-black/30 border-white/10 text-white"
              />
              <span className="text-xs text-white/45 shrink-0">
                {Number.isFinite(Number(customUsd)) && Number(customUsd) >= CUSTOM_MIN_USD
                  ? `${Math.floor((Number(customUsd) * 100) / CUSTOM_CENTS_PER_COIN)} coins`
                  : `min $${CUSTOM_MIN_USD}`}
              </span>
            </div>
          </div>

          <Button
            type="button"
            onClick={() => void purchase()}
            disabled={!signedIn || busy || selectedCoins <= 0}
            className="w-full h-11 bg-blue-700 hover:bg-blue-800 text-white font-semibold disabled:opacity-40 disabled:saturate-50"
          >
            {busy ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" /> Opening Paystack…
              </>
            ) : (
              "Purchase more tokens"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CoinStack({ count }: { count: 1 | 2 | 3 }) {
  return (
    <div className="relative h-10 w-full">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="absolute left-1/2 h-7 w-7 -translate-x-1/2 rounded-full border-2 border-amber-200/80 bg-gradient-to-b from-yellow-300 to-amber-600 shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
          style={{ top: `${14 - i * 7}px`, zIndex: i + 1 }}
        />
      ))}
    </div>
  );
}
