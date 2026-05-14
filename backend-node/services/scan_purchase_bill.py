#!/usr/bin/env python3
import sys
import json
import base64
import time
import os

from google import genai
from google.genai import types

import urllib.request

def scan_bill_with_google(image_urls: list, api_key: str, max_retries=2):
    client = genai.Client(api_key=api_key)

    prompt = """
You are an expert at analyzing pharmaceutical purchase invoices. You are provided with images of a multi-page bill.
Your goal is to extract EVERY SINGLE ITEM listed in the bill across ALL pages.

CRITICAL INSTRUCTIONS:
1. **Multi-page Awareness**: These images belong to the SAME bill. If Image 1 has items 1-16 and Image 2 has items 17-27, you MUST return a single list containing all 27 items.
2. **Row-by-Row Extraction**: Process the table meticulously. Do not skip any rows, even if they appear on different pages.
3. **Summary Verification**: Look for "No of Items", "Total Items", or a line count (e.g., "(27 Lines)") usually located in the summary section or footer. Ensure your extracted item count matches this number.
4. **Data Enrichment**: If "manufacturer" or "salt_composition" are not printed, use your pharmaceutical knowledge to autofill them based on the "product_name".
5. **Rules**:
   - Quantity should be numeric.
   - If GST is split (CGST/SGST), combine them into a single IGST percentage if possible, or just focus on extracting the items accurately.
   - Convert all numbers to numeric format (no ₹ symbols).
   - If no images are provided, return success: false.
"""

    contents = [prompt]
    for url in image_urls:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response:
                image_data = response.read()
                contents.append(
                    types.Part.from_bytes(
                        data=image_data,
                        mime_type="image/webp"
                    )
                )
        except Exception as e:
            print(f"Failed to download image from {url}. Error: {str(e)}", file=sys.stderr)

    if len(contents) <= 1:
        raise Exception(f"No images could be retrieved for processing. Tried: {', '.join(image_urls)}")

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