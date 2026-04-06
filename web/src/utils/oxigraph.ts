import init, {
  BlankNode,
  blankNode,
  DefaultGraph,
  defaultGraph,
  Literal,
  literal,
  NamedNode,
  namedNode,
  Quad,
  type Quad_Predicate,
  type Quad_Subject,
  quad,
  Store,
  Variable,
} from "oxigraph/web";

let initialized = false;

export async function initOxigraph() {
  if (!initialized) {
    if (import.meta.env.SSR) {
      // @ts-expect-error
      const wasm = await import("oxigraph/web_bg.wasm?module");
      await init({ module_or_path: wasm.default });
    } else {
      await init();
    }
    initialized = true;
  }
}

export {
  BlankNode,
  blankNode,
  DefaultGraph,
  defaultGraph,
  Literal,
  literal,
  NamedNode,
  namedNode,
  Quad,
  type Quad_Predicate,
  type Quad_Subject,
  quad,
  Store,
  Variable,
};
