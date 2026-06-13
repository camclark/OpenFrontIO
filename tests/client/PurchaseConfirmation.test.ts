import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Translate to the key (or interpolate params) so the dialog renders predictably.
vi.mock("../../src/client/Utils", () => ({
  translateText: vi.fn((key: string) => key),
}));

const purchaseWithCurrency = vi.fn(async () => true);
const createCheckoutSession = vi.fn(
  async () => "https://stripe.example/checkout",
);
const invalidateUserMe = vi.fn();
const changeSubscriptionTier = vi.fn(async () => true);
const getUserMe = vi.fn(async () => ({
  player: {
    currency: { hard: 100, soft: 100 },
    subscription: null,
    flares: [],
  },
}));

vi.mock("../../src/client/Api", () => ({
  getApiBase: vi.fn(() => "http://localhost:3000"),
  getUserMe: (...args: unknown[]) => getUserMe(...args),
  invalidateUserMe: (...args: unknown[]) => invalidateUserMe(...args),
  createCheckoutSession: (...args: unknown[]) => createCheckoutSession(...args),
  changeSubscriptionTier: (...args: unknown[]) =>
    changeSubscriptionTier(...args),
  purchaseWithCurrency: (...args: unknown[]) => purchaseWithCurrency(...args),
}));

// Cosmetics.ts resolves `src/core/AssetUrls` via a tsconfig path alias that
// isn't wired into the test resolver; stub it.
vi.mock("src/core/AssetUrls", () => ({
  assetUrl: (p: string) => `/${p}`,
}));

import {
  purchaseCosmetic,
  type ResolvedCosmetic,
} from "../../src/client/Cosmetics";

const flush = () => new Promise((r) => setTimeout(r, 0));

function skinResolved(
  overrides: Partial<{ priceHard: number; priceSoft: number }> = {},
): ResolvedCosmetic {
  return {
    type: "skin",
    cosmetic: {
      name: "mountain",
      rarity: "rare",
      product: null,
      priceHard: 50,
      ...overrides,
    } as ResolvedCosmetic["cosmetic"],
    colorPalette: null,
    relationship: "purchasable",
    key: "skin:mountain",
  };
}

function dialog(): HTMLElement | null {
  return document.querySelector("purchase-confirm-dialog");
}
function overlay(): HTMLElement | null {
  return document.querySelector('[role="dialog"]');
}
function confirmButton(): HTMLButtonElement | null {
  return document.querySelector(
    '[role="dialog"] button:not([data-cancel-button])',
  );
}
function cancelButton(): HTMLButtonElement | null {
  return document.querySelector("[data-cancel-button]");
}

describe("Store purchase confirmation guard (issue #4218)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMe.mockResolvedValue({
      player: {
        currency: { hard: 100, soft: 100 },
        subscription: null,
        flares: [],
      },
    });
    purchaseWithCurrency.mockResolvedValue(true);
    vi.stubGlobal("alert", vi.fn());
    // window.location.reload / href assignment is a no-op under jsdom.
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { reload: vi.fn(), href: "", hash: "#modal=store" },
    });
  });

  afterEach(async () => {
    // Cancel any dialog left open so the module-level in-flight guard resets
    // (the guard only clears once purchaseCosmetic's promise settles).
    document
      .querySelectorAll("purchase-confirm-dialog")
      .forEach((d) => d.dispatchEvent(new CustomEvent("cancel")));
    await flush();
    document
      .querySelectorAll("purchase-confirm-dialog")
      .forEach((d) => d.remove());
    vi.unstubAllGlobals();
  });

  it("opens a dialog and does not charge before Confirm", async () => {
    void purchaseCosmetic(skinResolved(), "hard");
    await flush();

    expect(dialog()).toBeTruthy();
    expect(purchaseWithCurrency).not.toHaveBeenCalled();
  });

  it("shows price and balance before/after for a currency purchase", async () => {
    void purchaseCosmetic(skinResolved({ priceHard: 50 }), "hard");
    await flush();

    const text = overlay()?.textContent?.replace(/\s+/g, " ") ?? "";
    expect(text).toContain("50"); // price
    expect(text).toContain("100"); // balance before
    // balance after = 100 - 50 = 50 (asserted via the price match above too)
    expect(text).toContain("store.balance_after");
  });

  it("executes the purchase exactly once on Confirm", async () => {
    const p = purchaseCosmetic(skinResolved(), "hard");
    await flush();
    confirmButton()!.click();
    await p;

    expect(purchaseWithCurrency).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });

  it("does not execute the purchase on Cancel", async () => {
    const p = purchaseCosmetic(skinResolved(), "hard");
    await flush();
    cancelButton()!.click();
    await p;

    expect(purchaseWithCurrency).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("dismisses on Escape without charging", async () => {
    const p = purchaseCosmetic(skinResolved(), "hard");
    await flush();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await p;

    expect(purchaseWithCurrency).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("defaults focus to the Cancel button", async () => {
    void purchaseCosmetic(skinResolved(), "hard");
    await flush();
    await (dialog() as unknown as { updateComplete: Promise<unknown> })
      ?.updateComplete;
    // requestAnimationFrame schedules the focus; flush a frame.
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    expect(document.activeElement).toBe(cancelButton());
  });

  it("ignores a concurrent second purchase (double-submit guard)", async () => {
    void purchaseCosmetic(skinResolved(), "hard");
    void purchaseCosmetic(skinResolved(), "hard");
    await flush();

    expect(document.querySelectorAll("purchase-confirm-dialog").length).toBe(1);
  });

  it("routes a dollar purchase through the dialog before checkout", async () => {
    const resolved = skinResolved();
    (resolved.cosmetic as { product: unknown }).product = {
      productId: "p",
      priceId: "pr",
      price: "$4.99",
    };
    const p = purchaseCosmetic(resolved, "dollar");
    await flush();

    expect(dialog()).toBeTruthy();
    expect(createCheckoutSession).not.toHaveBeenCalled();

    confirmButton()!.click();
    await p;
    expect(createCheckoutSession).toHaveBeenCalledTimes(1);
  });
});
