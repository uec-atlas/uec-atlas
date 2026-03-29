import {
  getReverseRelation,
  type LinkedOrganization,
  type RawOrganization,
} from "@/data/organizations";
import LinkCardList from "../LinkCardList.astro";
import { defineDataViewItems } from "../types";

export const createOrganizationLinkCardSection = (
  title: string,
  key: Exclude<
    keyof LinkedOrganization | "reverseRelations",
    "manages" | "member"
  >,
) =>
  defineDataViewItems<LinkedOrganization>()(
    ({ componentItem, sectionItem }) => [
      sectionItem({
        type: "section",
        title,
        when: (value) => {
          if (key === "reverseRelations") {
            return getReverseRelation(value.id).length > 0;
          }
          return (
            Array.isArray(value[key]) && (value[key] as unknown[]).length > 0
          );
        },
        items: [
          componentItem({
            type: "component",
            component: LinkCardList,
            props: (value) => {
              const values =
                key === "reverseRelations"
                  ? getReverseRelation(value.id)
                  : value[key];
              if (!Array.isArray(values)) return { items: [] };

              return {
                items: values.map((item) => {
                  const isRelation = "target" in item && "type" in item;
                  const target = isRelation ? item.target : item;
                  const relationType = isRelation ? item.type : undefined;

                  const name = target.name ?? target.name;
                  const uri = target.id;
                  const type = target.type ?? target.type;

                  const tags = [];
                  if (relationType) tags.push(relationType);
                  if (type) tags.push(type);

                  return {
                    name,
                    uri,
                    tags,
                  };
                }),
                fallbackName: {
                  ja: "無名の組織",
                  en: "Unnamed Organization",
                },
              };
            },
          }),
        ],
      }),
    ],
  );

export const organizationDataView = defineDataViewItems<LinkedOrganization>()(
  ({ componentItem, sectionItem }) => [
    ...createOrganizationLinkCardSection("上位組織", "subOrganizationOf"),
    ...createOrganizationLinkCardSection("下位組織", "hasSubOrganization"),
    ...createOrganizationLinkCardSection("関連組織", "relatedTo"),
    ...createOrganizationLinkCardSection(
      "関連組織(逆関係)",
      "reverseRelations",
    ),
    sectionItem({
      type: "section",
      title: "管理する地物",
      when: (value) => value.manages.length > 0,
      items: [
        componentItem({
          type: "component",
          component: LinkCardList,
          props: (item) => ({
            items: item.manages.map((spatial) => ({
              name: spatial.properties.name,
              uri: spatial.id,
              tags: [spatial.properties.type],
            })),
            fallbackName: {
              ja: "無名の地物",
              en: "Unnamed Feature",
            },
          }),
        }),
      ],
    }),
    sectionItem({
      type: "section",
      title: "所属する人",
      when: (value) => value.member.length > 0,
      items: [
        componentItem({
          type: "component",
          component: LinkCardList,
          props: (item) => ({
            items: item.member.map((person) => ({
              name: person.name,
              uri: person.id,
              tags: [],
            })),
            fallbackName: {
              ja: "無名の人物",
              en: "Unnamed Person",
            },
          }),
        }),
      ],
    }),
  ],
);

export const allOrganizationDataView = defineDataViewItems<{
  organizations: RawOrganization[];
}>()(({ componentItem, sectionItem }) => [
  componentItem({
    type: "component",
    component: LinkCardList,
    props: (value) => ({
      items: value.organizations.map((org) => ({
        name: org.name,
        uri: org.id,
        tags: [org.type],
      })),
      fallbackName: {
        ja: "無名の組織",
        en: "Unnamed Organization",
      },
    }),
  }),
]);
