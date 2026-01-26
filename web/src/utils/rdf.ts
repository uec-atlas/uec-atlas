import type { PostalAddress } from "generated/organization";

export const formatAddress = (address: PostalAddress, locale = "ja") => {
  if (!address) return "";
  const parts = [];
  if(locale === "ja") {
    if (address.postalCode) parts.push(`〒${address.postalCode} `);
    if (address.addressRegion) parts.push(address.addressRegion.ja);
    if (address.addressLocality) parts.push(address.addressLocality.ja);
    if (address.streetAddress) parts.push(address.streetAddress.ja);
    return parts.join("");
  } else {
    if (address.streetAddress) parts.push(address.streetAddress.en);
    if (address.addressLocality) parts.push(address.addressLocality.en);
    if (address.addressRegion) parts.push(address.addressRegion.en);
    if (address.postalCode) parts.push(address.postalCode);
    return parts.join(", ");
  }
}
