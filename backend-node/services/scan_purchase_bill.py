#!/usr/bin/env python3
import sys
import json
import base64
import time
import os
import urllib.request
import urllib.parse

def call_gemini_rest_bill_api(prompt: str, image_paths: list, api_key: str):
    """Zero-dependency direct REST API call for invoice bill scanning."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    
    parts = [{"text": prompt}]
    
    for path_or_url in image_paths:
        try:
            if path_or_url.startswith('http://') or path_or_url.startswith('https://'):
                req = urllib.request.Request(path_or_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req) as resp:
                    img_bytes = resp.read()
            else:
                with open(path_or_url, 'rb') as f:
                    img_bytes = f.read()
            
            mime_type = "image/jpeg"
            url_lower = path_or_url.lower()
            if url_lower.endswith(".png"):
                mime_type = "image/png"
            elif url_lower.endswith(".webp"):
                mime_type = "image/webp"
                
            parts.append({
                "inline_data": {
                    "mime_type": mime_type,
                    "data": base64.b64encode(img_bytes).decode('utf-8')
                }
            })
        except Exception as e:
            print(f"Error loading image {path_or_url}: {e}", file=sys.stderr)

    if len(parts) <= 1:
        raise Exception(f"No valid invoice images could be loaded from: {', '.join(image_paths)}")

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "response_mime_type": "application/json"
        }
    }
    
    req_data = json.dumps(payload).encode('utf-8')
    request = urllib.request.Request(
        url,
        data=req_data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    
    with urllib.request.urlopen(request, timeout=90) as response:
        res_body = response.read().decode('utf-8')
        res_json = json.loads(res_body)
        
        candidates = res_json.get("candidates", [])
        if not candidates:
            raise Exception("No candidates returned from Gemini REST API for bill scan")
            
        part_text = candidates[0]["content"]["parts"][0]["text"]
        return json.loads(part_text)

def scan_bill_with_google(image_urls: list, api_key: str, max_retries=2):
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
1. **NO HALLUCINATIONS**: Extract EXACTLY what is printed. Do not guess or suggest similar medicine names.
2. **ROW INTEGRITY**: Each JSON item must represent one single line from the printed table.
3. **MISSING HEADERS**: If headers are missing or unreadable, use common sense: HSN is 8 digits, Batch is alphanumeric, Expiry is MM/YY, MRP > Rate.
4. **STITCHING**: Combine Manufacturer and Salt Composition from your internal knowledge if they aren't explicitly printed in the row.

Return JSON in this format:
{
  "supplier_name": "Supplier Name",
  "invoice_no": "Invoice Number",
  "confidence": 85,
  "items": [
    {
      "product_name": "Product Name",
      "manufacturer": "Manufacturer Name",
      "salt_composition": "Active Composition",
      "batch_no": "Batch Number",
      "expiry_date": "YYYY-MM-DD",
      "quantity": 10,
      "rate_pack": 120.00,
      "mrp": 150.00,
      "hsn_no": "30049099"
    }
  ]
}
"""

    final_result = {
        "supplier_name": "",
        "invoice_no": "",
        "confidence": 85,
        "items": []
    }

    try:
        from google import genai
        from google.genai import types
        
        client = genai.Client(api_key=api_key)
        confidences = []

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

        for index, path_or_url in enumerate(image_urls):
            if path_or_url.startswith('http://') or path_or_url.startswith('https://'):
                req = urllib.request.Request(path_or_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req) as response:
                    image_data = response.read()
            else:
                with open(path_or_url, 'rb') as f:
                    image_data = f.read()

            mime_type = "image/jpeg"
            url_lower = path_or_url.lower()
            if url_lower.endswith(".png"): mime_type = "image/png"
            elif url_lower.endswith(".webp"): mime_type = "image/webp"

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[prompt, types.Part.from_bytes(data=image_data, mime_type=mime_type)],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=schema
                )
            )
            
            data = json.loads(response.text)
            if isinstance(data, list): data = data[0] if len(data) > 0 else {}
            
            if not final_result["supplier_name"]: final_result["supplier_name"] = data.get("supplier_name", "")
            if not final_result["invoice_no"]: final_result["invoice_no"] = data.get("invoice_no", "")
            
            final_result["items"].extend(data.get("items", []))
            confidences.append(data.get("confidence", 85))

        final_result["confidence"] = int(sum(confidences) / len(confidences)) if confidences else 85
        return final_result

    except (ModuleNotFoundError, Exception):
        # Fallback to direct REST API
        parsed_data = call_gemini_rest_bill_api(prompt, image_urls, api_key)
        if isinstance(parsed_data, list):
            parsed_data = parsed_data[0] if len(parsed_data) > 0 else {}
        return parsed_data

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