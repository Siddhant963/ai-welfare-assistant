import type { Category } from "../../generated/prisma/client.ts";

export const CATEGORY_LABELS: Record<Category, string> = {
  ACADEMIC: "Academic",
  FINANCIAL: "Financial",
  VISA_IMMIGRATION: "Visa/Immigration",
  HOUSING: "Housing",
  HEALTH_WELLBEING: "Health & Wellbeing",
  OTHER: "Other",
};

export function formatDateTime(date: Date): string {
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
