"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Twitter, Linkedin, Github, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AboutModal } from "./AboutModal";
import { CreditPurchaseDialog, type CreditsDialogReason } from "./CreditPurchaseDialog";
import { GenerationJobChips } from "@/components/GenerationJobChips";
import { useWallet } from "@/hooks/useWallet";
import { useWorldGeneration } from "@/hooks/useWorldGeneration";

interface HeaderProps {
  creditsOpen: boolean;
  creditsReason: CreditsDialogReason;
  onCreditsOpenChange: (open: boolean, reason?: CreditsDialogReason) => void;
  onPurchased?: () => void;
}

export function Header({
  creditsOpen,
  creditsReason,
  onCreditsOpenChange,
  onPurchased,
}: HeaderProps) {
  const { user, balance, secondsUntilRefresh, refresh } = useWallet();
  const { jobs, dismissJob } = useWorldGeneration();
  const pathname = usePathname();

  return (
    <header className="fixed top-0 inset-x-0 h-14 z-40 flex items-center justify-between px-5 surface backdrop-blur-md">
      <div className="flex items-center gap-2 min-w-0 flex-1 pr-3">
        <Link
          href="/"
          className="font-display text-xl font-extrabold tracking-[0.18em] gradient-text"
        >
          CODESSEY
        </Link>
        <Link
          href="/rankings"
          className="text-[11px] uppercase tracking-[0.16em] text-white/50 hover:text-white px-2 py-1 rounded-md hover:bg-white/5"
        >
          Rankings
        </Link>
        <GenerationJobChips jobs={jobs} onDismiss={dismissJob} />
      </div>

      <div className="flex items-center gap-2">
        <AboutModal />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onCreditsOpenChange(true, "purchase")}
          className="text-amber-300 hover:text-amber-200 font-semibold gap-1.5"
          aria-label="Open coin purchase"
          data-tour="coins"
        >
          <Coins size={16} />
          <span className="tabular-nums">{balance ?? 0}</span>
        </Button>

        <div className="h-4 w-[1px] bg-white/10 mx-1" />

        <a
          href="https://x.com/whyweru"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
          aria-label="X (Twitter) Profile"
        >
          <Twitter size={15} />
        </a>

        <a
          href="https://www.linkedin.com/in/felix-waweru-07a314a5/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
          aria-label="LinkedIn Profile"
        >
          <Linkedin size={15} />
        </a>

        <a
          href="https://github.com/code-Fundi/codessey"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
          aria-label="GitHub Repository"
        >
          <Github size={15} />
        </a>
      </div>

      <CreditPurchaseDialog
        open={creditsOpen}
        onOpenChange={(open) => onCreditsOpenChange(open)}
        signedIn={Boolean(user)}
        reason={creditsReason}
        secondsUntilRefresh={secondsUntilRefresh}
        onPurchased={() => {
          void refresh();
          onPurchased?.();
        }}
        nextPath={pathname}
      />
    </header>
  );
}
