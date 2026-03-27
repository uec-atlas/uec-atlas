from glob import glob
import json

id_list = []
conflicts = []


def validate_id(obj: dict | list):
    if isinstance(obj, list):
        for item in obj:
            if isinstance(item, dict):
                validate_id(item)
        return
    if isinstance(obj, dict):
        for value in obj.values():
            validate_id(value)
        if "id" in obj:
            if obj["id"] in id_list:
                conflicts.append(obj["id"])
            else:
                id_list.append(obj["id"])


for file in glob("data/**/*.json", recursive=True):
    with open(file, "r") as f:
        data = json.load(f)
        validate_id(data)

if conflicts:
    print("ID conflicts found:")
    for conflict in conflicts:
        print(conflict)

else:
    print("No ID conflicts found.")

print(f"Total unique IDs: {len(id_list)}")

if conflicts:
    exit(1)
