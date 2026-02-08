import { getCollection } from "astro:content";
import { featureCollection, union } from "@turf/turf";
import { geoJSONToWkt } from "betterknown";
import type {
  SpatialEntity,
  SpatialProperties,
  Storey,
} from "generated/spatial";
import { toOrdinal } from "@/utils/number";
import { formatLangString } from "@/utils/rdf";
import type { LinkedOrganization } from "./organizations";

export type RawSpatialProperties = Omit<
  SpatialProperties,
  | "containedInPlace"
  | "containsPlace"
  | "isPartOf"
  | "hasPart"
  | "connectedTo"
  | "intersectsPlace"
> & {
  containedInPlace?: string;
  containsPlace?: string[];
  isPartOf?: string[];
  hasPart?: string[];
  connectedTo?: string[];
  intersectsPlace?: string[];
};

export type RawSpatialEntity = Omit<SpatialEntity, "properties"> & {
  properties: RawSpatialProperties;
};

export type LinkedSpatialProperties = Omit<
  SpatialProperties,
  | "containedInPlace"
  | "containsPlace"
  | "isPartOf"
  | "hasPart"
  | "connectedTo"
  | "intersectsPlace"
  | "managedBy"
> & {
  containedInPlace?: LinkedSpatialEntity;
  containsPlace: LinkedSpatialEntity[];
  isPartOf: LinkedSpatialEntity[];
  hasPart: LinkedSpatialEntity[];
  connectedTo: LinkedSpatialEntity[];
  intersectsPlace: LinkedSpatialEntity[];
  managedBy: LinkedOrganization[];
};

export type LinkedSpatialEntity = Omit<SpatialEntity, "properties"> & {
  properties: LinkedSpatialProperties;
};

const spatialEntityTypeOrder = [
  "Site",
  "Area",
  "Gate",
  "Building",
  "Structure",
  "Storey",
  "Classroom",
  "PracticeRoom",
  "Facility",
  "Restroom",
  "Room",
  "RoomSubZone",
  "BuildingEntrance",
  "Bridge",
  "Passage",
  "Road",
];

const spatialEntityCategoryOrder = [
  "academic",
  "sports",
  "office",
  "welfare",
  "security",
  "monument",
  "parking",
  "residential",
  "water",
  "utility",
];

export const spatialEntitySorter = (
  a: SpatialEntity | LinkedSpatialEntity,
  b: SpatialEntity | LinkedSpatialEntity,
): number => {
  const typeAIndex = spatialEntityTypeOrder.indexOf(a.properties.type);
  const typeBIndex = spatialEntityTypeOrder.indexOf(b.properties.type);
  if (typeAIndex !== typeBIndex) {
    if (typeAIndex === -1) return 1;
    if (typeBIndex === -1) return -1;
    return typeAIndex - typeBIndex;
  }

  if ("category" in a.properties && "category" in b.properties) {
    const categoryAIndex = spatialEntityCategoryOrder.indexOf(
      a.properties.category as string,
    );
    const categoryBIndex = spatialEntityCategoryOrder.indexOf(
      b.properties.category as string,
    );
    if (categoryAIndex !== categoryBIndex) {
      if (categoryAIndex === -1) return 1;
      if (categoryBIndex === -1) return -1;
      return categoryAIndex - categoryBIndex;
    }
  }

  const nameA = formatLangString(a.properties.name, "ja");
  const nameB = formatLangString(b.properties.name, "ja");
  return nameA.localeCompare(nameB, "ja", { numeric: true });
};

const rawSpatial = await getCollection("spatial");

const tempMap = new Map<
  string,
  {
    containedInPlace: string | undefined;
    containsPlace: Set<string>;
    isPartOf: Set<string>;
    hasPart: Set<string>;
    connectedTo: Set<string>;
    intersectsPlace: Set<string>;
  }
>();

for (const { data } of rawSpatial) {
  const p = data.properties;
  tempMap.set(data.id, {
    containedInPlace: p.containedInPlace,
    containsPlace: new Set(p.containsPlace ?? []),
    isPartOf: new Set(p.isPartOf ?? []),
    hasPart: new Set(p.hasPart ?? []),
    connectedTo: new Set(p.connectedTo ?? []),
    intersectsPlace: new Set(p.intersectsPlace ?? []),
  });
}

for (const { data } of rawSpatial) {
  const entityId = data.id;
  const p = data.properties;
  if (p.containedInPlace) {
    tempMap.get(p.containedInPlace)?.containsPlace.add(entityId);
  }
  for (const childId of p.containsPlace ?? []) {
    const child = tempMap.get(childId);
    if (child) child.containedInPlace = entityId;
  }
  for (const parentId of p.isPartOf ?? []) {
    tempMap.get(parentId)?.hasPart.add(entityId);
  }
  for (const childId of p.hasPart ?? []) {
    tempMap.get(childId)?.isPartOf.add(entityId);
  }
  for (const connId of p.connectedTo ?? []) {
    tempMap.get(connId)?.connectedTo.add(entityId);
  }
  for (const interId of p.intersectsPlace ?? []) {
    tempMap.get(interId)?.intersectsPlace.add(entityId);
  }

  if (p.type === "Storey") {
    const floorLevel = (p as Storey).floorLevel;
    const isBasement = floorLevel.startsWith("B");
    const floorLevelInt = Math.abs(
      Number.parseInt(floorLevel.match(/\d+/)?.[0] ?? "0", 10),
    );
    const ordinalFloorLevel = toOrdinal(floorLevelInt);

    p.name ??= {
      ja: isBasement ? `地下${floorLevelInt}階` : `${floorLevelInt}階`,
      en: isBasement
        ? `Basement ${ordinalFloorLevel} Floor`
        : `${ordinalFloorLevel} Floor`,
    };
  }
}

