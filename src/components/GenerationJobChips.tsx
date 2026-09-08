"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { GenerationJob } from "@/lib/generation-jobs";
import { githubPathForRepo } from "@/lib/repo-url";
import { cn } from "@/lib/utils";

interface GenerationJobChipsProps {
  jobs: GenerationJob[];
  onDismiss: (id: string) => void;
}

export function GenerationJobChips({ jobs, onDismiss }: GenerationJobChipsProps) {
  const router = useRouter();
  if (!jobs.length) return null;

  return (
    <div className="flex items-center gap-1.5 max-w-[min(28rem,42vw)] overflow-x-auto scrollbar-thin">
      {jobs.map((job) => {
        const path = githubPathForRepo(job.repoUrl);
        return (
          <div
            key={job.id}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-1 shrink-0",
              job.status === "failed"
                ? "border-red-400/30 bg-red-500/15"
                : job.status === "complete"
                  ? "border-emerald-400/35 bg-emerald-500/15"
                  : "border-emerald-400/25 bg-emerald-500/10",
            )}
          >
            <button
              type="button"
              onClick={() => {
                if (path) router.push(path);
              }}
              className="flex items-center gap-1.5 min-w-0"
              title={job.progress ?? job.repoName}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  job.status === "failed" ? "bg-red-400" : "bg-emerald-400",
                  job.status === "pending" && "animate-pulse",
                )}
              />
              <span className="text-[11px] text-white/85 truncate max-w-[8.5rem]">
                {job.repoName}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Dismiss ${job.repoName}`}
              onClick={() => onDismiss(job.id)}
              className="text-white/40 hover:text-white/80"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
