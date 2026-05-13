#!/usr/bin/env python3
import sys
import json
import base64
import time
import os

from google import genai
from google.genai import types

def scan_bill_with_google(image_paths: list, api_key: str, max_retries=2):
    client = genai.Client(api_key=api_key)

    prompt = """
You are analyzing a PHARMACY PURCHASE BILL (wholesale invoice). Extract ALL structured data by combining details visible across the multiple images.

CRITICAL INSTRUCTIONS FOR MISSING DATA:
If "manufacturer" or "salt_composition" are NOT visible for any item, you MUST use your own internal medical knowledge to autofill them based on the "product_name". Do not leave them empty if you recognize the product!

Rules:
- Extract ALL rows from the table
- Quantity should be numeric
- If GST split into SGST/CGST combine them
- Convert numbers to numeric format (no ₹ symbol)
"""

    contents = [prompt]
    for image_path in image_paths:
        if not os.path.exists(image_path):
            continue
        with open(image_path, "rb") as f:
            contents.append(
                types.Part.from_bytes(
                    data=f.read(),
                    mime_type="image/webp" if image_path.endswith(".webp") else "image/png"
                )
            )

    for attempt in range(max_retries + 1):
        try:
            schema = {
                "type": "OBJECT",
                "properties": {
                    "supplier_name": {"type": "STRING"},
                    "invoice_no": {"type": "STRING"},
                    "confidence": {"type": "INTEGER"},
                    "items": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "product_name": {"type": "STRING"},
                                "manufacturer": {"type": "STRING"},
                                "salt_composition": {"type": "STRING"},
                                "batch_no": {"type": "STRING"},
                                "expiry_date": {"type": "STRING"},
                                "quantity": {"type": "INTEGER"},
                                "rate_pack": {"type": "NUMBER"},
                                "mrp": {"type": "NUMBER"},
                                "hsn_no": {"type": "STRING"}
                            },
                            "required": ["product_name", "quantity", "rate_pack"]
                        }
                    }
                },
                "required": ["supplier_name", "items", "confidence"]
            }

            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=contents,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=schema
                )
            )
            
            data = json.loads(response.text)
            if isinstance(data, list):
                data = data[0] if len(data) > 0 else {}
            return data
        except Exception as e:
            if attempt == max_retries:
                raise e
            time.sleep(2 * (attempt + 1)) # Exponential backoff

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Usage: scan_purchase_bill.py <api_key> <image_path1> [image_path2...]", "error_category": "invalid_input"}))
        sys.exit(1)

    api_key = sys.argv[1]
    image_paths = sys.argv[2:]

    try:
        data = scan_bill_with_google(image_paths, api_key)
        print(json.dumps({"success": True, "purchase_data": data}))
    except Exception as e:
        error_msg = str(e)
        category = "gemini_error"
        if "quota" in error_msg.lower(): category = "rate_limit"
        elif "timeout" in error_msg.lower(): category = "timeout"
        
        print(json.dumps({"success": False, "error": error_msg, "error_category": category}))