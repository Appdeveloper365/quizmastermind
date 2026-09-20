import os
from openai import OpenAI

# Initialize the OpenAI client (Ensure your OPENAI_API_KEY environment variable is set)
client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY")
)

# Define the optimized prompt for the app logo
prompt_text = (
    "A 3D app icon logo of a quizmaster who looks like Albert Einstein with wild white hair "
    "and a mustache. He is smiling warmly, wearing a neat suit and a bow tie. The design "
    "is centered on a clean, solid gradient background, suitable for a mobile app icon. "
    "Vibrant colors, smooth 3D textures, clean lines, high contrast, minimalist yet detailed."
)

# Call the DALL-E 3 API to generate the image
response = client.images.generate(
    model="dall-e-3",
    prompt=prompt_text,
    n=1,
    size="1024x1024",  # DALL-E 3 standard 1:1 square resolution
    quality="standard",
    response_format="url"
)

# Print the URL of the generated image
image_url = response.data[0].url
print(f"Generated App Logo URL: {image_url}")
