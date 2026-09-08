import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureDesktopNotifyPermission, notifyWorldComplete } from "./desktop-notify";

describe("desktop notify", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests permission only while it is default", async () => {
    const requestPermission = vi.fn(async () => "granted" as NotificationPermission);
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission,
    });
    await expect(ensureDesktopNotifyPermission()).resolves.toBe("granted");
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it("shows a tagged notification when permission is granted", () => {
    const NotificationMock = vi.fn(function NotificationMock(this: {
      close: () => void;
      onclick: (() => void) | null;
    }) {
      this.close = vi.fn();
      this.onclick = null;
    });
    Object.assign(NotificationMock, { permission: "granted" });
    vi.stubGlobal("Notification", NotificationMock);

    notifyWorldComplete({
      tag: "codessey-world-1",
      title: "Codessey world ready",
      body: "acme/one finished generating.",
      url: "/acme/one",
    });

    expect(NotificationMock).toHaveBeenCalledWith("Codessey world ready", {
      body: "acme/one finished generating.",
      tag: "codessey-world-1",
      icon: "/favicon/favicon-32x32.png",
    });
  });
});
