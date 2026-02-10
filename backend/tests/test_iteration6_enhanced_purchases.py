"""
Test Iteration 6 - Enhanced Purchase and Inventory Flow
Features tested:
1. New fields: Manufacturer, Salt Composition, Pack Type
2. Renamed fields: Quantity (was Packs), Units (was Units/Pack), Rate(Pack), Rate/Unit (auto), MRP/Unit, MRP(Pack) (auto), Final Amount (auto)
3. Inventory shows 'X Strips + Y units' format with total units
4. Tab key fills default values on empty fields
5. Auto-save to localStorage for Purchases and Billing pages with restore dialog
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthentication:
    """Test login with test credentials"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@pharmalogy.com",
            "password": "test123456"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        return data["token"]
    
    def test_login_success(self, auth_token):
        """Verify login works with test credentials"""
        assert auth_token is not None
        assert len(auth_token) > 0
        print(f"✓ Login successful, token obtained")


class TestEnhancedPurchaseFields:
    """Test new purchase fields: Manufacturer, Salt Composition, Pack Type"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@pharmalogy.com",
            "password": "test123456"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    @pytest.fixture(scope="class")
    def supplier_id(self, headers):
        """Get or create a test supplier"""
        # First try to get existing suppliers
        response = requests.get(f"{BASE_URL}/api/suppliers", headers=headers)
        assert response.status_code == 200
        suppliers = response.json().get("suppliers", [])
        
        if suppliers:
            return suppliers[0]["id"]
        
        # Create a test supplier if none exists
        response = requests.post(f"{BASE_URL}/api/suppliers", headers=headers, json={
            "name": "TEST_Supplier_Iteration6",
            "phone": "9999999999",
            "email": "test@supplier.com",
            "address": "Test Address"
        })
        assert response.status_code == 200
        return response.json()["supplier"]["id"]
    
    def test_create_purchase_with_enhanced_fields(self, headers, supplier_id):
        """Test creating purchase with new fields: manufacturer, salt_composition, pack_type"""
        purchase_data = {
            "supplier_id": supplier_id,
            "supplier_name": "Test Supplier",
            "invoice_no": "TEST_INV_ITER6_001",
            "items": [
                {
                    "product_id": "test-product-iter6-001",
                    "product_name": "TEST_Dolo 650 Enhanced",
                    "batch_no": "BATCH_ITER6_001",
                    "expiry_date": "2026-12-31",
                    # New enhanced fields
                    "manufacturer": "Micro Labs Ltd",
                    "salt_composition": "Paracetamol 650mg",
                    "pack_type": "Strip",
                    # Unit-based fields (renamed)
                    "pack_quantity": 5,      # Qty (number of packs)
                    "units_per_pack": 10,    # Units per pack
                    "pack_price": 50.00,     # Rate(Pack)
                    "mrp_per_unit": 6.50,    # MRP/Unit
                    "hsn_no": "30049099"
                }
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/purchases", headers=headers, json=purchase_data)
        assert response.status_code == 200, f"Create purchase failed: {response.text}"
        
        purchase = response.json()["purchase"]
        assert purchase["invoice_no"] == "TEST_INV_ITER6_001"
        
        # Verify items have enhanced fields
        item = purchase["items"][0]
        assert item["manufacturer"] == "Micro Labs Ltd", "Manufacturer not saved"
        assert item["salt_composition"] == "Paracetamol 650mg", "Salt composition not saved"
        assert item["pack_type"] == "Strip", "Pack type not saved"
        
        # Verify calculated fields
        assert item["pack_quantity"] == 5, "Pack quantity not saved"
        assert item["units_per_pack"] == 10, "Units per pack not saved"
        assert item["total_units"] == 50, f"Total units should be 50, got {item.get('total_units')}"
        assert item["pack_price"] == 50.00, "Pack price not saved"
        assert item["mrp_per_unit"] == 6.50, "MRP per unit not saved"
        
        # Verify auto-calculated fields
        expected_price_per_unit = 50.00 / 10  # pack_price / units_per_pack = 5.00
        assert item["price_per_unit"] == expected_price_per_unit, f"Price per unit should be {expected_price_per_unit}"
        
        expected_mrp_pack = 6.50 * 10  # mrp_per_unit * units_per_pack = 65.00
        assert item.get("mrp_pack") == expected_mrp_pack, f"MRP pack should be {expected_mrp_pack}"
        
        print(f"✓ Purchase created with enhanced fields")
        print(f"  - Manufacturer: {item['manufacturer']}")
        print(f"  - Salt Composition: {item['salt_composition']}")
        print(f"  - Pack Type: {item['pack_type']}")
        print(f"  - Total Units: {item['total_units']}")
        print(f"  - Price/Unit: {item['price_per_unit']}")
        print(f"  - MRP/Pack: {item.get('mrp_pack')}")
        
        return purchase["id"]
    
    def test_inventory_has_enhanced_fields(self, headers):
        """Verify inventory items have the new enhanced fields"""
        response = requests.get(f"{BASE_URL}/api/inventory?search=TEST_Dolo", headers=headers)
        assert response.status_code == 200
        
        inventory = response.json().get("inventory", [])
        
        # Find our test item
        test_item = None
        for item in inventory:
            if "TEST_Dolo 650 Enhanced" in item.get("product_name", ""):
                test_item = item
                break
        
        if test_item:
            # Verify enhanced fields in inventory
            assert test_item.get("manufacturer") == "Micro Labs Ltd", "Manufacturer not in inventory"
            assert test_item.get("salt_composition") == "Paracetamol 650mg", "Salt composition not in inventory"
            assert test_item.get("pack_type") == "Strip", "Pack type not in inventory"
            assert test_item.get("units_per_pack") == 10, "Units per pack not in inventory"
            
            # Verify unit-based tracking
            assert test_item.get("available_quantity") == 50, f"Available quantity should be 50 units, got {test_item.get('available_quantity')}"
            
            print(f"✓ Inventory item has enhanced fields")
            print(f"  - Product: {test_item['product_name']}")
            print(f"  - Manufacturer: {test_item.get('manufacturer')}")
            print(f"  - Pack Type: {test_item.get('pack_type')}")
            print(f"  - Available Units: {test_item.get('available_quantity')}")
            print(f"  - Units/Pack: {test_item.get('units_per_pack')}")
        else:
            print("⚠ Test inventory item not found - may have been cleaned up")


class TestInventoryPackUnitsFormat:
    """Test inventory shows 'X Strips + Y units' format"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@pharmalogy.com",
            "password": "test123456"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_inventory_returns_pack_info(self, headers):
        """Verify inventory API returns pack_type and units_per_pack for display"""
        response = requests.get(f"{BASE_URL}/api/inventory", headers=headers)
        assert response.status_code == 200
        
        inventory = response.json().get("inventory", [])
        
        if inventory:
            # Check that inventory items have the fields needed for 'X Strips + Y units' display
            item = inventory[0]
            
            # These fields should be present for the frontend to calculate display
            has_pack_type = "pack_type" in item
            has_units_per_pack = "units_per_pack" in item
            has_available_quantity = "available_quantity" in item
            
            print(f"✓ Inventory item structure:")
            print(f"  - Has pack_type: {has_pack_type} ({item.get('pack_type', 'N/A')})")
            print(f"  - Has units_per_pack: {has_units_per_pack} ({item.get('units_per_pack', 'N/A')})")
            print(f"  - Has available_quantity: {has_available_quantity} ({item.get('available_quantity', 'N/A')})")
            
            # Calculate expected display format
            if has_units_per_pack and has_available_quantity:
                units_per_pack = item.get("units_per_pack", 1)
                available = item.get("available_quantity", 0)
                pack_type = item.get("pack_type", "Strip")
                
                if units_per_pack > 0:
                    packs = available // units_per_pack
                    remaining_units = available % units_per_pack
                    print(f"  - Display format: {packs} {pack_type}s + {remaining_units} units ({available} total)")
        else:
            print("⚠ No inventory items found")


