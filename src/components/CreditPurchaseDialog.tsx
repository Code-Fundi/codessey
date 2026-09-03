"use client";

import { useMemo, useState } from "react";
import { Github, Loader2 } from "lucide-react";
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
import { paystackBrowserClient } from "@/lib/paystack.client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type CreditsDialogReason = "purchase" | "expired";

interface CreditPurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signedIn: boolean;
  reason?: CreditsDialogReason;
  secondsUntilRefresh?: number;
  onPurchased?: () => void;
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
}: CreditPurchaseDialogProps) {
  const [packId, setPackId] = useState<CoinPackId>("p10");
  const [customUsd, setCustomUsd] = useState("15");
  const [busy, setBusy] = useState(false);
  const expired = reason === "expired";

  const selectedCoins = useMemo(() => {
    if (packId === "custom") {
      const usd = Number(customUsd);
      return Number.isFinite(usd) && usd >= CUSTOM_MIN_USD ? Math.floor(usd) : 0;
    }
    return PRESET_PACKS.find((p) => p.id === packId)?.coins ?? 0;
  }, [packId, customUsd]);

  const signInWithGithub = async () => {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) toast.error(error.message);
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
        accessCode: checkout.accessCode,
        reference: checkout.reference,
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
      <DialogContent className="max-w-lg bg-[#090C10]/95 backdrop-blur-xl border-white/10 text-foreground">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-extrabold gradient-text">
            Create more worlds
          </DialogTitle>
          <DialogDescription className="text-white/55">
            Get coins and generates more worlds.
            {secondsUntilRefresh > 0
              ? ` Next free credit in ${formatRefreshWait(secondsUntilRefresh)}.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {expired && (
          <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 overflow-hidden">
            <img
              src="/server-cooldown.png"
              alt=""
              className="w-full h-32 object-cover object-center"
            />
            <p className="px-3 py-2.5 text-sm text-amber-100/90 leading-snug">
              Give our servers time to cool off but skip the queue with credits.
            </p>
          </div>
        )}

        <Button
          type="button"
          onClick={() => void signInWithGithub()}
          disabled={signedIn}
          className="w-full h-11 bg-white text-black hover:bg-white/90 font-semibold"
        >
          <Github size={16} className="mr-2" />
          {signedIn ? "Signed in with GitHub" : "Sign in with GitHub"}
        </Button>

        <div className="grid grid-cols-3 gap-2">
          {PRESET_PACKS.map((pack) => (
            <button
              key={pack.id}
              type="button"
              onClick={() => setPackId(pack.id)}
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
              onFocus={() => setPackId("custom")}
              onChange={(e) => {
                setPackId("custom");
                setCustomUsd(e.target.value);
              }}
              className="h-10 bg-black/30 border-white/10 text-white"
            />
            <span className="text-xs text-white/45 shrink-0">
              {Number.isFinite(Number(customUsd)) && Number(customUsd) >= CUSTOM_MIN_USD
                ? `${Math.floor(Number(customUsd))} coins`
                : `min $${CUSTOM_MIN_USD}`}
            </span>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => void purchase()}
          disabled={!signedIn || busy || selectedCoins <= 0}
          className="w-full h-11 bg-green-700 hover:bg-green-800 text-white font-semibold disabled:opacity-40 disabled:saturate-50"
        >
          {busy ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" /> Opening Paystack…
            </>
          ) : (
            "Purchase more tokens"
          )}
        </Button>
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
