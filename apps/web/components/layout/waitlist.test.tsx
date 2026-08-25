import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { Waitlist } from "./waitlist";
import { joinWaitlist } from "@/app/actions/waitlist";

// The server action is mocked: these are component tests. The action's own
// behaviour (validation, upstream mapping) is exercised separately.
vi.mock("@/app/actions/waitlist", () => ({
    joinWaitlist: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    toastInfo: vi.fn(),
    toastWarning: vi.fn(),
}));

const mockAction = vi.mocked(joinWaitlist);

beforeEach(() => {
    vi.clearAllMocks();
});

const submit = async (email: string) => {
    const user = userEvent.setup();
    const input = screen.getByLabelText(/email address/i);
    await user.type(input, email);
    await user.click(screen.getByRole("button", { name: /join the waitlist/i }));
    return user;
};

describe("Waitlist signup", () => {
    it("normalises the address with the shared schema before calling the action", async () => {
        mockAction.mockResolvedValue({ status: "success" });
        render(<Waitlist />);

        await submit("  Willikay11@GMAIL.com  ");

        await waitFor(() => expect(mockAction).toHaveBeenCalledTimes(1));
        // zodResolver applies the schema's trim + toLowerCase, so the action
        // receives the normalised value. The server re-validates regardless,
        // since a server action is reachable without going through this form.
        expect(mockAction).toHaveBeenCalledWith({ email: "willikay11@gmail.com" });
    });

    it("rejects a malformed address on the client without calling the action", async () => {
        render(<Waitlist />);

        await submit("not-an-email");

        expect(await screen.findByRole("alert")).toHaveTextContent(/valid email address/i);
        expect(mockAction).not.toHaveBeenCalled();
    });

    it("rejects an empty address on the client without calling the action", async () => {
        const user = userEvent.setup();
        render(<Waitlist />);

        await user.click(screen.getByRole("button", { name: /join the waitlist/i }));

        expect(await screen.findByRole("alert")).toBeInTheDocument();
        expect(mockAction).not.toHaveBeenCalled();
    });

    it("shows a confirmation and hides the form on success", async () => {
        mockAction.mockResolvedValue({ status: "success" });
        render(<Waitlist />);

        await submit("willikay11@gmail.com");

        expect(await screen.findByText(/you're on the list/i)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /join the waitlist/i })).not.toBeInTheDocument();
    });

    it("shows an inline error and keeps the typed value when the server rejects it", async () => {
        mockAction.mockResolvedValue({
            status: "invalid",
            message: "That doesn't look like a valid email address.",
        });
        render(<Waitlist />);

        // Passes client validation, rejected by the server.
        await submit("rejected@example.com");

        const error = await screen.findByRole("alert");
        expect(error).toHaveTextContent(/valid email address/i);

        const input = screen.getByLabelText(/email address/i);
        expect(input).toHaveAttribute("aria-invalid", "true");
        expect(input).toHaveAttribute("aria-describedby", error.id);
        // The user must not have to retype it.
        expect(input).toHaveValue("rejected@example.com");
    });

    it("surfaces rate limiting as a toast, not an inline field error", async () => {
        const { toastError } = await import("@/lib/toast");
        mockAction.mockResolvedValue({
            status: "error",
            message: "Too many attempts. Please try again shortly.",
        });
        render(<Waitlist />);

        await submit("willikay11@gmail.com");

        await waitFor(() =>
            expect(toastError).toHaveBeenCalledWith(
                expect.objectContaining({ description: expect.stringMatching(/too many attempts/i) }),
            ),
        );
        // Not the user's fault, so nothing is marked invalid on the field.
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("surfaces a server failure as a toast", async () => {
        const { toastError } = await import("@/lib/toast");
        mockAction.mockResolvedValue({
            status: "error",
            message: "Something went wrong. Please try again.",
        });
        render(<Waitlist />);

        await submit("willikay11@gmail.com");

        await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
        // The form stays available to retry.
        expect(screen.getByRole("button", { name: /join the waitlist/i })).toBeInTheDocument();
    });

    it("fires one request when submit is double-clicked", async () => {
        let resolveAction: (v: { status: "success" }) => void = () => {};
        mockAction.mockImplementation(
            () => new Promise((resolve) => { resolveAction = resolve; }),
        );
        render(<Waitlist />);

        const user = userEvent.setup();
        await user.type(screen.getByLabelText(/email address/i), "willikay11@gmail.com");
        const button = screen.getByRole("button", { name: /join the waitlist/i });

        await user.click(button);
        await user.click(button);

        expect(mockAction).toHaveBeenCalledTimes(1);
        resolveAction({ status: "success" });
    });

    it("disables the field and marks the button busy while pending", async () => {
        mockAction.mockImplementation(() => new Promise(() => {}));
        render(<Waitlist />);

        await submit("willikay11@gmail.com");

        await waitFor(() => {
            expect(screen.getByLabelText(/email address/i)).toBeDisabled();
            expect(screen.getByRole("button", { name: /join the waitlist/i })).toHaveAttribute(
                "aria-busy",
                "true",
            );
        });
    });

    it("submits on Enter, not only on click", async () => {
        mockAction.mockResolvedValue({ status: "success" });
        render(<Waitlist />);

        const user = userEvent.setup();
        await user.type(screen.getByLabelText(/email address/i), "willikay11@gmail.com{Enter}");

        await waitFor(() => expect(mockAction).toHaveBeenCalledTimes(1));
    });
});