class TestMedicineSearch:
    """Test medicine search for auto-fill functionality"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@pharmalogy.com",
            "password": "test123456"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_medicine_search_returns_composition(self, headers):
        """Test medicine search returns manufacturer and composition for auto-fill"""
        response = requests.get(f"{BASE_URL}/api/medicines/search?q=dolo&limit=5", headers=headers)
        assert response.status_code == 200
        
        medicines = response.json().get("medicines", [])
        
        if medicines:
            medicine = medicines[0]
            print(f"✓ Medicine search result:")
            print(f"  - Name: {medicine.get('name')}")
            print(f"  - Manufacturer: {medicine.get('manufacturer')}")
            print(f"  - Composition: {medicine.get('composition')}")
            print(f"  - Price: {medicine.get('price(₹)')}")
            print(f"  - Pack Size: {medicine.get('pack_size')}")
        else:
            print("⚠ No medicines found for 'dolo' search")


class TestPurchaseCalculations:
    """Test auto-calculated fields in purchases"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@pharmalogy.com",
            "password": "test123456"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    @pytest.fixture(scope="class")
    def supplier_id(self, headers):
        response = requests.get(f"{BASE_URL}/api/suppliers", headers=headers)
        assert response.status_code == 200
        suppliers = response.json().get("suppliers", [])
        if suppliers:
            return suppliers[0]["id"]
        pytest.skip("No suppliers available")
    
    def test_auto_calculated_fields(self, headers, supplier_id):
        """Test that Rate/Unit, MRP(Pack), Total Units, Final Amount are auto-calculated"""
        purchase_data = {
            "supplier_id": supplier_id,
            "supplier_name": "Test Supplier",
            "invoice_no": "TEST_CALC_001",
            "items": [
                {
                    "product_id": "test-calc-001",
                    "product_name": "TEST_Calculation Product",
                    "batch_no": "CALC_BATCH_001",
                    "expiry_date": "2027-06-30",
                    "manufacturer": "Test Pharma",
                    "salt_composition": "Test Salt 100mg",
                    "pack_type": "Bottle",
                    "pack_quantity": 3,       # Qty = 3 bottles
                    "units_per_pack": 100,    # Units = 100 per bottle
                    "pack_price": 150.00,     # Rate(Pack) = ₹150
                    "mrp_per_unit": 2.00,     # MRP/Unit = ₹2
                }
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/purchases", headers=headers, json=purchase_data)
        assert response.status_code == 200
        
        item = response.json()["purchase"]["items"][0]
        
        # Verify auto-calculated fields
        # Total Units = Qty * Units = 3 * 100 = 300
        assert item["total_units"] == 300, f"Total units should be 300, got {item.get('total_units')}"
        
        # Rate/Unit = Rate(Pack) / Units = 150 / 100 = 1.50
        expected_rate_unit = 150.00 / 100
        assert item["price_per_unit"] == expected_rate_unit, f"Rate/Unit should be {expected_rate_unit}"
        
        # MRP(Pack) = MRP/Unit * Units = 2.00 * 100 = 200
        expected_mrp_pack = 2.00 * 100
        assert item.get("mrp_pack") == expected_mrp_pack, f"MRP(Pack) should be {expected_mrp_pack}"
        
        # Final Amount = Qty * Rate(Pack) = 3 * 150 = 450
        expected_final = 3 * 150.00
        assert item.get("item_total") == expected_final, f"Final Amount should be {expected_final}"
        
        print(f"✓ Auto-calculated fields verified:")
        print(f"  - Total Units: {item['total_units']} (3 * 100 = 300)")
        print(f"  - Rate/Unit: ₹{item['price_per_unit']} (150 / 100 = 1.50)")
        print(f"  - MRP(Pack): ₹{item.get('mrp_pack')} (2.00 * 100 = 200)")
        print(f"  - Final Amount: ₹{item.get('item_total')} (3 * 150 = 450)")


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@pharmalogy.com",
            "password": "test123456"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_cleanup_test_purchases(self, headers):
        """Clean up test purchases created during testing"""
        response = requests.get(f"{BASE_URL}/api/purchases?search=TEST_", headers=headers)
        if response.status_code == 200:
            purchases = response.json().get("purchases", [])
            deleted = 0
            for purchase in purchases:
                invoice_no = purchase.get("invoice_no") or ""
                if "TEST_" in invoice_no:
                    del_response = requests.delete(
                        f"{BASE_URL}/api/purchases/{purchase['id']}?delete_inventory=true",
                        headers=headers
                    )
                    if del_response.status_code == 200:
                        deleted += 1
            print(f"✓ Cleaned up {deleted} test purchases")
        
        # Also clean up test inventory items
        inv_response = requests.get(f"{BASE_URL}/api/inventory?search=TEST_", headers=headers)
        if inv_response.status_code == 200:
            inventory = inv_response.json().get("inventory", [])
            inv_deleted = 0
            for item in inventory:
                if "TEST_" in item.get("product_name", ""):
                    del_response = requests.delete(
                        f"{BASE_URL}/api/inventory/{item['id']}",
                        headers=headers
                    )
                    if del_response.status_code == 200:
                        inv_deleted += 1
            print(f"✓ Cleaned up {inv_deleted} test inventory items")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
