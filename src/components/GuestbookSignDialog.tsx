"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SignaturePad } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  clearGuestbookDraft,
  readGuestbookDraft,
  writeGuestbookDraft,
} from "@/lib/guestbook-draft";
import { clampGuestbookMessage, GUESTBOOK_MESSAGE_MAX } from "@/lib/guestbook-text";
import { compressSignatureDataUrl } from "@/lib/signature-compress";

interface GuestbookSignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worldId: string;
  busy?: boolean;
  onSubmit: (input: { message: string; signature: string }) => Promise<boolean>;
}

export function GuestbookSignDialog({
  open,
  onOpenChange,
  worldId,
  busy = false,
  onSubmit,
}: GuestbookSignDialogProps) {
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !worldId) return;
    const draft = readGuestbookDraft(worldId);
    setMessage(draft?.message ?? "");
    setSignature(draft?.signatureDataUrl ?? "");
  }, [open, worldId]);

  const persist = (nextMessage: string, nextSignature: string) => {
    writeGuestbookDraft(worldId, {
      message: nextMessage,
      signatureDataUrl: nextSignature,
    });
  };

  const handleMessage = (value: string) => {
    const next = clampGuestbookMessage(value);
    setMessage(next);
    persist(next, signature);
  };

  const handleSignature = (value: string | null) => {
    const next = value ?? "";
    setSignature(next);
    persist(message, next);
  };

  const handleSubmit = async () => {
    const nextMessage = clampGuestbookMessage(message).trim();
    if (!nextMessage) {
      toast.error("Leave a short message.");
      return;
    }
    if (!signature) {
      toast.error("Sign the guestbook first.");
      return;
    }
    setSubmitting(true);
    try {
      const compressed = await compressSignatureDataUrl(signature);
      const saved = await onSubmit({ message: nextMessage, signature: compressed });
      if (!saved) return;
      clearGuestbookDraft(worldId);
      setMessage("");
      setSignature("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign the guestbook.");
    } finally {
      setSubmitting(false);
    }
  };

  const locked = busy || submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-white/10 bg-[#090C10]/95 text-foreground">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-extrabold">Sign Guestbook</DialogTitle>
          <DialogDescription className="text-white/55">
            Leave a short note and your signature. Signing costs 1 credit.
          </DialogDescription>
        </DialogHeader>
        <label className="block space-y-1.5">
          <span className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium">
            Message
          </span>
          <Textarea
            value={message}
            onChange={(event) => handleMessage(event.target.value)}
            maxLength={GUESTBOOK_MESSAGE_MAX}
            rows={3}
            disabled={locked}
            placeholder="Two sentences about this world…"
            className="bg-black/30 border-white/10 text-white"
          />
          <p className="text-[11px] text-white/40 text-right tabular-nums">
            {message.length}/{GUESTBOOK_MESSAGE_MAX}
          </p>
        </label>
        <div className="space-y-1.5">
          <span className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-medium">
            Signature
          </span>
          <SignaturePad
            key={`${worldId}:${open ? "open" : "closed"}`}
            defaultValue={signature || undefined}
            onChange={handleSignature}
            disabled={locked}
            className="aspect-video h-40 w-full rounded-lg border border-white/15"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            className="text-white/60 hover:text-white"
            disabled={locked}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-blue-700 hover:bg-blue-800 text-white"
            disabled={locked}
            onClick={() => void handleSubmit()}
          >
            {locked ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
            Submit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
