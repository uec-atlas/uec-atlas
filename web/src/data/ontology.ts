import { getCollection } from "astro:content";

/**
 * 元のデータ形式から参照IDをリンク済みのオブジェクトに変換するための型定義
 */
export type OntologyUsage = {
  class: string;
  range: string;
  multivalued?: boolean;
  inlined?: boolean;
  inlined_as_list?: boolean;
  required?: boolean;
  description?: string;
};

export type OntologySlot = {
  id: string;
  name: string;
  description?: string;
  range: string;
  multivalued?: boolean;
  inlined?: boolean;
  inlined_as_list?: boolean;
  required?: boolean;
  inherited_from?: string;
  slot_uri: string;
  usages?: OntologyUsage[];
};

export type RawOntologyClass = {
  id: string;
  name: string;
  description?: string;
  class_uri: string;
  is_a?: string;
  mixins?: string[];
  slots: OntologySlot[];
  abstract?: boolean;
  tree_root?: boolean;
  children?: string[];
};

export type LinkedOntologyClass = Omit<
  RawOntologyClass,
  "is_a" | "mixins" | "children"
> & {
  is_a?: LinkedOntologyClass;
  mixins: LinkedOntologyClass[];
  children: LinkedOntologyClass[];
};

// Rawデータの取得
const rawClasses = await getCollection("ontologyClasses");
const rawSlots = await getCollection("ontologySlots");

// 1. マップの初期化
export const ontologyClassMap = new Map<string, LinkedOntologyClass>();
export const ontologySlotMap = new Map<string, OntologySlot>();

// 2. スロットのマップ作成
for (const { data } of rawSlots) {
  ontologySlotMap.set(data.id, data);
}

// 3. まず全オブジェクトを「リンクなし」の状態で作成
for (const { data } of rawClasses) {
  ontologyClassMap.set(data.id, {
    ...data,
    is_a: undefined,
    mixins: [],
    children: [],
  });
}

// 4. 参照を解決してリンク接続
for (const { data } of rawClasses) {
  const linked = ontologyClassMap.get(data.id)!;

  // 親クラス (is_a) の解決
  if (data.is_a) {
    const parent = ontologyClassMap.get(data.is_a);
    if (parent) {
      linked.is_a = parent;
    }
  }

  // Mixins の解決
  if (data.mixins) {
    for (const mixinId of data.mixins) {
      const mixin = ontologyClassMap.get(mixinId);
      if (mixin) {
        linked.mixins.push(mixin);
      }
    }
  }

  // 子クラス (children) の解決
  if (data.children) {
    for (const childId of data.children) {
      const child = ontologyClassMap.get(childId);
      if (child) {
        linked.children.push(child);
      }
    }
  }
}

/**
 * 全クラスの配列（フラットな状態）
 */
export const allOntologyClasses = Array.from(ontologyClassMap.values());

/**
 * 全スロットの配列
 */
export const allOntologySlots = Array.from(ontologySlotMap.values());

/**
 * ルートクラスのみの配列（階層構造の起点）
 */
export const rootOntologyClasses = allOntologyClasses.filter(
  (cls) => !cls.is_a && cls.tree_root,
);
