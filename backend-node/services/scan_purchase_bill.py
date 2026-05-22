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
    
    # Restoring the High-Accuracy Prompt
    prompt = """Analyze this pharmaceutical purchase invoice image. 
Your goal is to extract EVERY item line-by-line from the table.

### EXTRACTION STRATEGY:
1. **IDENTIFY HEADERS**: First, locate the table header row. Look for terms like 'Description', 'Product', 'Qty', 'Batch', 'MRP', 'Rate', 'PTR', 'Exp', 'HSN'.
2. **MAP COLUMNS**: Map the data columns based on the discovered headers. 
3. **LOGICAL VALIDATION**:
   - **MRP vs RATE**: MRP is ALWAYS higher than the Rate (PTR). Never swap them.
   - **QTY vs PACK**: 'Qty' is the number of units purchased. 'Pack' is the unit size (e.g., 10s, 15s). Do not use 'Pack' as 'Qty'.
   - **NAME**: The Product Name is usually the most descriptive text in the row.

### CRITICAL RULES:
1. **NO HALLUCINATIONS**: Extract EXACTLY what is printed. Do not guess or suggest similar medicine names. If it says "SOFTVAC", do not return "NOFIVAC".
2. **ROW INTEGRITY**: Each JSON item must represent one single line from the printed table. Do not skip rows or merge items.
3. **MISSING HEADERS**: If headers are missing or unreadable, use common sense: HSN is 8 digits, Batch is alphanumeric, Expiry is MM/YY, MRP > Rate.
4. **STITCHING**: Combine Manufacturer and Salt Composition from your internal knowledge if they aren't explicitly printed in the row.
"""

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

    final_result = {
        "supplier_name": "",
        "invoice_no": "",
        "confidence": 0,
        "items": []
    }

    confidences = []

    for index, url in enumerate(image_urls):
        image_data = None
        mime_type = "image/webp"
        
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response:
                image_data = response.read()
                url_lower = url.lower()
                if url_lower.endswith(".jpg") or url_lower.endswith(".jpeg"):
                    mime_type = "image/jpeg"
                elif url_lower.endswith(".png"):
                    mime_type = "image/png"
        except Exception as e:
            print(f"Failed to download image {index+1}: {str(e)}", file=sys.stderr)
            continue

        if not image_data:
            continue

        # Process this specific page
        page_success = False
        for attempt in range(max_retries + 1):
            try:
                response = client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=[
                        prompt,
                        types.Part.from_bytes(data=image_data, mime_type=mime_type)
                    ],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=schema
                    )
                )
                
                data = json.loads(response.text)
                if isinstance(data, list):
                    data = data[0] if len(data) > 0 else {}
                
                # Merge data
                if not final_result["supplier_name"]:
                    final_result["supplier_name"] = data.get("supplier_name", "")
                if not final_result["invoice_no"]:
                    final_result["invoice_no"] = data.get("invoice_no", "")
                
                final_result["items"].extend(data.get("items", []))
                confidences.append(data.get("confidence", 0))
                
                page_success = True
                break
            except Exception as e:
                if attempt == max_retries:
                    print(f"Failed to process page {index+1} after {max_retries} retries", file=sys.stderr)
                else:
                    time.sleep(2 * (attempt + 1))

    if not final_result["items"]:
        raise Exception("No items could be extracted from any of the provided images.")

    final_result["confidence"] = int(sum(confidences) / len(confidences)) if confidences else 0
    return final_result

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