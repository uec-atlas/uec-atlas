import sys
import json
import yaml
import os
from linkml_runtime.utils.schemaview import SchemaView
from linkml_runtime.linkml_model.meta import ClassDefinition, SlotDefinition


def get_slot_info(view: SchemaView, class_name: str, slot_name: str):
    induced_slot = view.induced_slot(slot_name, class_name)

    # Determine where it's inherited from
    inherited_from = None
    for ancestor in view.class_ancestors(class_name):
        if ancestor == class_name:
            continue
        ancestor_def = view.get_class(ancestor)
        if slot_name in ancestor_def.slots or slot_name in ancestor_def.attributes:
            inherited_from = ancestor
            break

    return {
        "name": induced_slot.name,
        "description": induced_slot.description,
        "range": induced_slot.range,
        "multivalued": induced_slot.multivalued,
        "inlined": induced_slot.inlined,
        "inlined_as_list": induced_slot.inlined_as_list,
        "required": induced_slot.required,
        "inherited_from": inherited_from,
        "slot_uri": view.get_uri(induced_slot)
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python gen_ontology_docs.py <schema_dir>")
        sys.exit(1)

    schema_dir = sys.argv[1]

    # We want to collect all classes across all schemas
    all_docs = {
        "classes": {},
        "slots": {}
    }

    # Find all yaml files in the schema dir
    yaml_files = [os.path.join(schema_dir, f)
                  for f in os.listdir(schema_dir) if f.endswith('.yaml')]

    # Mixin all patterns and classes
    for yaml_file in yaml_files:
        view = SchemaView(yaml_file)

        # Process classes
        for cls_name, cls_def in view.all_classes().items():
            if cls_name == "linkml:Any" or cls_name == "Any":
                continue

            if cls_name in all_docs["classes"]:
                continue

            slots = []
            for slot_name in view.class_slots(cls_name):
                slot_info = get_slot_info(view, cls_name, slot_name)
                slots.append(slot_info)

                # Track usages
                if slot_name not in all_docs["slots"]:
                    slot_def = view.get_slot(slot_name)
                    all_docs["slots"][slot_name] = {
                        "name": slot_name,
                        "description": slot_def.description if slot_def else None,
                        "slot_uri": view.get_uri(slot_def) if slot_def else None,
                        "range": slot_def.range if slot_def else None,
                        "multivalued": slot_def.multivalued if slot_def else None,
                        "inlined": slot_def.inlined if slot_def else None,
                        "inlined_as_list": slot_def.inlined_as_list if slot_def else None,
                        "required": slot_def.required if slot_def else None,
                        "usages": []
                    }

                all_docs["slots"][slot_name]["usages"].append({
                    "class": cls_name,
                    "range": slot_info["range"],
                    "multivalued": slot_info["multivalued"],
                    "inlined": slot_info["inlined"],
                    "inlined_as_list": slot_info["inlined_as_list"],
                    "required": slot_info["required"],
                    "description": slot_info["description"]
                })

            all_docs["classes"][cls_name] = {
                "name": cls_name,
                "description": cls_def.description,
                "class_uri": view.get_uri(cls_def),
                "is_a": cls_def.is_a,
                "mixins": cls_def.mixins,
                "slots": slots,
                "abstract": cls_def.abstract,
                "tree_root": cls_def.tree_root,
                "children": view.class_children(cls_name)
            }

        # Process slots (global)
        for slot_name, slot_def in view.all_slots().items():
            if slot_name in all_docs["slots"]:
                # Already added from class usage, just ensure basic info is there
                if not all_docs["slots"][slot_name].get("description"):
                    all_docs["slots"][slot_name]["description"] = slot_def.description
                if not all_docs["slots"][slot_name].get("slot_uri"):
                    all_docs["slots"][slot_name]["slot_uri"] = view.get_uri(
                        slot_def)
                continue

            all_docs["slots"][slot_name] = {
                "name": slot_name,
                "description": slot_def.description,
                "range": slot_def.range,
                "multivalued": slot_def.multivalued,
                "inlined_as_list": slot_def.inlined_as_list,
                "required": slot_def.required,
                "slot_uri": view.get_uri(slot_def),
                "usages": []
            }

    print(json.dumps(all_docs, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
