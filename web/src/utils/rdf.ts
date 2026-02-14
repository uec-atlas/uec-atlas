import type { I18NString, PostalAddress } from "generated/organization";

export const formatI18NString = (
  value: string | { ja?: string; en?: string } | undefined,
  locale: "ja" | "en" | null | undefined = "ja",
  fallback: string | I18NString = "",
): string => {
  const fallbackStr =
    typeof fallback === "string"
      ? fallback
      : formatI18NString(fallback, locale);
  if (!value) return fallbackStr;
  const preferredLocale = locale ?? "ja";
  if (typeof value === "string") return value;
  if (locale) return value[locale] ?? fallbackStr;
  return preferredLocale === "ja"
    ? (value.ja ?? value.en ?? fallbackStr)
    : (value.en ?? value.ja ?? fallbackStr);
};

export const formatAddress = (address: PostalAddress, locale = "ja") => {
  if (!address) return "";
  const parts = [];
  if (locale === "ja") {
    if (address.postalCode)
      parts.push(address.postalCode.map((code) => `〒${code}`).join(", "), " ");
    if (address.addressRegion) parts.push(address.addressRegion.ja);
    if (address.addressLocality) parts.push(address.addressLocality.ja);
    if (address.streetAddress) parts.push(address.streetAddress.ja);
    return parts.join("");
  } else {
    if (address.streetAddress) parts.push(address.streetAddress.en);
    if (address.addressLocality) parts.push(address.addressLocality.en);
    if (address.addressRegion) parts.push(address.addressRegion.en);
    if (address.postalCode) parts.push(...address.postalCode);
    return parts.join(", ");
  }
};
