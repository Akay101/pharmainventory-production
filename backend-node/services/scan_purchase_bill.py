#!/usr/bin/env python3
import sys
import json
import base64
import asyncio
import re

from google import genai
from google.genai import types


def scan_bill_with_google(image_paths: list, api_key: str):
    client = genai.Client(api_key=api_key)

    prompt = """
You are analyzing a PHARMACY PURCHASE BILL (wholesale invoice). The user has provided one or multiple images of the SAME invoice (multiple pages or portions).

Extract ALL structured data by combining details visible across the multiple images.

CRITICAL INSTRUCTIONS FOR MISSING DATA:
If "manufacturer" or "salt_composition" are NOT visible for any item, you MUST use your own internal medical knowledge to autofill them based on the "product_name". Do not leave them empty if you recognize the product!

Return ONLY valid JSON in this format:

{
  "supplier_name": "",
  "supplier_gst": "",
  "invoice_no": "",
  "invoice_date": "YYYY-MM-DD",
  "items": [
    {
      "product_name": "",
      "manufacturer": "MUST autofill from internal knowledge if not visible",
      "salt_composition": "MUST autofill from internal knowledge if not visible",
      "batch_no": "",
      "expiry_date": "strictly YYYY-MM-DD (use last day of month if only MM/YY is given)",
      "hsn_no": "",
      "mrp": 0,
      "rate_pack": 0,
      "discount_percent": 0,
      "gst_percent": 0,
      "quantity": 0,
      "amount": 0
    }
  ],
  "subtotal": 0,
  "total_gst": 0,
  "grand_total": 0
}

Rules:
- Extract ALL rows from the table
- Quantity should be numeric
- If GST split into SGST/CGST combine them
- Convert numbers to numeric format (no ₹ symbol)
- Return ONLY JSON
"""

    contents = [prompt]
    for image_path in image_paths:
        with open(image_path, "rb") as f:
            contents.append(
                types.Part.from_bytes(
                    data=f.read(),
                    mime_type="image/png"
                )
            )

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=contents
    )

    return response.text


def parse_json(response_text):
    match = re.search(r"\{[\s\S]*\}", response_text)
    if not match:
        return {"success": False, "error": "Could not parse JSON"}

    data = json.loads(match.group(0))
    return {"success": True, "purchase_data": data}


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Usage: scan_purchase_bill.py <api_key> <image_path1> [image_path2...]"}))
        sys.exit(1)

    api_key = sys.argv[1]
    image_paths = sys.argv[2:]

    try:
        response_text = scan_bill_with_google(image_paths, api_key)
        result = parse_json(response_text)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))