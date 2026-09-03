import { Github, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Repository } from "@/lib/codefundi.client";

interface RepositoryCardProps {
  repo: Repository;
  selected: boolean;
  cached: boolean;
  index: number;
  onSelect: (repo: Repository) => void;
}

const getCodefundiRepoUrl = (link?: string) => {
  if (!link) return "#";
  try {
    let cleanLink = link.trim();
    if (cleanLink.startsWith("git@github.com:")) {
      cleanLink = cleanLink.replace("git@github.com:", "https://github.com/");
    }
    if (!cleanLink.includes("://") && cleanLink.split("/").length === 2) {
      cleanLink = `https://github.com/${cleanLink}`;
    }
    const url = new URL(cleanLink);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2) {
      const username = pathParts[0];
      const repoName = pathParts[1].replace(/\.git$/, "");
      return `https://codefundi.app/repo/${username}/${repoName}`;
    }
  } catch (e) {
    const parts = link.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const username = parts[parts.length - 2];
      const repoName = parts[parts.length - 1].replace(/\.git$/, "");
      return `https://codefundi.app/repos/${username}/${repoName}`;
    }
  }
  return `https://codefundi.app/repos/${link}`;
};

export function RepositoryCard({ repo, selected, cached, index, onSelect }: RepositoryCardProps) {
  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a")) {
      return;
    }
    onSelect(repo);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(repo);
        }
      }}
      aria-label={`Select ${repo.name}`}
      aria-pressed={selected}
      style={{ animationDelay: `${index * 40}ms` }}
      className={cn(
        "group relative w-full text-left rounded-xl p-3 cursor-pointer transition-all fade-up",
        "surface surface-hover",
        selected
          ? "border-2 border-green-600/80 border-l-[5px] border-l-green-500 bg-green-600 ring-1 ring-green-500/30"
          : "border border-white/5",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white truncate">{repo.name}</h3>
            {cached && (
              <span
                className="h-2 w-2 rounded-full bg-green-400 pulse-dot shadow-[0_0_8px_rgba(34,197,94,0.8)]"
                aria-label="Cached world available"
              />
            )}
          </div>
          {repo.description && (
            <p className="mt-1 text-xs text-white/50 line-clamp-2">{repo.description}</p>
          )}
          <div className="mt-2 flex items-center">
            <a
              href={getCodefundiRepoUrl(repo.link)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-semibold text-green-400 hover:text-green-300 hover:underline inline-flex items-center gap-1"
            >
              <span>View Full</span>
              <ExternalLink size={10} />
            </a>
          </div>
        </div>
        <Github
          size={14}
          className="text-white/0 group-hover:text-white/40 transition-colors mt-0.5"
        />
      </div>
    </div>
  );
}
