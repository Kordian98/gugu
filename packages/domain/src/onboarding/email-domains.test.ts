import { describe, expect, it } from "vitest";
import { emailDomain, isDisposableEmail, isMajorEmailProvider } from "./email-domains";

describe("email domains", () => {
  it("extracts the domain, lower-cased", () => {
    expect(emailDomain("Mai@Salon.VN")).toBe("salon.vn");
    expect(emailDomain("nope")).toBe("");
  });
  it("flags disposable inboxes, including subdomains", () => {
    expect(isDisposableEmail("a@mailinator.com")).toBe(true);
    expect(isDisposableEmail("a@x.yopmail.com")).toBe(true);
    expect(isDisposableEmail("a@gmail.com")).toBe(false);
    expect(isDisposableEmail("a@notmailinator.com")).toBe(false);
  });
  it("recognises large consumer providers", () => {
    expect(isMajorEmailProvider("a@gmail.com")).toBe(true);
    expect(isMajorEmailProvider("a@yahoo.com.vn")).toBe(true);
    expect(isMajorEmailProvider("a@maysalon.vn")).toBe(false);
  });
});
