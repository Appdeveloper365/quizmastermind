import os
import sys
import argparse
import logging
from datetime import datetime, timezone
from openai import OpenAI
import requests

LOG_FILE = "logo_generation.log"
DEFAULT_OUTPUT = os.path.join("public", "app_logo.png")


def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
        handlers=[
            logging.FileHandler(LOG_FILE, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )


def main():
    setup_logging()
    logger = logging.getLogger(__name__)

    parser = argparse.ArgumentParser(
        description="Generate a 3D Einstein Quizmaster App Logo using DALL-E 3."
    )
    parser.add_argument(
        "-o",
        "--output",
        type=str,
        default=DEFAULT_OUTPUT,
        help=f"Path and filename where the generated logo should be saved (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--bg-color",
        type=str,
        default="solid gradient",
        help="Background style or color for the app icon (default: 'solid gradient')",
    )
    parser.add_argument(
        "--api-key",
        type=str,
        default=None,
        help="OpenAI API key. If not provided, the OPENAI_API_KEY environment variable is used.",
    )
    parser.add_argument(
        "--prompt",
        type=str,
        default=None,
        help="Optional custom prompt. If provided, it overrides the default Einstein Quizmaster prompt.",
    )

    args = parser.parse_args()

    api_key = args.api_key or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        msg = "ERROR: 'OPENAI_API_KEY' environment variable is not set and no --api-key was provided."
        logger.error(msg)
        sys.exit(1)

    client = OpenAI(api_key=api_key)

    default_prompt = (
        "A 3D app icon logo of a quizmaster who looks like Albert Einstein with wild white hair "
        "and a mustache. He is smiling warmly, wearing a neat suit and a bow tie. The design "
        "is centered on a clean, solid gradient background, suitable for a mobile app icon. "
        "Vibrant colors, smooth 3D textures, clean lines, high contrast, minimalist yet detailed."
    )

    prompt_text = args.prompt or default_prompt

    logger.info("Sending prompt to DALL-E 3...")
    logger.info("Output image path: %s", os.path.abspath(args.output))
    logger.info("Prompt: %s", prompt_text)

    try:
        response = client.images.generate(
            model="dall-e-3",
            prompt=prompt_text,
            n=1,
            size="1024x1024",
            quality="standard",
            response_format="url",
        )

        image_url = response.data[0].url
        timestamp = datetime.now(timezone.utc).isoformat()
        output_abs = os.path.abspath(args.output)

        log_entry = (
            f"\n{'='*60}\n"
            f"GENERATION TIMESTAMP (UTC): {timestamp}\n"
            f"OUTPUT PATH: {output_abs}\n"
            f"MODEL: dall-e-3\n"
            f"SIZE: 1024x1024\n"
            f"PROMPT: {prompt_text}\n"
            f"IMAGE URL: {image_url}\n"
            f"{'='*60}\n"
        )

        with open(LOG_FILE, "a", encoding="utf-8") as log_f:
            log_f.write(log_entry)

        logger.info("Success! Image generated successfully.")
        logger.info("Image URL: %s", image_url)

        os.makedirs(os.path.dirname(output_abs) or ".", exist_ok=True)

        logger.info("Downloading image to: %s", output_abs)
        img_data = requests.get(image_url).content
        with open(output_abs, "wb") as handler:
            handler.write(img_data)

        logger.info("App logo successfully saved to %s", output_abs)

    except Exception as e:
        logger.error("API Execution Error: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
