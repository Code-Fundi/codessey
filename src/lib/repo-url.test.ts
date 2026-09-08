import { describe, expect, it } from "vitest";
import {
  githubPathForRepo,
  githubRepoUrl,
  normalizeRepoUrl,
  parseGithubOwnerRepo,
  repoNameFromUrl,
} from "./repo-url";
import { asTrimmed } from "./utils";
import { publicRepoToast } from "./public-repo";
import { isAllowedPanoHost, parsePanoProxyUrl } from "./pano-proxy";
import { GUESTBOOK_COINS, PLAQUE_COINS, SIGNUP_COINS, coinsForMode } from "./generation";
import { ownerRepoHeading, viewerMedia } from "./cached-world";
import { indexRepoPayload } from "./codefundi-index";

describe("asTrimmed", () => {
  it("trims strings and stringifies other values", () => {
    expect(asTrimmed("  main  ")).toBe("main");
    expect(asTrimmed(12, "main")).toBe("12");
    expect(asTrimmed(null, "main")).toBe("main");
    expect(asTrimmed(undefined, "main")).toBe("main");
  });
});

describe("normalizeRepoUrl", () => {
  it("lowercases, strips .git, and ignores trailing slashes", () => {
    expect(normalizeRepoUrl("HTTPS://GitHub.com/Acme/Repo.GIT/")).toBe(
      "https://github.com/acme/repo",
    );
  });

  it("treats the same repo with different branches as the same identity", () => {
    expect(normalizeRepoUrl("https://github.com/acme/repo")).toBe(
      normalizeRepoUrl("https://github.com/acme/repo.git"),
    );
  });
});

describe("parseGithubOwnerRepo", () => {
  it("parses https clone URLs and owner/repo paths", () => {
    expect(parseGithubOwnerRepo("https://github.com/felixwaweru/elevenlabs-node.git")).toEqual({
      owner: "felixwaweru",
      repo: "elevenlabs-node",
    });
    expect(parseGithubOwnerRepo("felixwaweru/elevenlabs-node")).toEqual({
      owner: "felixwaweru",
      repo: "elevenlabs-node",
    });
  });

  it("builds canonical github URLs and app paths", () => {
    expect(githubRepoUrl("Acme", "Repo.git")).toBe("https://github.com/Acme/Repo");
    expect(githubPathForRepo("https://github.com/Acme/Repo")).toBe("/Acme/Repo");
    expect(repoNameFromUrl("https://github.com/Acme/Repo")).toBe("Repo");
  });
});

describe("ownerRepoHeading", () => {
  it("renders username/reponame for the viewer title", () => {
    expect(ownerRepoHeading("https://github.com/felixwaweru/elevenlabs-node")).toBe(
      "felixwaweru/elevenlabs-node",
    );
  });
});

describe("publicRepoToast", () => {
  it("maps private/403 index errors to the public-repo message", () => {
    expect(publicRepoToast(403, "Repository is private")).toBe("Use a public GitHub repository.");
    expect(publicRepoToast(500, "boom", "Index failed.")).toBe("Index failed.");
  });
});

describe("pano proxy allowlist", () => {
  it("allows World Labs hosts over https", () => {
    expect(isAllowedPanoHost("cdn.worldlabs.ai")).toBe(true);
    expect(parsePanoProxyUrl("https://marble.worldlabs.ai/pano.jpg")?.hostname).toBe(
      "marble.worldlabs.ai",
    );
    expect(parsePanoProxyUrl("https://evil.example/pano.jpg")).toBeNull();
  });
});

describe("guestbook credits", () => {
  it("does not bill generate and charges 1 coin for guestbook and plaque", () => {
    expect(coinsForMode("pano")).toBe(0);
    expect(coinsForMode("world")).toBe(0);
    expect(GUESTBOOK_COINS).toBe(1);
    expect(PLAQUE_COINS).toBe(1);
    expect(SIGNUP_COINS).toBe(2);
  });
});

describe("indexRepoPayload", () => {
  it("omits a blank branch so CodeFundi uses the repo default", () => {
    expect(indexRepoPayload("https://github.com/acme/repo", "")).toEqual({
      url: "https://github.com/acme/repo",
    });
    expect(indexRepoPayload("https://github.com/acme/repo", "  ")).toEqual({
      url: "https://github.com/acme/repo",
    });
    expect(indexRepoPayload("https://github.com/acme/repo", "develop")).toEqual({
      url: "https://github.com/acme/repo",
      branch: "develop",
    });
  });
});

describe("viewerMedia", () => {
  it("uses splat whenever it is present", () => {
    expect(
      viewerMedia({
        splatUrl: "https://cdn.example/splat.spz",
        panoUrl: "https://cdn.example/pano.jpg",
      }),
    ).toEqual({
      splatUrl: "https://cdn.example/splat.spz",
      panoUrl: "https://cdn.example/pano.jpg",
    });
  });

  it("falls back to pano when splat is missing", () => {
    expect(
      viewerMedia({
        splatUrl: "",
        panoUrl: "https://cdn.example/pano.jpg",
      }),
    ).toEqual({ splatUrl: "", panoUrl: "https://cdn.example/pano.jpg" });
  });
});
