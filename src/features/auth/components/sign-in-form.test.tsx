import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";

const signInEmail = vi.fn();
const push = vi.fn();

vi.mock("../client", () => ({
  authClient: {
    signIn: { email: (...args: unknown[]) => signInEmail(...args) },
    sendVerificationEmail: vi.fn(),
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { SignInForm, safeNextPath } from "./sign-in-form";

function renderForm(next?: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SignInForm next={next} />
    </NextIntlClientProvider>,
  );
}

describe("SignInForm", () => {
  beforeEach(() => {
    signInEmail.mockReset();
    push.mockReset();
  });

  it("shows translated validation errors tied to the fields", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("announces wrong credentials without saying which field was wrong", async () => {
    signInEmail.mockResolvedValue({ error: { status: 401 } });
    renderForm();
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "whatever");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
  });

  it("offers to resend the confirmation email for unverified accounts", async () => {
    signInEmail.mockResolvedValue({ error: { status: 403 } });
    renderForm();
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "whatever");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(
      await screen.findByRole("button", { name: "Resend confirmation email" }),
    ).toBeInTheDocument();
  });

  it("navigates to the requested page after signing in", async () => {
    signInEmail.mockResolvedValue({ error: null });
    renderForm("/household");
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "whatever");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/household"));
  });
});

describe("safeNextPath", () => {
  it("only accepts same-site relative paths", () => {
    expect(safeNextPath("/household")).toBe("/household");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
  });
});