const baseDataMap = new Map<string, RawSpatialEntity>();
const linkedMap = new Map<string, LinkedSpatialEntity>();

for (const { data } of rawSpatial) {
  const adj = tempMap.get(data.id);
  if (!adj) continue;
  const raw: RawSpatialEntity = {
    ...data,
    properties: {
      ...data.properties,
      containedInPlace: adj.containedInPlace,
      containsPlace: Array.from(adj.containsPlace),
      isPartOf: Array.from(adj.isPartOf),
      hasPart: Array.from(adj.hasPart),
      connectedTo: Array.from(adj.connectedTo),
      intersectsPlace: Array.from(adj.intersectsPlace),
    },
  };
  baseDataMap.set(data.id, raw);
  linkedMap.set(data.id, {
    ...raw,
    properties: {
      ...raw.properties,
      containsPlace: [],
      isPartOf: [],
      hasPart: [],
      connectedTo: [],
      intersectsPlace: [],
      managedBy: [],
    },
  } as LinkedSpatialEntity);
}

for (const data of baseDataMap.values()) {
  const p = data.properties;
  if (p.type === "Storey") {
    if (!data.geometry) {
      const relatedGeometries: GeoJSON.Feature[] = [];
      for (const spatialId of [
        ...(p.containsPlace || []),
        ...(p.intersectsPlace || []),
      ]) {
        const feature = rawSpatial.find((e) => e.data.id === spatialId);
        if (feature?.data.geometry) {
          const geometryType = (feature.data.geometry as GeoJSON.Geometry).type;
          if (geometryType !== "Polygon" && geometryType !== "MultiPolygon")
            continue;
          relatedGeometries.push(feature.data as unknown as GeoJSON.Feature);
        }
      }
      if (relatedGeometries.length === 1) {
        data.geometry = relatedGeometries[0].geometry;
      } else if (relatedGeometries.length > 1) {
        const merged = union(
          featureCollection(relatedGeometries) as GeoJSON.FeatureCollection<
            GeoJSON.Polygon | GeoJSON.MultiPolygon
          >,
        );
        if (merged) {
          // // 小さい穴を除去
          // if (merged.geometry.type === "Polygon") {
          //   merged.geometry.coordinates = merged.geometry.coordinates.filter(
          //     (ring) => {
          //       const ringPolygon = polygon([ring]);
          //       return area(ringPolygon) >= 0.1;
          //     },
          //   );
          // } else if (merged.geometry.type === "MultiPolygon") {
          //   merged.geometry.coordinates = merged.geometry.coordinates.map(
          //     (polygonCoords) =>
          //       polygonCoords.filter((ring) => {
          //         const ringPolygon = polygon([ring]);
          //         return area(ringPolygon) >= 0.5; // 0.5㎡未満の穴を除去
          //       }),
          //   );
          // }
          data.geometry = merged.geometry;
        }
      }
    }
  }
  if (data.geometry) {
    data.hasGeometry ??= {};
    data.hasGeometry.asWKT ??= geoJSONToWkt(data.geometry as GeoJSON.Geometry);
  }
}

for (const [id, linked] of linkedMap) {
  const base = baseDataMap.get(id);

  const resolve = (id?: string) => {
    if (!id) return;
    const target = linkedMap.get(id);
    if (!target) {
      console.log(linkedMap);
      console.warn(
        `Warning: SpatialEntity [${id}] referenced by [${linked.id}] not found.`,
      );
    }
    return target;
  };

  linked.properties.containedInPlace = resolve(
    base?.properties.containedInPlace,
  );

  linked.properties.containsPlace =
    base?.properties.containsPlace
      ?.map(resolve)
      .filter((e): e is LinkedSpatialEntity => !!e)
      .sort(spatialEntitySorter) ?? [];

  linked.properties.isPartOf =
    base?.properties.isPartOf
      ?.map(resolve)
      .filter((e): e is LinkedSpatialEntity => !!e)
      .sort(spatialEntitySorter) ?? [];

  linked.properties.hasPart =
    base?.properties.hasPart
      ?.map(resolve)
      .filter((e): e is LinkedSpatialEntity => !!e)
      .sort(spatialEntitySorter) ?? [];

  linked.properties.connectedTo =
    base?.properties.connectedTo
      ?.map(resolve)
      .filter((e): e is LinkedSpatialEntity => !!e)
      .sort(spatialEntitySorter) ?? [];

  linked.properties.intersectsPlace =
    base?.properties.intersectsPlace
      ?.map(resolve)
      .filter((e): e is LinkedSpatialEntity => !!e)
      .sort(spatialEntitySorter) ?? [];
}

export const _spatialMap = baseDataMap;
export const _linkedSpatialMap = linkedMap;
