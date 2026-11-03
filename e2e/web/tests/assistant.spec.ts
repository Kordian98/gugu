// Flow 4 (vi): the AI assistant bubble (topic 08). The suite never calls a real LLM: with no
// ANTHROPIC_API_KEY (the default for `pnpm e2e:web`) the API reports `configured: false` and the
// panel must show the graceful "not configured" notice instead of a chat box.
import { API } from "../support/env";
import { t } from "../support/i18n";
import { expect, test } from "../support/fixtures";
import { tap } from "../support/ui";

const L = "vi" as const;
test.use({ area: "assistant" });

test.describe("assistant @vi", () => {
  test("bubble opens the panel; without an API key it says 'not configured'", async ({
    seed,
    signedIn,
  }) => {
    const page = await signedIn(seed.ownerEmail);
    await page.goto("/vi/business");

    const statusRes = await page.request.get(`${API}/salons/${seed.salonId}/assistant`);
    expect(statusRes.status(), "GET assistant status").toBe(200);
    const status = (await statusRes.json()) as {
      configured: boolean;
      entitled: boolean;
      permitted: boolean;
    };
    expect(status.permitted, "owner may use the assistant").toBe(true);

    const bubble = page.getByTestId("assistant-bubble");
    await expect(bubble).toHaveAccessibleName(t(L, "crm:assistant.open"));
    await tap(bubble);
    const panel = page.getByTestId("assistant-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(t(L, "crm:assistant.title"));

    if (!process.env["ANTHROPIC_API_KEY"]) {
      expect(status.configured, "no ANTHROPIC_API_KEY → API reports not configured").toBe(false);
      await expect(panel.getByTestId("assistant-not-configured")).toHaveText(
        t(L, "crm:assistant.notConfigured"),
      );
      await expect(panel.getByTestId("assistant-input")).toHaveCount(0);
    } else {
      // A key is present: only check the chat box renders; sending would call the real provider.
      await expect(panel.getByTestId("assistant-input")).toBeVisible();
    }

    await tap(panel.getByTestId("assistant-close"));
    await expect(panel).toHaveCount(0);
    await expect(bubble).toBeVisible();
  });
});
