import { useTranslations } from "next-intl";
import { ORGANIZER } from "@/core/pattern/brands";

/** A brand as shown: the project palette is translated, every other brand is its own name. */
export function useBrandLabel(): (brand: string) => string {
  const t = useTranslations("materials");
  return (brand) => (brand === ORGANIZER ? t("organizer") : brand);
}
