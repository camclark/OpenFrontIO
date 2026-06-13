import { html, LitElement, render as litRender, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { translateText } from "../Utils";
import "./CapIcon";
import "./PlutoniumIcon";

export type PurchaseConfirmMethod = "dollar" | "hard" | "soft";

/**
 * Rich confirmation dialog shown before any store purchase executes.
 *
 * Prefer the imperative {@link confirmPurchase} helper over instantiating this
 * directly — it mounts the dialog, resolves a Promise<boolean> on the user's
 * choice, and cleans up the DOM afterwards.
 *
 * Behaviour (issue #4218 acceptance criteria):
 *  - Shows item name, rarity, price, and (for currency purchases) the balance
 *    before/after the spend.
 *  - Resolves true only on explicit Confirm.
 *  - Escape, outside-click, and Cancel all resolve false.
 *  - Cancel is the default-focused button.
 */
@customElement("purchase-confirm-dialog")
export class PurchaseConfirmDialog extends LitElement {
  @property() itemName = "";
  @property() rarity = "common";
  @property() method: PurchaseConfirmMethod = "hard";

  /** Pre-formatted price string, e.g. "$4.99" or "110". */
  @property() priceLabel = "";

  /** Whether to render the balance before/after section (currency only). */
  @property({ type: Boolean }) showBalance = false;
  @property({ type: Number }) balanceBefore = 0;
  @property({ type: Number }) balanceAfter = 0;

  /** Disables the buttons while a purchase request is in flight. */
  @property({ type: Boolean }) disabled = false;

  private portal: HTMLDivElement | null = null;
  private cancelFocused = false;

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      this.handleCancel();
    }
  };

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.portal = document.createElement("div");
    document.body.appendChild(this.portal);
    document.addEventListener("keydown", this.onKeyDown, true);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this.onKeyDown, true);
    if (this.portal) {
      litRender(html``, this.portal);
      this.portal.remove();
      this.portal = null;
    }
  }

  render() {
    if (this.portal) {
      litRender(this.renderOverlay(), this.portal);
      // Default focus to Cancel once the overlay is in the DOM.
      if (!this.cancelFocused) {
        this.cancelFocused = true;
        requestAnimationFrame(() => {
          this.portal
            ?.querySelector<HTMLButtonElement>("[data-cancel-button]")
            ?.focus();
        });
      }
    }
    return html``;
  }

  private rarityColor(): string {
    switch (this.rarity) {
      case "legendary":
        return "text-amber-400 border-amber-400/40 bg-amber-400/10";
      case "epic":
        return "text-fuchsia-400 border-fuchsia-400/40 bg-fuchsia-400/10";
      case "rare":
        return "text-sky-400 border-sky-400/40 bg-sky-400/10";
      case "uncommon":
        return "text-green-400 border-green-400/40 bg-green-400/10";
      default:
        return "text-white/60 border-white/20 bg-white/5";
    }
  }

  private currencyIcon(size: number) {
    if (this.method === "hard") {
      return html`<plutonium-icon .size=${size}></plutonium-icon>`;
    }
    if (this.method === "soft") {
      return html`<cap-icon .size=${size}></cap-icon>`;
    }
    return nothing;
  }

  private renderOverlay() {
    return html`
      <div
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
        @click=${(e: Event) => {
          if (e.target === e.currentTarget) this.handleCancel();
        }}
      >
        <div
          class="mx-4 w-full max-w-sm p-6 rounded-2xl border border-green-500/40 bg-surface shadow-2xl"
          role="dialog"
          aria-modal="true"
        >
          <h2 class="text-base font-bold text-white mb-4">
            ${translateText("store.confirm_title")}
          </h2>

          <div class="flex items-center justify-between gap-2 mb-3">
            <span class="text-sm font-bold text-white">${this.itemName}</span>
            <span
              class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${this.rarityColor()}"
            >
              ${translateText(`cosmetics.${this.rarity}`)}
            </span>
          </div>

          <div
            class="flex items-center justify-between text-sm py-2 border-t border-white/10"
          >
            <span class="text-white/60">${translateText("store.price")}</span>
            <span class="flex items-center gap-1.5 font-bold text-white">
              ${this.currencyIcon(18)}${this.priceLabel}
            </span>
          </div>

          ${this.showBalance
            ? html`
                <div
                  class="flex items-center justify-between text-sm py-2 border-t border-white/10"
                >
                  <span class="text-white/60"
                    >${translateText("store.balance_current")}</span
                  >
                  <span class="flex items-center gap-1.5 text-white/80">
                    ${this.currencyIcon(
                      16,
                    )}${this.balanceBefore.toLocaleString()}
                  </span>
                </div>
                <div
                  class="flex items-center justify-between text-sm py-2 border-t border-white/10 mb-1"
                >
                  <span class="text-white/60"
                    >${translateText("store.balance_after")}</span
                  >
                  <span
                    class="flex items-center gap-1.5 font-bold ${this
                      .balanceAfter < 0
                      ? "text-red-400"
                      : "text-green-400"}"
                  >
                    ${this.currencyIcon(
                      16,
                    )}${this.balanceAfter.toLocaleString()}
                  </span>
                </div>
              `
            : nothing}

          <div class="flex gap-3 mt-5">
            <button
              data-cancel-button
              @click=${() => this.handleCancel()}
              ?disabled=${this.disabled}
              class="flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 hover:text-white transition-all focus:outline-none focus:ring-2 focus:ring-white/40 disabled:opacity-50 disabled:pointer-events-none"
            >
              ${translateText("common.cancel")}
            </button>
            <button
              @click=${() => this.handleConfirm()}
              ?disabled=${this.disabled}
              class="flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl bg-green-600 text-white hover:bg-green-700 transition-all focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50 disabled:pointer-events-none border-0"
            >
              ${translateText("common.confirm")}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private handleConfirm() {
    if (this.disabled) return;
    this.dispatchEvent(new CustomEvent("confirm"));
  }

  private handleCancel() {
    this.dispatchEvent(new CustomEvent("cancel"));
  }
}

export interface ConfirmPurchaseOptions {
  itemName: string;
  rarity?: string;
  method: PurchaseConfirmMethod;
  priceLabel: string;
  showBalance?: boolean;
  balanceBefore?: number;
  balanceAfter?: number;
}

/**
 * Mounts a {@link PurchaseConfirmDialog} and resolves once the user confirms
 * or cancels. Resolves true on Confirm, false on Cancel / Escape / outside
 * click. The dialog is removed from the DOM before the Promise settles.
 */
export function confirmPurchase(
  opts: ConfirmPurchaseOptions,
): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement(
      "purchase-confirm-dialog",
    ) as PurchaseConfirmDialog;
    dialog.itemName = opts.itemName;
    dialog.rarity = opts.rarity ?? "common";
    dialog.method = opts.method;
    dialog.priceLabel = opts.priceLabel;
    dialog.showBalance = opts.showBalance ?? false;
    dialog.balanceBefore = opts.balanceBefore ?? 0;
    dialog.balanceAfter = opts.balanceAfter ?? 0;

    let settled = false;
    const finish = (confirmed: boolean) => {
      if (settled) return;
      settled = true;
      dialog.remove();
      resolve(confirmed);
    };

    dialog.addEventListener("confirm", () => finish(true));
    dialog.addEventListener("cancel", () => finish(false));
    document.body.appendChild(dialog);
  });
}
