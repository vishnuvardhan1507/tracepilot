"""Run: python -m examples.research_agent [--provider openai]."""

import argparse, os, json, time
import httpx
from jsonschema import validate
from sdk.tracepilot import TracePilot


def run(provider="local"):
    sdk = TracePilot()
    with sdk.span("Research synthesis") as root:
        with sdk.span("Search local knowledge base", "retrieval", root) as search:
            references = [
                {"id": "doc-1", "text": "Spans record operation boundaries."},
                {"id": "doc-2", "text": "Trace IDs correlate related work."},
            ]
            search["attributes"]["documents_found"] = len(references)
        with sdk.span("Read references", "tool", root) as tool:
            tool["attributes"]["references"] = [r["id"] for r in references]
        with sdk.span(
            "Synthesize response",
            "llm",
            root,
            model=(
                "local/research-v1"
                if provider == "local"
                else os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
            ),
            provider="Local simulator" if provider == "local" else "OpenAI",
        ) as llm:
            if provider == "local":
                answer = {
                    "summary": "Traces group spans into a complete execution.",
                    "citations": ["doc-1", "doc-2"],
                }
                llm.update(input_tokens=32, output_tokens=18)
                llm["attributes"]["simulated"] = True
                llm["attributes"][
                    "usage_method"
                ] = "Deterministic fixture token counts, not tokenizer measurements"
            else:
                response = httpx.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": "Bearer " + os.environ["OPENAI_API_KEY"]},
                    json={
                        "model": llm["model"],
                        "messages": [
                            {
                                "role": "user",
                                "content": "Summarize these documents as JSON with summary and citations: "
                                + json.dumps(references),
                            }
                        ],
                        "response_format": {"type": "json_object"},
                    },
                    timeout=60,
                )
                response.raise_for_status()
                result = response.json()
                answer = json.loads(result["choices"][0]["message"]["content"])
                llm.update(
                    input_tokens=result["usage"]["prompt_tokens"],
                    output_tokens=result["usage"]["completion_tokens"],
                )
            validate(
                answer,
                {
                    "type": "object",
                    "required": ["summary", "citations"],
                    "properties": {
                        "summary": {"type": "string"},
                        "citations": {"type": "array", "items": {"type": "string"}},
                    },
                },
            )
        root["attributes"].update(
            citation_count=len(answer["citations"]),
            schema_valid=True,
            tools_completed=True,
            simulated=provider == "local",
        )
    print("Trace emitted:", root["trace_id"])
    print(answer)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", choices=["local", "openai"], default="local")
    run(parser.parse_args().provider)
