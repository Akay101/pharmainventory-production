"""
Test Billing Page Features - Iteration 5
Tests:
1. Login with test credentials
2. Inventory search endpoint GET /api/inventory/search?q={search_term}
3. Create bill with items
4. Edit bill endpoint PUT /api/bills/{bill_id}
5. Delete bill with restore inventory option
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://pharmalogy.preview.emergentagent.com').rstrip('/')

class TestBillingFeatures:
    """Test billing page features for iteration 5"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@pharmalogy.com",
            "password": "test123456"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
        
        # Cleanup - delete test bills
        self._cleanup_test_data()
    
    def _cleanup_test_data(self):
        """Clean up test data created during tests"""
        try:
            # Get all bills and delete test ones
            response = self.session.get(f"{BASE_URL}/api/bills")
            if response.status_code == 200:
                bills = response.json().get("bills", [])
                for bill in bills:
                    if bill.get("customer_name", "").startswith("TEST_"):
                        self.session.delete(f"{BASE_URL}/api/bills/{bill['id']}?restore_inventory=true")
        except Exception as e:
            print(f"Cleanup error: {e}")
    
    def test_01_login_success(self):
        """Test login with test credentials"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@pharmalogy.com",
            "password": "test123456"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == "test@pharmalogy.com"
        print("✓ Login successful with test credentials")
    
    def test_02_inventory_search_endpoint(self):
        """Test GET /api/inventory/search?q={search_term} endpoint"""
        # First, ensure we have some inventory
        response = self.session.get(f"{BASE_URL}/api/inventory?limit=5")
        assert response.status_code == 200
        inventory = response.json().get("inventory", [])
        
        if len(inventory) > 0:
            # Get a product name to search for
            product_name = inventory[0].get("product_name", "")
            search_term = product_name[:3] if len(product_name) >= 3 else product_name
            
            # Test search endpoint
            response = self.session.get(f"{BASE_URL}/api/inventory/search?q={search_term}&limit=15")
            assert response.status_code == 200
            data = response.json()
            assert "inventory" in data
            assert "count" in data
            print(f"✓ Inventory search endpoint works - found {data['count']} items for '{search_term}'")
        else:
            # Create test inventory via purchase
            self._create_test_inventory()
            response = self.session.get(f"{BASE_URL}/api/inventory/search?q=TEST&limit=15")
            assert response.status_code == 200
            print("✓ Inventory search endpoint works (created test inventory)")
    
    def _create_test_inventory(self):
        """Create test inventory via purchase"""
        # First create a supplier
        supplier_response = self.session.post(f"{BASE_URL}/api/suppliers", json={
            "name": "TEST_Supplier_Billing",
            "phone": "9999999999"
        })
        supplier_id = None
        if supplier_response.status_code == 200:
            supplier_id = supplier_response.json().get("supplier", {}).get("id")
        
        # Create purchase to add inventory
        purchase_data = {
            "supplier_id": supplier_id,
            "supplier_name": "TEST_Supplier_Billing",
            "invoice_no": "TEST-BILL-INV-001",
            "items": [{
                "product_name": "TEST_Medicine_Billing",
                "batch_no": "BATCH-TEST-001",
                "expiry_date": "2027-12-31",
                "pack_quantity": 10,
                "units_per_pack": 10,
                "pack_price": 100,
                "mrp_per_unit": 15
            }]
        }
        response = self.session.post(f"{BASE_URL}/api/purchases", json=purchase_data)
        return response.status_code == 200
    
    def test_03_create_bill_with_items(self):
        """Test creating a bill with items"""
        # First ensure we have inventory
        response = self.session.get(f"{BASE_URL}/api/inventory?limit=5")
        inventory = response.json().get("inventory", [])
        
        if len(inventory) == 0:
            self._create_test_inventory()
            response = self.session.get(f"{BASE_URL}/api/inventory?limit=5")
            inventory = response.json().get("inventory", [])
        
        if len(inventory) > 0:
            inv_item = inventory[0]
            
            # Create bill
            bill_data = {
                "customer_name": "TEST_Customer_Billing",
                "customer_mobile": "9876543210",
                "customer_email": "test_customer@test.com",
                "items": [{
                    "inventory_id": inv_item["id"],
                    "product_name": inv_item["product_name"],
                    "batch_no": inv_item.get("batch_no", ""),
                    "quantity": 1,
                    "unit_price": inv_item.get("mrp", 10),
                    "discount_percent": 0
                }],
                "discount_percent": 0,
                "is_paid": True
            }
            
            response = self.session.post(f"{BASE_URL}/api/bills", json=bill_data)
            assert response.status_code == 200, f"Create bill failed: {response.text}"
            data = response.json()
            assert "bill" in data
            assert data["bill"]["customer_name"] == "TEST_Customer_Billing"
            assert "bill_no" in data["bill"]
            self.test_bill_id = data["bill"]["id"]
            print(f"✓ Bill created successfully: {data['bill']['bill_no']}")
            return data["bill"]["id"]
        else:
            pytest.skip("No inventory available to create bill")
    
    def test_04_edit_bill_endpoint(self):
        """Test PUT /api/bills/{bill_id} endpoint"""
        # First create a bill
        bill_id = self.test_03_create_bill_with_items()
        
        if bill_id:
            # Edit the bill
            edit_data = {
                "customer_name": "TEST_Customer_Updated",
                "customer_mobile": "9876543211",
                "customer_email": "updated@test.com",
                "discount_percent": 5,
                "is_paid": True,
                "notes": "Test note added via edit"
            }
            
            response = self.session.put(f"{BASE_URL}/api/bills/{bill_id}", json=edit_data)
            assert response.status_code == 200, f"Edit bill failed: {response.text}"
            data = response.json()
            assert "bill" in data
            assert data["bill"]["customer_name"] == "TEST_Customer_Updated"
            assert data["bill"]["discount_percent"] == 5
            assert data["bill"]["notes"] == "Test note added via edit"
            print(f"✓ Bill edited successfully - customer name updated, discount set to 5%")
            
            # Verify the edit persisted
            get_response = self.session.get(f"{BASE_URL}/api/bills/{bill_id}")
            assert get_response.status_code == 200
            bill = get_response.json().get("bill", {})
            assert bill["customer_name"] == "TEST_Customer_Updated"
            print("✓ Edit persisted correctly in database")
    
    def test_05_delete_bill_with_restore_inventory(self):
        """Test DELETE /api/bills/{bill_id}?restore_inventory=true"""
        # First create a bill
        bill_id = self.test_03_create_bill_with_items()
        
        if bill_id:
            # Get inventory count before delete
            response = self.session.get(f"{BASE_URL}/api/inventory")
            inv_before = response.json().get("inventory", [])
            
            # Delete with restore inventory
            response = self.session.delete(f"{BASE_URL}/api/bills/{bill_id}?restore_inventory=true")
            assert response.status_code == 200, f"Delete bill failed: {response.text}"
            data = response.json()
            assert "message" in data
            print(f"✓ Bill deleted with restore_inventory=true - {data.get('restored_inventory_items', 0)} items restored")
            
            # Verify bill is deleted
            get_response = self.session.get(f"{BASE_URL}/api/bills/{bill_id}")
            assert get_response.status_code == 404
            print("✓ Bill confirmed deleted")
    
    def test_06_delete_bill_without_restore(self):
        """Test DELETE /api/bills/{bill_id}?restore_inventory=false"""
        # First create a bill
        bill_id = self.test_03_create_bill_with_items()
        
        if bill_id:
            # Delete without restore inventory
            response = self.session.delete(f"{BASE_URL}/api/bills/{bill_id}?restore_inventory=false")
            assert response.status_code == 200, f"Delete bill failed: {response.text}"
            data = response.json()
            assert "message" in data
            print(f"✓ Bill deleted with restore_inventory=false")
    
    def test_07_get_bills_list(self):
        """Test GET /api/bills endpoint"""
        response = self.session.get(f"{BASE_URL}/api/bills")
        assert response.status_code == 200
        data = response.json()
        assert "bills" in data
        assert "pagination" in data
        print(f"✓ Bills list retrieved - {len(data['bills'])} bills found")


class TestPurchasesKeyboardShortcuts:
    """Test purchases page features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@pharmalogy.com",
            "password": "test123456"
        })
        assert response.status_code == 200
        data = response.json()
        self.token = data["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
    
    def test_01_get_purchases_list(self):
        """Test GET /api/purchases endpoint"""
        response = self.session.get(f"{BASE_URL}/api/purchases")
        assert response.status_code == 200
        data = response.json()
        assert "purchases" in data
        assert "pagination" in data
        print(f"✓ Purchases list retrieved - {len(data['purchases'])} purchases found")
    
    def test_02_get_suppliers_list(self):
        """Test GET /api/suppliers endpoint"""
        response = self.session.get(f"{BASE_URL}/api/suppliers")
        assert response.status_code == 200
        data = response.json()
        assert "suppliers" in data
        print(f"✓ Suppliers list retrieved - {len(data['suppliers'])} suppliers found")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
