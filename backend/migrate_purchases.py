#!/usr/bin/env python3
"""
Script to migrate purchase data to a specific user's pharmacy
"""
import httpx
import json
import asyncio
from datetime import datetime
import uuid

# User's token and pharmacy_id
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiZWE0ZGFiMTEtNWEzYi00ZmU4LTgwNjYtZjlmYTViYjI4Njc0IiwicGhhcm1hY3lfaWQiOiJkYzFjYjU5ZS1jNDYxLTRlMzktOWFhMS1hZTJlZmFjYjU0OTkiLCJyb2xlIjoiQURNSU4iLCJleHAiOjE3NzAyMjg3NzZ9.sDsDWMfhQPA73--iLH8Bb1JKIC4zux312aTD9TO7Kj8"
PHARMACY_ID = "dc1cb59e-c461-4e39-9aa1-ae2efacb5499"
API_URL = "https://pharmalogy.preview.emergentagent.com/api"

def parse_expiry_date(expiry_str):
    """Parse various expiry date formats to YYYY-MM-DD"""
    if not expiry_str or expiry_str == "null":
        return "2030-01-01"  # Default far future date
    
    try:
        # Handle ISO format: 2026-06-01T00:00:00.000+0000
        if "T" in str(expiry_str):
            date_part = str(expiry_str).split("T")[0]
            # Handle weird dates like +20230-12-01 or 0027-08-12
            if date_part.startswith("+"):
                date_part = date_part[1:]
            year = int(date_part.split("-")[0])
            if year < 2000 or year > 2100:
                return "2030-01-01"
            return date_part
        return str(expiry_str)[:10]
    except:
        return "2030-01-01"

def transform_purchase(raw_purchase, supplier_id_map):
    """Transform raw purchase data to API format"""
    supplier_name = raw_purchase.get("supplierName", "Unknown").strip()
    
    # Get or create supplier ID
    if supplier_name.lower() not in supplier_id_map:
        supplier_id_map[supplier_name.lower()] = str(uuid.uuid4())
    
    supplier_id = supplier_id_map[supplier_name.lower()]
    
    items = []
    for item in raw_purchase.get("items", []):
        quantity = item.get("quantity", 0)
        if quantity <= 0:
            continue
            
        price = item.get("price") or 0
        mrp = item.get("mrp") or (price * 1.3 if price else 10)  # Default 30% margin or 10
        
        items.append({
            "product_id": str(uuid.uuid4()),
            "product_name": item.get("name", "Unknown Product"),
            "batch_no": item.get("batch", "") or f"BATCH-{uuid.uuid4().hex[:6].upper()}",
            "expiry_date": parse_expiry_date(item.get("expiry")),
            "quantity": int(quantity),
            "purchase_price": float(price) if price else float(mrp) * 0.7,
            "mrp": float(mrp),
        })
    
    if not items:
        return None
    
    return {
        "supplier_id": supplier_id,
        "supplier_name": supplier_name,
        "invoice_no": raw_purchase.get("invoiceNumber") or f"MIG-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:4].upper()}",
        "items": items
    }

async def create_supplier_if_not_exists(client, supplier_name, headers):
    """Create supplier if it doesn't exist"""
    # First check if supplier exists
    response = await client.get(
        f"{API_URL}/suppliers",
        headers=headers,
        params={"search": supplier_name}
    )
    
    if response.status_code == 200:
        suppliers = response.json().get("suppliers", [])
        for s in suppliers:
            if s.get("name", "").lower() == supplier_name.lower():
                return s.get("id")
    
    # Create new supplier
    response = await client.post(
        f"{API_URL}/suppliers",
        headers=headers,
        json={"name": supplier_name}
    )
    
    if response.status_code == 200:
        return response.json().get("supplier", {}).get("id")
    
    return None

async def migrate_purchases():
    """Main migration function"""
    # Fetch raw data from URL
    json_url = "https://customer-assets.emergentagent.com/job_2057ceff-5c71-4f7f-b627-fbfa4d3c9b80/artifacts/zq0hmsgk_migration_purchases.json"
    
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient(timeout=120) as client:
        print("Fetching purchase data from URL...")
        response = await client.get(json_url)
        raw_data = response.json()
        
        print(f"Found {len(raw_data)} purchase records")
        
        # Get unique supplier names
        supplier_names = set()
        for purchase in raw_data:
            name = purchase.get("supplierName", "").strip()
            if name:
                supplier_names.add(name.lower())
        
        print(f"Found {len(supplier_names)} unique suppliers")
        
        # Create suppliers first
        supplier_id_map = {}
        for name in supplier_names:
            display_name = name.title() if name else "Unknown"
            supplier_id = await create_supplier_if_not_exists(client, display_name, headers)
            if supplier_id:
                supplier_id_map[name] = supplier_id
                print(f"  Supplier '{display_name}' -> {supplier_id}")
            else:
                # Generate a temp ID
                supplier_id_map[name] = str(uuid.uuid4())
                print(f"  Supplier '{display_name}' -> generated temp ID")
        
        # Transform and push purchases
        success_count = 0
        error_count = 0
        total_items = 0
        
        for i, raw_purchase in enumerate(raw_data):
            purchase = transform_purchase(raw_purchase, supplier_id_map)
            if not purchase:
                error_count += 1
                continue
            
            try:
                response = await client.post(
                    f"{API_URL}/purchases",
                    headers=headers,
                    json=purchase
                )
                
                if response.status_code == 200:
                    success_count += 1
                    total_items += len(purchase["items"])
                    if (i + 1) % 10 == 0:
                        print(f"  Progress: {i + 1}/{len(raw_data)} purchases migrated...")
                else:
                    error_count += 1
                    print(f"  Error on purchase {i + 1}: {response.text[:100]}")
            except Exception as e:
                error_count += 1
                print(f"  Exception on purchase {i + 1}: {str(e)}")
        
        print("\n" + "="*50)
        print("MIGRATION COMPLETE")
        print("="*50)
        print(f"Total purchases processed: {len(raw_data)}")
        print(f"Successfully migrated: {success_count}")
        print(f"Errors: {error_count}")
        print(f"Total items added to inventory: {total_items}")

if __name__ == "__main__":
    asyncio.run(migrate_purchases())
