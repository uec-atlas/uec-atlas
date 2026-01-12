import sys
import json
from linkml.generators.jsonldcontextgen import ContextGenerator

def main():
    if len(sys.argv) < 2:
        sys.exit(1)

    yaml_file = sys.argv[1]
    gen = ContextGenerator(yaml_file, useuris=True)
    schema = gen.schema

    slot_containers = {}
    slot_id_overrides = {}

    all_slots = {**schema.slots}
    for cls in schema.classes.values():
        for slot in cls.attributes.values():
            all_slots[slot.name] = slot

    for slot_name, slot in all_slots.items():
        container = None
        if slot.range in schema.classes:
            cls = schema.classes[slot.range]
            if "jsonld_container" in cls.annotations:
                container = str(cls.annotations["jsonld_container"].value)

        if "jsonld_container" in slot.annotations:
            container = str(slot.annotations["jsonld_container"].value)

        if container:
            slot_containers[slot_name] = container

        if "jsonld_id" in slot.annotations:
            slot_id_overrides[slot_name] = str(
                slot.annotations["jsonld_id"].value)

    context = json.loads(gen.serialize())
    ctx = context["@context"]
    ctx["@version"] = 1.1

    for key, value in ctx.items():
        if key in slot_id_overrides:
            ctx[key] = slot_id_overrides[key]
            continue
        if not isinstance(value, dict):
            continue
        if key in slot_containers:
            value.pop("@type", None)
            value["@container"] = slot_containers[key]

    print(json.dumps(context, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
