import prefixes from "@/assets/prefixes.json";

export const toFullURL = (path: string) =>
  new URL(path, import.meta.env.SITE || "http://localhost:4321").toString();

export const expandURI = (uri: string) => {
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    return uri;
  }
  const [prefix, localName] = uri.split(":");
  if (prefix === "uar") {
    return toFullURL(`/resources/${localName}`);
  }
  const namespace = (prefixes as Record<string, string>)[prefix];
  if (namespace) {
    return namespace + localName;
  }
  return uri;
};

export const compactUri = (uri: string) => {
  const entry = Object.entries(prefixes).find(([_, ns]) => uri.startsWith(ns));
  return entry ? `${entry[0]}:${uri.slice(entry[1].length)}` : uri;
};
