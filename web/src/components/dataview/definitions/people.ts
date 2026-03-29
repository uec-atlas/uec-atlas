import type { LinkedPerson, Person } from "@/data/people";
import LinkCardList from "../LinkCardList.astro";
import { defineDataViewItems } from "../types";

const getBasedOnLabel = (url: string | undefined): string => {
  if (!url) return "関連リンク";
  if (url.startsWith("https://www.uec.ac.jp/research/")) {
    return "教員一覧(電気通信大学HP)";
  }
  if (url.startsWith("https://www.career.ce.uec.ac.jp/")) {
    return "キャリア支援センター キャリア教育部門HP";
  }
  if (url.startsWith("https://www.tech.uec.ac.jp/")) {
    return "教育研究技師部HP";
  }

  return "関連リンク";
};

export const personDataView = defineDataViewItems<LinkedPerson>()(
  ({ componentItem, sectionItem }) => [
    sectionItem({
      type: "section",
      title: "関連リンク",
      when: (value) => !!value.isBasedOn,
      items: [
        componentItem({
          type: "component",
          component: LinkCardList,
          props: (value) => ({
            items: [
              {
                name: { ja: getBasedOnLabel(value.isBasedOn) },
                uri: value.isBasedOn ?? "",
                tags: [],
              },
            ],
            fallbackName: {
              ja: "無名の人物",
              en: "Unnamed People",
            },
          }),
        }),
      ],
    }),
    sectionItem({
      type: "section",
      title: "所属組織",
      when: (value) =>
        Array.isArray(value.memberOf) && value.memberOf.length > 0,
      items: [
        componentItem({
          type: "component",
          component: LinkCardList,
          props: (value) => ({
            items: value.memberOf.map((org) => ({
              name: org.name,
              uri: org.id,
              tags: org.type ? [org.type] : [],
            })),
            fallbackName: {
              ja: "無名の組織",
              en: "Unnamed Organization",
            },
          }),
        }),
      ],
    }),
  ],
);

export const allPeopleDataView = defineDataViewItems<{
  people: Person[];
}>()(({ componentItem }) => [
  componentItem({
    type: "component",
    component: LinkCardList,
    props: (value) => ({
      items: value.people.map((org) => ({
        name: org.name,
        uri: org.id,
      })),
      fallbackName: {
        ja: "無名の人物",
        en: "Unnamed People",
      },
    }),
  }),
]);
