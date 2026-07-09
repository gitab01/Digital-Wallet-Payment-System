import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";

/**
 * Merges Tailwind CSS class names, resolving conflicts.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a number as a currency string.
 */
export function formatCurrency(
  amount: number,
  currencyCode: string = "USD",
  locale: string = "en-US"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

/**
 * Formats an ISO date string for display.
 */
export function formatDate(dateString: string, pattern: string = "MMM d, yyyy"): string {
  try {
    return format(parseISO(dateString), pattern);
  } catch {
    return dateString;
  }
}

/**
 * Formats an ISO date string as both date and time.
 */
export function formatDateTime(dateString: string): string {
  try {
    return format(parseISO(dateString), "MMM d, yyyy HH:mm");
  } catch {
    return dateString;
  }
}

/**
 * Truncates a wallet number for display, showing first 6 and last 4 characters.
 */
export function maskWalletNumber(walletNumber: string): string {
  if (walletNumber.length <= 10) return walletNumber;
  return `${walletNumber.slice(0, 6)}...${walletNumber.slice(-4)}`;
}

/**
 * Returns a status badge color class based on transaction status.
 */
export function getStatusColor(
  status: string
): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    COMPLETED: { bg: "bg-green-100", text: "text-green-700" },
    PENDING: { bg: "bg-yellow-100", text: "text-yellow-700" },
    PROCESSING: { bg: "bg-blue-100", text: "text-blue-700" },
    FAILED: { bg: "bg-red-100", text: "text-red-700" },
    CANCELLED: { bg: "bg-gray-100", text: "text-gray-600" },
    REVERSED: { bg: "bg-purple-100", text: "text-purple-700" },
  };
  return map[status] ?? { bg: "bg-gray-100", text: "text-gray-600" };
}

/**
 * Extracts an error message from an Axios error response.
 */
export function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    const axiosError = error as {
      response?: { data?: { message?: string } };
    };
    return axiosError.response?.data?.message ?? "An unexpected error occurred";
  }
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred";
}
