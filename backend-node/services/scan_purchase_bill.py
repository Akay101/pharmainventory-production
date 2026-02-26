#!/usr/bin/env python3
import sys
import json
import base64
import asyncio
import re

from google import genai
from google.genai import types


def scan_bill_with_google(image_path: str, api_key: str):
    client = genai.Client(api_key=api_key)

    with open(image_path, "rb") as f:
        image_bytes = f.read()

    prompt = """
You are analyzing a PHARMACY PURCHASE BILL (wholesale invoice).

Extract ALL structured data.

Return ONLY valid JSON in this format:

{
  "supplier_name": "",
  "supplier_gst": "",
  "invoice_no": "",
  "invoice_date": "YYYY-MM-DD",
  "items": [
    {
      "product_name": "",
      "batch_no": "",
      "expiry_date": "MM/YY or YYYY-MM-DD",
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

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[
            prompt,
            types.Part.from_bytes(
                data=image_bytes,
                mime_type="image/png"
            )
        ]
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
        print(json.dumps({"success": False}))
        sys.exit(1)

    image_path = sys.argv[1]
    api_key = sys.argv[2]

    try:
        response_text = scan_bill_with_google(image_path, api_key)
        result = parse_json(response_text)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))