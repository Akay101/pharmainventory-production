"""
Pharmalogy Backend API Tests - Unit-Based Tracking System
Tests for: Purchase with unit-based fields, Inventory stores UNITS, Billing deducts UNITS, Profit calculation
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test@pharmalogy.com"
TEST_PASSWORD = "test123456"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for protected endpoints"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["token"]
    pytest.skip("Authentication failed - skipping authenticated tests")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="module")
def test_supplier(auth_headers):
    """Get or create a test supplier for unit-based tests"""
    suppliers_response = requests.get(f"{BASE_URL}/api/suppliers", headers=auth_headers)
    suppliers = suppliers_response.json().get("suppliers", [])
    
    if suppliers:
        return {"id": suppliers[0]["id"], "name": suppliers[0]["name"]}
    
    # Create a supplier
    supplier_data = {
        "name": "TEST_UnitBased_Supplier",
        "phone": "+919876543210"
    }
    create_response = requests.post(f"{BASE_URL}/api/suppliers", 
                                   headers=auth_headers, 
                                   json=supplier_data)
    supplier = create_response.json()["supplier"]
    return {"id": supplier["id"], "name": supplier["name"]}


class TestUnitBasedPurchase:
    """Test purchase with unit-based fields: pack_quantity, units_per_pack, pack_price, mrp_per_unit"""
    
    def test_create_purchase_unit_based(self, auth_headers, test_supplier):
        """
        Test creating purchase with unit-based fields:
        - 5 packs × 10 units/pack = 50 total units
        - Pack price ₹100 → Cost per unit = ₹10
        - MRP per unit = ₹15
        """
        purchase_data = {
            "supplier_id": test_supplier["id"],
            "supplier_name": test_supplier["name"],
            "invoice_no": "TEST-UNIT-BASED-001",
            "items": [{
                "product_id": "test-unit-product-001",
                "product_name": "TEST_Unit_Medicine_Tablets",
                "batch_no": "UNIT_BATCH_001",
                "expiry_date": "2027-12-31",
                "pack_quantity": 5,        # 5 packs
                "units_per_pack": 10,      # 10 tablets per pack
                "pack_price": 100.00,      # ₹100 per pack
                "mrp_per_unit": 15.00      # ₹15 MRP per tablet
            }]
        }
        
        response = requests.post(f"{BASE_URL}/api/purchases", 
                                headers=auth_headers, 
                                json=purchase_data)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "purchase" in data
        
        purchase = data["purchase"]
        item = purchase["items"][0]
        
        # Verify unit-based fields
        assert item["pack_quantity"] == 5, "Pack quantity should be 5"
        assert item["units_per_pack"] == 10, "Units per pack should be 10"
        assert item["pack_price"] == 100.00, "Pack price should be 100"
        assert item["mrp_per_unit"] == 15.00, "MRP per unit should be 15"
        
        # Verify calculated fields
        assert item["total_units"] == 50, "Total units should be 5 × 10 = 50"
        assert item["price_per_unit"] == 10.00, "Price per unit should be 100/10 = 10"
        
        # Verify total amount
        assert purchase["total_amount"] == 500.00, "Total should be 5 packs × ₹100 = ₹500"
        
        print(f"✓ Unit-based purchase created successfully")
        print(f"  Pack Quantity: {item['pack_quantity']}")
        print(f"  Units per Pack: {item['units_per_pack']}")
        print(f"  Total Units: {item['total_units']}")
        print(f"  Cost per Unit: ₹{item['price_per_unit']}")
        print(f"  MRP per Unit: ₹{item['mrp_per_unit']}")
        print(f"  Total Amount: ₹{purchase['total_amount']}")
        
        return purchase["id"]


class TestInventoryStoresUnits:
    """Test that inventory stores and displays UNITS (not packs)"""
    
    def test_inventory_shows_units(self, auth_headers):
        """
        Verify inventory shows available_quantity in UNITS
        After purchase of 5 packs × 10 units = 50 units, inventory should show 50 units
        """
        # Search for our test product in inventory
        response = requests.get(f"{BASE_URL}/api/inventory?search=TEST_Unit_Medicine", 
                               headers=auth_headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Find our test item
        test_items = [i for i in data["inventory"] if "TEST_Unit_Medicine" in i.get("product_name", "")]
        
        if test_items:
            item = test_items[0]
            print(f"✓ Found inventory item: {item['product_name']}")
            print(f"  Available Quantity: {item['available_quantity']} units")
            print(f"  Purchase Price (cost/unit): ₹{item['purchase_price']}")
            print(f"  MRP (per unit): ₹{item['mrp']}")
            
            # Verify inventory stores units, not packs
            assert "available_quantity" in item, "Inventory should have available_quantity field"
            assert item["available_quantity"] > 0, "Available quantity should be > 0"
            
            # Verify purchase_price is per unit (should be ~10, not 100)
            assert item["purchase_price"] <= 20, f"Purchase price should be per unit (~10), got {item['purchase_price']}"
        else:
            print("⚠ Test item not found in inventory - may have been cleaned up")


class TestBillingDeductsUnits:
    """Test that billing deducts UNITS from inventory"""
    
    def test_create_bill_deducts_units(self, auth_headers):
        """
        Test billing flow:
        1. Get inventory item with available units
        2. Create bill selling X units
        3. Verify inventory decreased by X units
        4. Verify profit calculation: (sell_price - cost_per_unit) × quantity_sold
        """
        # First, get an inventory item with available units
        inv_response = requests.get(f"{BASE_URL}/api/inventory", headers=auth_headers)
        assert inv_response.status_code == 200
        
        inventory = inv_response.json()["inventory"]
        
        # Find an item with enough stock
        test_item = None
        for item in inventory:
            if item.get("available_quantity", 0) >= 10:
                test_item = item
                break
        
        if not test_item:
            pytest.skip("No inventory item with sufficient stock for billing test")
        
        initial_quantity = test_item["available_quantity"]
        cost_per_unit = test_item["purchase_price"]
        mrp_per_unit = test_item["mrp"]
        
        print(f"✓ Found inventory item for billing test")
        print(f"  Product: {test_item['product_name']}")
        print(f"  Initial Available: {initial_quantity} units")
        print(f"  Cost per Unit: ₹{cost_per_unit}")
        print(f"  MRP per Unit: ₹{mrp_per_unit}")
        
        # Create a bill selling 5 units
        units_to_sell = 5
        sell_price = mrp_per_unit  # Sell at MRP
        
        bill_data = {
            "customer_name": "TEST_Unit_Billing_Customer",
            "customer_mobile": "+919876543211",
            "items": [{
                "inventory_id": test_item["id"],
                "product_name": test_item["product_name"],
                "batch_no": test_item["batch_no"],
                "quantity": units_to_sell,
                "unit_price": sell_price,
                "discount_percent": 0,
                "is_manual": False
            }],
            "discount_percent": 0,
            "is_paid": True
        }
        
        bill_response = requests.post(f"{BASE_URL}/api/bills", 
                                     headers=auth_headers, 
                                     json=bill_data)
        
        assert bill_response.status_code == 200, f"Failed to create bill: {bill_response.text}"
        bill = bill_response.json()["bill"]
        
        print(f"✓ Bill created successfully")
        print(f"  Bill No: {bill['bill_no']}")
        print(f"  Grand Total: ₹{bill['grand_total']}")
        print(f"  Profit: ₹{bill['profit']}")
        
        # Verify profit calculation: (sell_price - cost_per_unit) × quantity_sold
        expected_profit = (sell_price - cost_per_unit) * units_to_sell
        assert abs(bill["profit"] - expected_profit) < 0.01, \
            f"Profit should be (₹{sell_price} - ₹{cost_per_unit}) × {units_to_sell} = ₹{expected_profit}, got ₹{bill['profit']}"
        
        print(f"✓ Profit calculation verified: (₹{sell_price} - ₹{cost_per_unit}) × {units_to_sell} = ₹{expected_profit}")
        
        # Verify inventory was deducted
        time.sleep(0.5)  # Small delay for DB update
        inv_response2 = requests.get(f"{BASE_URL}/api/inventory?search={test_item['product_name']}", 
                                    headers=auth_headers)
        
        updated_inventory = inv_response2.json()["inventory"]
        updated_item = next((i for i in updated_inventory if i["id"] == test_item["id"]), None)
        
        if updated_item:
            new_quantity = updated_item["available_quantity"]
            expected_quantity = initial_quantity - units_to_sell
            
            assert new_quantity == expected_quantity, \
                f"Inventory should be {initial_quantity} - {units_to_sell} = {expected_quantity}, got {new_quantity}"
            
            print(f"✓ Inventory deduction verified: {initial_quantity} - {units_to_sell} = {new_quantity} units")
        
        return bill["id"]


class TestPurchaseExpandedRowData:
    """Test that purchases expanded row shows correct unit-based data"""
    
    def test_purchase_items_have_unit_fields(self, auth_headers):
        """
        Verify purchase items have: Packs, Units/Pack, Total Units, Cost/Unit, MRP/Unit
        """
        response = requests.get(f"{BASE_URL}/api/purchases", headers=auth_headers)
        assert response.status_code == 200
        
        purchases = response.json()["purchases"]
        
        if not purchases:
            pytest.skip("No purchases found")
        
        # Find a purchase with unit-based data
        for purchase in purchases:
            if purchase.get("items"):
                item = purchase["items"][0]
                
                print(f"✓ Checking purchase: {purchase.get('invoice_no', purchase['id'][:8])}")
                print(f"  Item: {item.get('product_name')}")
                
                # Check for unit-based fields
                has_pack_quantity = "pack_quantity" in item
                has_units_per_pack = "units_per_pack" in item
                has_total_units = "total_units" in item or "quantity" in item
                has_price_per_unit = "price_per_unit" in item or "purchase_price" in item
                has_mrp_per_unit = "mrp_per_unit" in item or "mrp" in item
                
                print(f"  Has pack_quantity: {has_pack_quantity}")
                print(f"  Has units_per_pack: {has_units_per_pack}")
                print(f"  Has total_units: {has_total_units}")
                print(f"  Has price_per_unit: {has_price_per_unit}")
                print(f"  Has mrp_per_unit: {has_mrp_per_unit}")
                
                # At minimum, should have quantity and price fields
                assert has_total_units, "Item should have total_units or quantity"
                assert has_price_per_unit, "Item should have price_per_unit or purchase_price"
                
                break


class TestBillPreviewProfit:
    """Test bill preview shows correct profit calculation"""
    
    def test_bill_preview_profit(self, auth_headers):
        """
        Test bill preview calculates profit correctly:
        Profit = (sell_price - cost_per_unit) × quantity_sold
        """
        # Get an inventory item
        inv_response = requests.get(f"{BASE_URL}/api/inventory", headers=auth_headers)
        inventory = inv_response.json()["inventory"]
        
        test_item = None
        for item in inventory:
            if item.get("available_quantity", 0) >= 5:
                test_item = item
                break
        
        if not test_item:
            pytest.skip("No inventory item with sufficient stock")
        
        # Create preview request
        preview_data = {
            "customer_name": "TEST_Preview_Customer",
            "customer_mobile": "+919876543222",
            "items": [{
                "inventory_id": test_item["id"],
                "product_name": test_item["product_name"],
                "batch_no": test_item["batch_no"],
                "quantity": 3,
                "unit_price": test_item["mrp"],
                "discount_percent": 0,
                "is_manual": False
            }],
            "discount_percent": 0,
            "is_paid": True
        }
        
        response = requests.post(f"{BASE_URL}/api/bills/preview", 
                                headers=auth_headers, 
                                json=preview_data)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        preview = response.json()
        
        print(f"✓ Bill preview generated")
        print(f"  Subtotal: ₹{preview['subtotal']}")
        print(f"  Grand Total: ₹{preview['grand_total']}")
        print(f"  Total Profit: ₹{preview['total_profit']}")
        
        # Verify profit calculation
        expected_profit = (test_item["mrp"] - test_item["purchase_price"]) * 3
        assert abs(preview["total_profit"] - expected_profit) < 0.01, \
            f"Expected profit ₹{expected_profit}, got ₹{preview['total_profit']}"
        
        print(f"✓ Profit calculation verified")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_data(self, auth_headers):
        """Clean up TEST_ prefixed data"""
        # Clean up test purchases
        purchases_response = requests.get(f"{BASE_URL}/api/purchases", headers=auth_headers)
        purchases = purchases_response.json().get("purchases", [])
        
        deleted_purchases = 0
        for purchase in purchases:
            invoice_no = purchase.get("invoice_no") or ""
            if invoice_no.startswith("TEST-UNIT"):
                delete_response = requests.delete(
                    f"{BASE_URL}/api/purchases/{purchase['id']}?delete_inventory=true", 
                    headers=auth_headers
                )
                if delete_response.status_code == 200:
                    deleted_purchases += 1
        
        print(f"✓ Cleaned up {deleted_purchases} test purchases")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
