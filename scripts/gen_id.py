import secrets


def generate_id(length: int = 8) -> str:
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    return "".join(secrets.choice(alphabet) for _ in range(length))


new_id = generate_id()
print(new_id)
