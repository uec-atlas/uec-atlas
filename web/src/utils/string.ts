const romanMap = {
  Ⅰ: 1,
  Ⅱ: 2,
  Ⅲ: 3,
};

export const compareStringWithRoman = (a: string, b: string) => {
  for (const [roman, value] of Object.entries(romanMap)) {
    a = a.replace(roman, value.toString());
    b = b.replace(roman, value.toString());
  }
  return a.localeCompare(b, "ja", { numeric: true });
};
