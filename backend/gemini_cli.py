import argparse
import json
import os
import sys
from urllib import error, parse, request


def extract_text(response_data: dict) -> str:
    candidates = response_data.get("candidates", [])
    text_chunks: list[str] = []

    for candidate in candidates:
        content = candidate.get("content", {})
        parts = content.get("parts", [])
        for part in parts:
            text = part.get("text")
            if isinstance(text, str) and text.strip():
                text_chunks.append(text)

    if text_chunks:
        return "\n".join(text_chunks)

    # Fallback: return full JSON so you can inspect non-text responses.
    return json.dumps(response_data, ensure_ascii=False, indent=2)


def call_gemini(
    api_key: str,
    prompt: str,
    model: str,
    system: str | None,
    temperature: float,
    max_output_tokens: int,
) -> str:
    endpoint = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    )
    url = f"{endpoint}?{parse.urlencode({'key': api_key})}"

    payload: dict = {
        "contents": [
            {
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_output_tokens,
        },
    }

    if system:
        payload["systemInstruction"] = {
            "parts": [{"text": system}],
        }

    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gemini API HTTP {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Network error: {exc}") from exc

    response_data = json.loads(body)
    return extract_text(response_data)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Send a prompt to Gemini and print the response."
    )
    parser.add_argument("prompt", nargs="?", help="Prompt text to send to Gemini")
    parser.add_argument(
        "--model",
        default="gemini-2.0-flash",
        help="Gemini model name (default: gemini-2.0-flash)",
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
    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        print("Error: GEMINI_API_KEY is not set.", file=sys.stderr)
        print(
            "Set it first, e.g. PowerShell: $env:GEMINI_API_KEY='your_api_key'",
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
        output = call_gemini(
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
