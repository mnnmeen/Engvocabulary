import json
from urllib import error, request


def _extract_text(response_data: dict) -> str:
    choices = response_data.get("choices", [])
    text_chunks: list[str] = []

    for choice in choices:
        message = choice.get("message", {})
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            text_chunks.append(content)
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict):
                    text = part.get("text")
                    if isinstance(text, str) and text.strip():
                        text_chunks.append(text)

    if text_chunks:
        return "\n".join(text_chunks)

    raise RuntimeError(
        "OpenRouter returned no final content. Raw response: "
        + json.dumps(response_data, ensure_ascii=False, indent=2)
    )


def call_openrouter(
    api_key: str,
    prompt: str,
    model: str,
    system: str | None,
    temperature: float,
    max_output_tokens: int,
    site_url: str | None = None,
    app_name: str | None = None,
) -> str:
    url = "https://openrouter.ai/api/v1/chat/completions"

    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_output_tokens,
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    if site_url:
        headers["HTTP-Referer"] = site_url
    if app_name:
        headers["X-Title"] = app_name

    data = json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=data, headers=headers, method="POST")

    try:
        with request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenRouter API HTTP {exc.code}: {detail}") from exc
    except TimeoutError as exc:
        raise RuntimeError("Network timeout: OpenRouter request timed out") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Network error: {exc}") from exc

    response_data = json.loads(body)
    return _extract_text(response_data)
