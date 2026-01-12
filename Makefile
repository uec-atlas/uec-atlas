SCHEMA_DIR = schema
GEN_DIR = generated
TS_GEN_DIR = web/generated
SOURCES = $(wildcard $(SCHEMA_DIR)/*.yaml)
JSONLD_CONTEXT_TARGETS = $(patsubst $(SCHEMA_DIR)/%.yaml, $(GEN_DIR)/%.context.jsonld, $(SOURCES))
JSON_SCHEMA_TARGETS = $(patsubst $(SCHEMA_DIR)/%.yaml, $(GEN_DIR)/%.schema.json, $(SOURCES))
TS_TARGETS = $(patsubst $(SCHEMA_DIR)/%.yaml, $(TS_GEN_DIR)/%.ts, $(SOURCES))
GRAPHQL_TARGETS = $(patsubst $(SCHEMA_DIR)/%.yaml, $(GEN_DIR)/%.graphql, $(SOURCES))

GEN_JSONLD = python3 scripts/gen_jsonld_context.py

.PHONY: all clean setup

all: $(JSONLD_CONTEXT_TARGETS) $(JSON_SCHEMA_TARGETS) $(TS_TARGETS) $(GRAPHQL_TARGETS)

setup:
	python3 -m venv .venv
	pip install -r requirements.txt

$(JSONLD_CONTEXT_TARGETS): $(SCHEMA_DIR)/common.yaml .venv
$(JSON_SCHEMA_TARGETS): $(SCHEMA_DIR)/common.yaml .venv

.venv:
	$(MAKE) setup

# schema/*.yaml -> generated/*.context.jsonld
$(GEN_DIR)/%.context.jsonld: $(SCHEMA_DIR)/%.yaml
	@mkdir -p $(GEN_DIR)
	@$(GEN_JSONLD) $< > $@

# schema/*.yaml -> generated/*.schema.json
$(GEN_DIR)/%.schema.json: $(SCHEMA_DIR)/%.yaml
	@mkdir -p $(GEN_DIR)
	gen-json-schema $< > $@

# schema/*.yaml -> web/generated/*.ts
$(TS_GEN_DIR)/%.ts: $(SCHEMA_DIR)/%.yaml
	@mkdir -p $(TS_GEN_DIR)
	gen-typescript $< > $@

# schema/*.yaml -> generated/*.graphql
$(GEN_DIR)/%.graphql: $(SCHEMA_DIR)/%.yaml
	@mkdir -p $(GEN_DIR)
	gen-graphql $< > $@

clean:
	rm -rf $(GEN_DIR)
