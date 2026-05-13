#!/usr/bin/env python3
"""Helper script to scan medicine images using Gemini API with Structured Output."""
import sys
import json
import base64
import os
import time
from google import genai
from google.genai import types

def scan_image_with_google(image_paths: list, api_key: str, max_retries=2):
    client = genai.Client(api_key=api_key)

    prompt = """Analyze the provided medicine/pharmaceutical product images. These are images of the SAME single product from different angles. Extract the product information by combining details visible across the multiple images.

CRITICAL INSTRUCTIONS:
1. Extract: product_name, manufacturer, salt_composition, batch_no, expiry_date, mrp, pack_type, units_per_pack, hsn_no.
2. If "manufacturer" or "salt_composition" are NOT clearly visible, you MUST use your own medical knowledge to autofill them based on the "product_name".
3. Provide a "confidence" score (0-100) based on how clearly you can read the data.
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
                    "product_name": {"type": "STRING"},
                    "manufacturer": {"type": "STRING"},
                    "salt_composition": {"type": "STRING"},
                    "batch_no": {"type": "STRING"},
                    "expiry_date": {"type": "STRING"},
                    "mrp": {"type": "NUMBER"},
                    "pack_type": {"type": "STRING"},
                    "units_per_pack": {"type": "INTEGER"},
                    "hsn_no": {"type": "STRING"},
                    "pack_size": {"type": "STRING"},
                    "confidence": {"type": "INTEGER"}
                },
                "required": ["product_name", "manufacturer", "salt_composition", "mrp", "confidence"]
            }

            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=contents,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=schema
                )
            )
            
            scanned_data = json.loads(response.text)
            
            # If Gemini returns a list instead of an object (safety check)
            if isinstance(scanned_data, list):
                scanned_data = scanned_data[0] if len(scanned_data) > 0 else {}
            
            # Post-processing
            mrp = float(scanned_data.get('mrp') or 0)
            units_per_pack = int(scanned_data.get('units_per_pack') or 1)
            mrp_per_unit = round(mrp / units_per_pack, 2) if units_per_pack > 1 else mrp
            
            scanned_product = {
                'product_name': scanned_data.get('product_name') or '',
                'manufacturer': scanned_data.get('manufacturer') or '',
                'salt_composition': scanned_data.get('salt_composition') or scanned_data.get('composition') or '',
                'batch_no': scanned_data.get('batch_no') or '',
                'expiry_date': scanned_data.get('expiry_date') or '',
                'mrp': mrp,
                'mrp_pack': mrp,
                'pack_type': scanned_data.get('pack_type') or 'Strip',
                'units_per_pack': units_per_pack,
                'hsn_no': scanned_data.get('hsn_no') or '',
                'pack_size': scanned_data.get('pack_size') or '',
                'confidence': scanned_data.get('confidence') or 75,
                'quantity': 1,
                'rate_pack': 0,
                'purchase_price': 0,
                'mrp_per_unit': mrp_per_unit
            }
            
            return {
                'success': True,
                'scanned_product': scanned_product,
                'scanned_data': scanned_data
            }
        except Exception as e:
            if attempt == max_retries:
                raise e
            time.sleep(2 * (attempt + 1))

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Usage: scan_helper.py <api_key> <image_path1> [image_path2...]", "error_category": "invalid_input"}))
        sys.exit(1)
    
    api_key = sys.argv[1]
    image_paths = sys.argv[2:]
    
    try:
        result = scan_image_with_google(image_paths, api_key)
        print(json.dumps(result))
    except Exception as e:
        error_msg = str(e)
        category = "gemini_error"
        if "quota" in error_msg.lower(): category = "rate_limit"
        elif "timeout" in error_msg.lower(): category = "timeout"
        print(json.dumps({"success": False, "error": error_msg, "error_category": category}))
