SCHEMA_DIR = schema
GEN_DIR = generated
TS_GEN_DIR = web/generated
SOURCES = $(wildcard $(SCHEMA_DIR)/*.yaml)
JSONLD_CONTEXT_TARGETS = $(patsubst $(SCHEMA_DIR)/%.yaml, $(GEN_DIR)/%.context.jsonld, $(SOURCES))
JSONLD_FRAME_TARGETS = $(patsubst $(SCHEMA_DIR)/%.yaml, $(GEN_DIR)/%.frame.jsonld, $(SOURCES))
JSON_SCHEMA_TARGETS = $(patsubst $(SCHEMA_DIR)/%.yaml, $(GEN_DIR)/%.schema.json, $(SOURCES))
OWL_TARGETS = $(patsubst $(SCHEMA_DIR)/%.yaml, $(GEN_DIR)/%.ttl, $(SOURCES))
TS_TARGETS = $(patsubst $(SCHEMA_DIR)/%.yaml, $(TS_GEN_DIR)/%.ts, $(SOURCES))
GRAPHQL_TARGETS = $(patsubst $(SCHEMA_DIR)/%.yaml, $(GEN_DIR)/%.graphql, $(SOURCES))
ONTOLOGY_MAP_TARGET = $(GEN_DIR)/ontology_map.json
ONTOLOGY_DOCS_TARGET = $(TS_GEN_DIR)/ontology_docs.json

GEN_JSONLD = python3 scripts/gen_jsonld_context.py
GEN_FRAME = python3 scripts/gen_jsonld_frame.py
GEN_JSON_SCHEMA = python3 scripts/gen_json_schema.py
GEN_TYPESCRIPT = python3 scripts/gen_typescript.py
GEN_ONTOLOGY_MAP = python3 scripts/gen_ontology_map.py
GEN_ONTOLOGY_DOCS = python3 scripts/gen_ontology_docs.py

.PHONY: all clean setup

all: $(JSONLD_CONTEXT_TARGETS) $(JSONLD_FRAME_TARGETS) $(JSON_SCHEMA_TARGETS) $(OWL_TARGETS) $(TS_TARGETS) $(GRAPHQL_TARGETS) $(ONTOLOGY_MAP_TARGET) $(ONTOLOGY_DOCS_TARGET)

setup:
	python3 -m venv .venv
	pip install -r requirements.txt

$(JSONLD_CONTEXT_TARGETS): $(SCHEMA_DIR)/common.yaml
$(JSON_SCHEMA_TARGETS): $(SCHEMA_DIR)/common.yaml

.venv:
	$(MAKE) setup

# schema/*.yaml -> generated/*.context.jsonld
$(GEN_DIR)/%.context.jsonld: $(SCHEMA_DIR)/%.yaml
	@mkdir -p $(GEN_DIR)
	@$(GEN_JSONLD) $< > $@

# schema/*.yaml -> generated/*.frame.jsonld
$(GEN_DIR)/%.frame.jsonld: $(SCHEMA_DIR)/%.yaml
	@mkdir -p $(GEN_DIR)
	@$(GEN_FRAME) $< > $@

# schema/*.yaml -> generated/*.schema.json
$(GEN_DIR)/%.schema.json: $(SCHEMA_DIR)/%.yaml
	@mkdir -p $(GEN_DIR)
	@$(GEN_JSON_SCHEMA) $< > $@

# schema/*.yaml -> generated/*.ttl
$(GEN_DIR)/%.ttl: $(SCHEMA_DIR)/%.yaml
	@mkdir -p $(GEN_DIR)
	gen-owl --no-use-native-uris $< > $@

# schema/*.yaml -> web/generated/*.ts
$(TS_GEN_DIR)/%.ts: $(SCHEMA_DIR)/%.yaml
	@mkdir -p $(TS_GEN_DIR)
	@$(GEN_TYPESCRIPT) $< > $@

# schema/*.yaml -> generated/*.graphql
$(GEN_DIR)/%.graphql: $(SCHEMA_DIR)/%.yaml
	@mkdir -p $(GEN_DIR)
	gen-graphql $< > $@

$(GEN_DIR)/ontology_map.json: $(SCHEMA_DIR)
	@mkdir -p $(GEN_DIR)
	$(GEN_ONTOLOGY_MAP) $(SCHEMA_DIR) > $@

$(ONTOLOGY_DOCS_TARGET): $(SCHEMA_DIR) scripts/gen_ontology_docs.py
	@mkdir -p $(TS_GEN_DIR)
	$(GEN_ONTOLOGY_DOCS) $(SCHEMA_DIR) > $@

clean:
	rm -rf $(GEN_DIR)
	rm -rf $(TS_GEN_DIR)
