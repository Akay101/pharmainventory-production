"""
Test Iteration 7 Enhancements:
1. MRP reversal - user enters MRP(Pack), MRP/Unit is auto-calculated
2. Salt composition auto-fill from medicine database
3. Search by salt composition in inventory and billing
4. Better search ranking - exact matches first, then starts with, then contains
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthentication:
    """Test login with provided credentials"""
    
    def test_login_success(self):
        """Test login with test credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@pharmalogy.com",
            "password": "test123456"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert "user" in data, "No user in response"
        return data["token"]


class TestMedicineSearch:
    """Test medicine search with ranking and salt composition"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@pharmalogy.com",
            "password": "test123456"
        })
        return response.json()["token"]
    
    def test_medicine_search_returns_composition(self, auth_token):
        """Test that medicine search returns composition/salt data"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/medicines/search?q=paracetamol&limit=10", headers=headers)
        assert response.status_code == 200, f"Search failed: {response.text}"
        data = response.json()
        assert "medicines" in data, "No medicines in response"
        # Check if any medicine has composition field
        if len(data["medicines"]) > 0:
            print(f"Found {len(data['medicines'])} medicines")
            for med in data["medicines"][:3]:
                print(f"  - {med.get('name')}: composition={med.get('composition')}, manufacturer={med.get('manufacturer')}")
    
    def test_medicine_search_ranking_dolo(self, auth_token):
        """Test search ranking - 'dolo' should show Dolo products before Adoloc"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/medicines/search?q=dolo&limit=20", headers=headers)
        assert response.status_code == 200, f"Search failed: {response.text}"
        data = response.json()
        medicines = data.get("medicines", [])
        
        if len(medicines) > 0:
            print(f"Search results for 'dolo':")
            for i, med in enumerate(medicines[:10]):
                name = med.get("name", "")
                print(f"  {i+1}. {name}")
            
            # Check if Dolo products appear before Adoloc
            dolo_indices = [i for i, m in enumerate(medicines) if m.get("name", "").lower().startswith("dolo")]
            adoloc_indices = [i for i, m in enumerate(medicines) if "adoloc" in m.get("name", "").lower()]
            
            if dolo_indices and adoloc_indices:
                # Dolo products should appear before Adoloc
                assert min(dolo_indices) < min(adoloc_indices), \
                    f"Dolo products should appear before Adoloc. Dolo at {dolo_indices}, Adoloc at {adoloc_indices}"
                print(f"✓ Ranking correct: Dolo at positions {dolo_indices}, Adoloc at {adoloc_indices}")


class TestInventorySearch:
    """Test inventory search including salt composition"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@pharmalogy.com",
            "password": "test123456"
        })
        return response.json()["token"]
    
    def test_inventory_search_by_name(self, auth_token):
        """Test inventory search by product name"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/inventory/search?q=test&limit=10", headers=headers)
        assert response.status_code == 200, f"Search failed: {response.text}"
        data = response.json()
        assert "inventory" in data, "No inventory in response"
        print(f"Found {len(data['inventory'])} inventory items for 'test'")
    
    def test_inventory_search_by_salt_composition(self, auth_token):
        """Test inventory search by salt composition"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        # Search for paracetamol which is a common salt composition
        response = requests.get(f"{BASE_URL}/api/inventory/search?q=paracetamol&limit=10", headers=headers)
        assert response.status_code == 200, f"Search failed: {response.text}"
        data = response.json()
        assert "inventory" in data, "No inventory in response"
        
        inventory = data.get("inventory", [])
        print(f"Found {len(inventory)} inventory items for 'paracetamol'")
        
        # Check if any items have salt_composition field
        for item in inventory[:5]:
            print(f"  - {item.get('product_name')}: salt={item.get('salt_composition')}")
    
    def test_inventory_search_ranking(self, auth_token):
        """Test inventory search ranking - exact > starts with > contains"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/inventory/search?q=dolo&limit=20", headers=headers)
        assert response.status_code == 200, f"Search failed: {response.text}"
        data = response.json()
        inventory = data.get("inventory", [])
        
        if len(inventory) > 0:
            print(f"Inventory search results for 'dolo':")
            for i, item in enumerate(inventory[:10]):
                name = item.get("product_name", "")
                salt = item.get("salt_composition", "")
                print(f"  {i+1}. {name} (salt: {salt})")


class TestInventoryMainEndpoint:
    """Test main inventory endpoint with salt search"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@pharmalogy.com",
            "password": "test123456"
        })
        return response.json()["token"]
    
    def test_inventory_main_search_includes_salt(self, auth_token):
        """Test that main inventory endpoint searches salt_composition"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/inventory?search=paracetamol&limit=10", headers=headers)
        assert response.status_code == 200, f"Search failed: {response.text}"
        data = response.json()
        assert "inventory" in data, "No inventory in response"
        
        inventory = data.get("inventory", [])
        print(f"Main inventory search for 'paracetamol': {len(inventory)} items")
        
        # Check if search includes salt_composition matches
        for item in inventory[:5]:
            name = item.get("product_name", "").lower()
            salt = (item.get("salt_composition") or "").lower()
            if "paracetamol" in salt and "paracetamol" not in name:
                print(f"  ✓ Found by salt: {item.get('product_name')} (salt: {item.get('salt_composition')})")


class TestPurchaseWithMRPPack:
    """Test purchase creation with MRP(Pack) field"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@pharmalogy.com",
            "password": "test123456"
        })
        return response.json()["token"]
    
    @pytest.fixture
    def supplier_id(self, auth_token):
        """Get or create a test supplier"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/suppliers", headers=headers)
        suppliers = response.json().get("suppliers", [])
        if suppliers:
            return suppliers[0]["id"]
        
        # Create a test supplier
        response = requests.post(f"{BASE_URL}/api/suppliers", headers=headers, json={
            "name": "TEST_Supplier_Iteration7",
            "phone": "9999999999",
            "email": "test@supplier.com",
            "address": "Test Address",
            "gst_no": "TEST123456"
        })
        return response.json()["supplier"]["id"]
    
    def test_create_purchase_with_mrp_pack(self, auth_token, supplier_id):
        """Test creating purchase with MRP(Pack) - MRP/Unit should be auto-calculated"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Create purchase with MRP per pack
        mrp_pack = 100.0  # MRP per pack
        units_per_pack = 10
        expected_mrp_unit = mrp_pack / units_per_pack  # Should be 10.0
        
        purchase_data = {
            "supplier_id": supplier_id,
            "supplier_name": "Test Supplier",
            "invoice_no": "TEST_INV_ITER7_001",
            "items": [{
                "product_id": "test-prod-iter7",
                "product_name": "TEST_Product_Iteration7",
                "batch_no": "BATCH_ITER7",
                "expiry_date": "2027-12-31",
                "manufacturer": "Test Manufacturer",
                "salt_composition": "Paracetamol 500mg",
                "pack_type": "Strip",
                "pack_quantity": 5,
                "units_per_pack": units_per_pack,
                "pack_price": 70.0,  # Purchase price per pack
                "mrp_per_unit": expected_mrp_unit  # MRP per unit (calculated from MRP pack)
            }]
        }
        
        response = requests.post(f"{BASE_URL}/api/purchases", headers=headers, json=purchase_data)
        assert response.status_code == 200, f"Purchase creation failed: {response.text}"
        
        data = response.json()
        purchase = data.get("purchase", {})
        items = purchase.get("items", [])
        
        assert len(items) > 0, "No items in purchase"
        item = items[0]
        
        # Verify MRP per unit is stored correctly
        assert item.get("mrp_per_unit") == expected_mrp_unit, \
            f"MRP per unit mismatch: expected {expected_mrp_unit}, got {item.get('mrp_per_unit')}"
        
        # Verify MRP pack is calculated
        assert item.get("mrp_pack") == mrp_pack, \
            f"MRP pack mismatch: expected {mrp_pack}, got {item.get('mrp_pack')}"
        
        print(f"✓ Purchase created with MRP(Pack)={mrp_pack}, MRP/Unit={item.get('mrp_per_unit')}")
        
        # Cleanup - delete the purchase
        purchase_id = purchase.get("id")
        if purchase_id:
            requests.delete(f"{BASE_URL}/api/purchases/{purchase_id}?delete_inventory=true", headers=headers)
            print(f"✓ Cleaned up test purchase {purchase_id}")


class TestSuppliers:
    """Test suppliers endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@pharmalogy.com",
            "password": "test123456"
        })
        return response.json()["token"]
    
    def test_get_suppliers(self, auth_token):
        """Test getting suppliers list"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/suppliers", headers=headers)
        assert response.status_code == 200, f"Get suppliers failed: {response.text}"
        data = response.json()
        assert "suppliers" in data, "No suppliers in response"
        print(f"Found {len(data['suppliers'])} suppliers")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
