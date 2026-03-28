import argparse
import os
import sys
from openrouter_cli import call_openrouter


def call_mistral(
    api_key: str,
    prompt: str,
    model: str,
    system: str | None,
    temperature: float,
    max_output_tokens: int,
) -> str:
    # Backward-compatible alias: keep existing imports working while using OpenRouter.
    return call_openrouter(
        api_key=api_key,
        prompt=prompt,
        model=model,
        system=system,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Send a prompt to OpenRouter and print the response."
    )
    parser.add_argument("prompt", nargs="?", help="Prompt text to send to OpenRouter")
    parser.add_argument(
        "--model",
        default="openrouter/auto",
        help="OpenRouter model name (default: openrouter/auto)",
    )
    parser.add_argument(
        "--system",
        default=None,
        help="Optional system instruction",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.7,
        help="Sampling temperature (default: 0.7)",
    )
    parser.add_argument(
        "--max-output-tokens",
        type=int,
        default=1024,
        help="Maximum output tokens (default: 1024)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    api_key = os.getenv("OPENROUTER_API_KEY")

    if not api_key:
        print("Error: OPENROUTER_API_KEY is not set.", file=sys.stderr)
        print(
            "Set it first, e.g. PowerShell: $env:OPENROUTER_API_KEY='your_api_key'",
            file=sys.stderr,
        )
        return 1

    prompt = args.prompt
    if not prompt:
        if sys.stdin.isatty():
            print("Error: Please pass a prompt argument or pipe text via stdin.", file=sys.stderr)
            return 1
        prompt = sys.stdin.read().strip()

    if not prompt:
        print("Error: Prompt is empty.", file=sys.stderr)
        return 1

    try:
        output = call_mistral(
            api_key=api_key,
            prompt=prompt,
            model=args.model,
            system=args.system,
            temperature=args.temperature,
            max_output_tokens=args.max_output_tokens,
        )
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())