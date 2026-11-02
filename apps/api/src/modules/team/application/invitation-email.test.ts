import { describe, expect, it } from "vitest";
import { renderInvitationEmail, safeSalonName } from "./invitation-email";

describe("invitation email", () => {
  it("sanitises tenant-controlled salon names", () => {
    expect(safeSalonName("Lotus Nail Quận 1")).toBe("Lotus Nail Quận 1");
    expect(safeSalonName("Verify at https://evil.example/login now")).toBe("Verify at now");
    expect(safeSalonName("Pay: gugu-support.com or help@evil.io")).toBe("Pay or");
    expect(safeSalonName("A‮b\u0000c<script>")).toBe("A b c script");
    expect(safeSalonName("x".repeat(100))).toHaveLength(60);
    expect(safeSalonName("https://x.y")).toBe("GuGu");
  });
  it("keeps tenant text out of the subject", () => {
    const mail = renderInvitationEmail({
      locale: "en",
      to: "a@b.test",
      link: "http://localhost/en/join-team?token=t",
      salonName: "Lotus",
    });
    expect(mail.subject).not.toContain("Lotus");
    expect(mail.text).toContain("Lotus");
  });
});
