export const toFullURL = (path: string) =>
  new URL(path, import.meta.env.SITE || "http://localhost:4321").toString();
