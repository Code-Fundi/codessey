import { describe, expect, it } from "vitest";
import {
  clampGuestbookMessage,
  GUESTBOOK_MESSAGE_MAX,
  maskGuestbookMessage,
} from "./guestbook-text";

describe("maskGuestbookMessage", () => {
  it("keeps the first letter and asterisks the rest", () => {
    expect(maskGuestbookMessage("fuck")).toBe("f***");
  });

  it("clamps to two-sentence length", () => {
    const long = "a".repeat(GUESTBOOK_MESSAGE_MAX + 40);
    expect(clampGuestbookMessage(long).length).toBe(GUESTBOOK_MESSAGE_MAX);
  });
});
