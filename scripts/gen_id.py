import secrets


def generate_id(prefix: str = "", length: int = 8) -> str:
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    return f"{prefix}{''.join(secrets.choice(alphabet) for _ in range(length))}"


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--prefix")
    parser.add_argument("--count", type=int, default=1)
    args = parser.parse_args()
    for _ in range(args.count):
        new_id = generate_id(prefix=args.prefix or "")
        print(new_id)
