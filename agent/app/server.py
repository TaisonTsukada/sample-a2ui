import logging
import re
from typing import Any

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google.genai import types

from a2ui.core.parser.parser import parse_response, has_a2ui_parts
from .agent import runner, USER_ID

logger = logging.getLogger(__name__)

app = FastAPI(title="Sample A2UI Todo Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"


class ChatResponse(BaseModel):
    text: str
    messages: list[Any]


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    app_name = runner.app_name

    session = await runner.session_service.get_session(
        app_name=app_name,
        user_id=USER_ID,
        session_id=request.session_id,
    )
    if session is None:
        session = await runner.session_service.create_session(
            app_name=app_name,
            user_id=USER_ID,
            session_id=request.session_id,
        )

    new_message = types.Content(
        role="user",
        parts=[types.Part.from_text(text=request.message)],
    )

    final_response_text = ""

    try:
        async for event in runner.run_async(
            user_id=USER_ID,
            session_id=session.id,
            new_message=new_message,
        ):
            if event.is_final_response():
                if event.content and event.content.parts:
                    final_response_text = "\n".join(
                        p.text for p in event.content.parts if p.text
                    )
                break
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    logger.info("Final response: %s", final_response_text[:300])

    a2ui_messages: list[Any] = []
    plain_text = final_response_text

    if has_a2ui_parts(final_response_text):
        try:
            parts = parse_response(final_response_text)
            for part in parts:
                if part.a2ui_json:
                    if isinstance(part.a2ui_json, list):
                        a2ui_messages.extend(part.a2ui_json)
                    else:
                        a2ui_messages.append(part.a2ui_json)
            # Strip <a2ui-json> blocks from the displayed text
            plain_text = re.sub(
                r"<a2ui-json>.*?</a2ui-json>", "", final_response_text, flags=re.DOTALL
            ).strip()
        except Exception as e:
            logger.warning("Failed to parse A2UI response: %s", e)

    return ChatResponse(text=plain_text, messages=a2ui_messages)
