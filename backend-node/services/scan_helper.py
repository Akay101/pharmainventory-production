#!/usr/bin/env python3
"""Helper script to scan medicine images using Emergent integrations or direct Gemini API."""
import sys
import json
import base64
import os
import uuid
import asyncio

async def scan_image_with_emergent(image_paths: list, api_key: str):
    """Scan using Emergent integrations library."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    
    image_contents = []
    for image_path in image_paths:
        with open(image_path, 'rb') as f:
            image_data = f.read()
            image_base64 = base64.b64encode(image_data).decode('utf-8')
            image_contents.append(ImageContent(image_base64=image_base64))
    
    prompt = """Analyze the provided medicine/pharmaceutical product images. These are images of the SAME single product from different angles. Extract the product information by combining details visible across the multiple images.

CRITICAL INSTRUCTIONS FOR MISSING DATA:
If "manufacturer" or "salt_composition" are NOT clearly visible on the image, you MUST use your own medical knowledge to autofill them based on the "product_name". Do not leave them empty if you can identify the product!

Return a JSON object with these fields (use null if not visible unless autofill is required):
{
  "product_name": "full product name",
  "manufacturer": "company name (MUST autofill from internal knowledge if not visible)",
  "salt_composition": "active ingredients (MUST autofill from internal knowledge if not visible)",
  "batch_no": "batch/lot number",
  "expiry_date": "expiry date strictly in YYYY-MM-DD format (use last day of month if only MM/YY is given)",
  "mrp": "MRP as number only (no currency symbol)",
  "pack_size": "pack size description (e.g., '10 tablets', '100ml')",
  "pack_type": "Strip/Bottle/Tube/Box/Vial/Syrup/Cream/Injection",
  "units_per_pack": "number of units in pack as integer",
  "hsn_no": "HSN code if visible"
}

Important: Only return valid JSON, no other text."""

    system_msg = "You are a pharmaceutical product analyzer. You extract product information from medicine images accurately."
    session_id = str(uuid.uuid4())
    
    chat = LlmChat(
        api_key=api_key,
        session_id=session_id,
        system_message=system_msg
    )
    
    chat.with_model("gemini", "gemini-2.0-flash")
    user_msg = UserMessage(text=prompt, file_contents=image_contents)
    
    response = await chat.send_message(user_msg)
    return response


def scan_image_with_google(image_paths: list, api_key: str):
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    prompt = """Analyze the provided medicine/pharmaceutical product images. These are images of the SAME single product from different angles. Extract the product information by combining details visible across the multiple images.

Return a JSON object with these fields (use null if not visible unless autofill is required):
{
  "product_name": "full product name",
  "manufacturer": "manufacturer/company name. If not visible but you know it based on the product name, autofill it.",
  "salt_composition": "active ingredients/composition. If not visible but you know it based on the product name, autofill it.",
  "batch_no": "batch/lot number",
  "expiry_date": "expiry date strictly in YYYY-MM-DD format (use last day of month if only MM/YY is given)",
  "mrp": "MRP as number only (no currency symbol)",
  "pack_size": "pack size description (e.g., '10 tablets', '100ml')",
  "pack_type": "Strip/Bottle/Tube/Box/Vial/Syrup/Cream/Injection",
  "units_per_pack": "number of units in pack as integer",
  "hsn_no": "HSN code if visible"
}

Important: Only return valid JSON, no other text.
"""

    contents = [prompt]
    for image_path in image_paths:
        with open(image_path, "rb") as f:
            contents.append(
                types.Part.from_bytes(
                    data=f.read(),
                    mime_type="image/webp" if image_path.lower().endswith(".webp") else "image/png"
                )
            )

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=contents
    )

    return response.text





async def scan_image_async(image_paths: list, api_key: str):
    """Scan a medicine image and extract product information."""
    try:
        # Determine which API to use based on key format
        if api_key.startswith('sk-emergent'):
            # Use Emergent integrations
            response = await scan_image_with_emergent(image_paths, api_key)
        elif api_key.startswith('AIza'):
            # Use direct Google Generative AI SDK
            response = scan_image_with_google(image_paths, api_key)
        else:
            return {"success": False, "error": "Unknown API key format. Use EMERGENT_LLM_KEY (sk-emergent...) or GEMINI_API_KEY (AIza...)"}
        
        # Parse the response
        response_text = response if isinstance(response, str) else str(response)
        
        # Extract JSON from response
        import re
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        
        if not json_match:
            return {"success": False, "error": "Could not parse image data"}
        
        scanned_data = json.loads(json_match.group(0))
        
        # Process scanned data
        if not scanned_data.get('units_per_pack') and scanned_data.get('pack_size'):
            pack_match = re.search(r'(\d+)', scanned_data['pack_size'])
            if pack_match:
                scanned_data['units_per_pack'] = int(pack_match.group(1))
        
        if not scanned_data.get('pack_type') and scanned_data.get('pack_size'):
            pack_size_lower = scanned_data['pack_size'].lower()
            if any(x in pack_size_lower for x in ['strip', 'tablet', 'cap']):
                scanned_data['pack_type'] = 'Strip'
            elif any(x in pack_size_lower for x in ['bottle', 'ml']):
                scanned_data['pack_type'] = 'Bottle'
            elif any(x in pack_size_lower for x in ['tube', 'gel', 'cream']):
                scanned_data['pack_type'] = 'Tube'
            elif 'syrup' in pack_size_lower:
                scanned_data['pack_type'] = 'Syrup'
            elif any(x in pack_size_lower for x in ['injection', 'vial']):
                scanned_data['pack_type'] = 'Injection'
            else:
                scanned_data['pack_type'] = 'Box'
        
        # Build scanned product
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
            'confidence': 75,
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
        return {"success": False, "error": str(e)}


def scan_image(image_paths: list, api_key: str):
    """Synchronous wrapper for scan_image_async."""
    return asyncio.run(scan_image_async(image_paths, api_key))


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Usage: scan_helper.py <api_key> <image_path1> [image_path2...]"}))
        sys.exit(1)
    
    api_key = sys.argv[1]
    image_paths = sys.argv[2:]
    
    result = scan_image(image_paths, api_key)
    print(json.dumps(result))
