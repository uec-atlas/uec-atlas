type FoundPosition = "self" | "parent" | "none";
export const findNearestProperty = <T extends object, U>(
  data: T,
  getParent: (item: T) => T | undefined,
  getTarget: (item: T) => U | undefined,
): {
  position: FoundPosition;
  value: U | undefined;
} => {
  const visited = new Set<T>();
  const queue: { item: T; depth: number }[] = [{ item: data, depth: 0 }];

  while (queue.length > 0) {
    const { item, depth } = queue.shift()!;
    if (visited.has(item)) continue;
    visited.add(item);

    const targetValue = getTarget(item);
    if (targetValue !== undefined) {
      return {
        position: depth === 0 ? "self" : "parent",
        value: targetValue,
      };
    }

    const parentItem = getParent(item);
    if (parentItem && typeof parentItem === "object") {
      queue.push({ item: parentItem as T, depth: depth + 1 });
    }
  }

  return { position: "none", value: undefined };
};

export const getDepthByPropertyExistence = <T extends object>(
  data: T,
  getParent: (item: T) => T | undefined,
): number => {
  const parent = getParent(data);
  if (!parent) return 0;
  return 1 + getDepthByPropertyExistence(parent, getParent);
};
