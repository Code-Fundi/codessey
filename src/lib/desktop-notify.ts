export async function ensureDesktopNotifyPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  const NotificationCtor = globalThis.Notification;
  if (!NotificationCtor) return "unsupported";
  if (NotificationCtor.permission !== "default") return NotificationCtor.permission;
  try {
    return await NotificationCtor.requestPermission();
  } catch {
    return "denied";
  }
}

export function notifyWorldComplete(input: {
  tag: string;
  title: string;
  body: string;
  url?: string | null;
}): void {
  const NotificationCtor = globalThis.Notification;
  if (!NotificationCtor || NotificationCtor.permission !== "granted") return;
  try {
    const notice = new NotificationCtor(input.title, {
      body: input.body,
      tag: input.tag,
      icon: "/favicon/favicon-32x32.png",
    });
    notice.onclick = () => {
      if (typeof window !== "undefined") {
        window.focus();
        const next = input.url?.trim();
        if (next && window.location.pathname !== next) {
          window.location.assign(next);
        }
      }
      notice.close();
    };
    globalThis.setTimeout(() => notice.close(), 12_000);
  } catch {
    /* some browsers block Notification construction */
  }
}
