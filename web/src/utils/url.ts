export const toFullURL = (path: string) =>
  new URL(path, import.meta.env.SITE || "http://localhost:4321").toString();

const prefixMappings: Record<string, string> = {
  uatr: toFullURL("/resources/"),
};

export const expandURI = (uri: string) => {
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    return uri;
  }
  const [prefix, localName] = uri.split(":");
  const namespace = prefixMappings[prefix];
  if (namespace) {
    return namespace + localName;
  }
  return uri;
};
