"""
Backend API Tests for Pharmalogy Node.js Migration
Tests all CRUD operations and critical endpoints after migration from Python/FastAPI to Node.js/Express
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://pharmalogy.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "test@pharmalogy.com"
TEST_PASSWORD = "test123456"


class TestAuthEndpoints:
    """Authentication endpoint tests"""
    
    def test_health_check(self):
        """Test health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["stack"] == "Node.js/Express"
        print(f"✓ Health check passed: {data}")
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_EMAIL
        assert data["user"]["role"] == "ADMIN"
        print(f"✓ Login success: user={data['user']['name']}, role={data['user']['role']}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        print(f"✓ Invalid login rejected: {data['detail']}")
    
    def test_auth_me_endpoint(self):
        """Test GET /api/auth/me with valid token"""
        # First login
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        token = login_resp.json()["token"]
        
        # Test /me endpoint
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "user" in data
        assert data["user"]["email"] == TEST_EMAIL
        print(f"✓ Auth me endpoint: user={data['user']['name']}")
    
    def test_auth_me_without_token(self):
        """Test GET /api/auth/me without token"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("✓ Auth me without token rejected")


@pytest.fixture(scope="class")
def auth_token():
    """Get authentication token for tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["token"]
    pytest.skip("Authentication failed")


class TestDashboardEndpoints:
    """Dashboard endpoint tests"""
    
    def test_dashboard_stats(self, auth_token):
        """Test GET /api/dashboard"""
        response = requests.get(f"{BASE_URL}/api/dashboard", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "today" in data
        assert "monthly" in data
        assert "total" in data
        assert "counts" in data
        print(f"✓ Dashboard stats: today_sales={data['today']['sales']}, monthly_sales={data['monthly']['sales']}")
    
    def test_dashboard_sales_trend(self, auth_token):
        """Test GET /api/dashboard/sales-trend"""
        response = requests.get(f"{BASE_URL}/api/dashboard/sales-trend?days=7", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "trend" in data
        assert isinstance(data["trend"], list)
        print(f"✓ Sales trend: {len(data['trend'])} days of data")
    
    def test_dashboard_debt_summary(self, auth_token):
        """Test GET /api/dashboard/debt-summary"""
        response = requests.get(f"{BASE_URL}/api/dashboard/debt-summary", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "total_debt" in data
        assert "customers_with_debt" in data
        assert "top_debtors" in data
        print(f"✓ Debt summary: total_debt={data['total_debt']}, customers_with_debt={data['customers_with_debt']}")
    
    def test_dashboard_top_products(self, auth_token):
        """Test GET /api/dashboard/top-products"""
        response = requests.get(f"{BASE_URL}/api/dashboard/top-products?limit=5", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "top_products" in data
        assert isinstance(data["top_products"], list)
        print(f"✓ Top products: {len(data['top_products'])} products")


class TestInventoryEndpoints:
    """Inventory endpoint tests"""
    
    def test_inventory_list(self, auth_token):
        """Test GET /api/inventory"""
        response = requests.get(f"{BASE_URL}/api/inventory", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "inventory" in data
        assert "pagination" in data
        print(f"✓ Inventory list: {len(data['inventory'])} items, total={data['pagination']['total']}")
    
    def test_inventory_search(self, auth_token):
        """Test GET /api/inventory/search"""
        response = requests.get(f"{BASE_URL}/api/inventory/search?q=dolo", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "inventory" in data
        print(f"✓ Inventory search 'dolo': {len(data['inventory'])} results")
    
    def test_inventory_search_by_salt(self, auth_token):
        """Test inventory search by salt composition"""
        response = requests.get(f"{BASE_URL}/api/inventory/search?q=paracetamol", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "inventory" in data
        print(f"✓ Inventory search 'paracetamol': {len(data['inventory'])} results")
    
    def test_inventory_alerts(self, auth_token):
        """Test GET /api/inventory/alerts"""
        response = requests.get(f"{BASE_URL}/api/inventory/alerts", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "low_stock_alerts" in data
        assert "expiry_alerts" in data
        print(f"✓ Inventory alerts: low_stock={len(data['low_stock_alerts'])}, expiring={len(data['expiry_alerts'])}")


class TestSuppliersEndpoints:
    """Suppliers CRUD tests"""
    
    def test_suppliers_list(self, auth_token):
        """Test GET /api/suppliers"""
        response = requests.get(f"{BASE_URL}/api/suppliers", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "suppliers" in data
        assert "pagination" in data
        print(f"✓ Suppliers list: {len(data['suppliers'])} suppliers")
    
    def test_supplier_crud(self, auth_token):
        """Test supplier Create, Read, Update, Delete"""
        # CREATE
        create_resp = requests.post(f"{BASE_URL}/api/suppliers", 
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": f"TEST_Supplier_{uuid.uuid4().hex[:8]}",
                "contact": "9876543210",
                "email": "test_supplier@example.com"
            }
        )
        assert create_resp.status_code == 201
        supplier = create_resp.json()["supplier"]
        supplier_id = supplier["id"]
        print(f"✓ Supplier created: {supplier['name']}")
        
        # READ
        read_resp = requests.get(f"{BASE_URL}/api/suppliers/{supplier_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert read_resp.status_code == 200
        print(f"✓ Supplier read: {read_resp.json()['supplier']['name']}")
        
        # UPDATE
        update_resp = requests.put(f"{BASE_URL}/api/suppliers/{supplier_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"name": "TEST_Updated_Supplier", "contact": "1234567890"}
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["supplier"]["name"] == "TEST_Updated_Supplier"
        print(f"✓ Supplier updated")
        
        # DELETE
        delete_resp = requests.delete(f"{BASE_URL}/api/suppliers/{supplier_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert delete_resp.status_code == 200
        print(f"✓ Supplier deleted")


class TestCustomersEndpoints:
    """Customers CRUD tests"""
    
    def test_customers_list(self, auth_token):
        """Test GET /api/customers"""
        response = requests.get(f"{BASE_URL}/api/customers", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "customers" in data
        assert "pagination" in data
        print(f"✓ Customers list: {len(data['customers'])} customers")
    
    def test_customer_crud(self, auth_token):
        """Test customer Create, Read, Update, Delete"""
        # CREATE
        create_resp = requests.post(f"{BASE_URL}/api/customers",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "name": f"TEST_Customer_{uuid.uuid4().hex[:8]}",
                "mobile": "9876543210",
                "email": "test_customer@example.com"
            }
        )
        assert create_resp.status_code == 201
        customer = create_resp.json()["customer"]
        customer_id = customer["id"]
        print(f"✓ Customer created: {customer['name']}")
        
        # READ
        read_resp = requests.get(f"{BASE_URL}/api/customers/{customer_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert read_resp.status_code == 200
        print(f"✓ Customer read: {read_resp.json()['customer']['name']}")
        
        # UPDATE
        update_resp = requests.put(f"{BASE_URL}/api/customers/{customer_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"name": "TEST_Updated_Customer", "mobile": "1234567890"}
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["customer"]["name"] == "TEST_Updated_Customer"
        print(f"✓ Customer updated")
        
        # DELETE
        delete_resp = requests.delete(f"{BASE_URL}/api/customers/{customer_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert delete_resp.status_code == 200
        print(f"✓ Customer deleted")
    
    def test_customer_search(self, auth_token):
        """Test GET /api/customers/search"""
        response = requests.get(f"{BASE_URL}/api/customers/search?q=walk", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "customers" in data
        print(f"✓ Customer search: {len(data['customers'])} results")


class TestBillsEndpoints:
    """Bills CRUD tests"""
    
    def test_bills_list(self, auth_token):
        """Test GET /api/bills"""
        response = requests.get(f"{BASE_URL}/api/bills", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "bills" in data
        assert "pagination" in data
        print(f"✓ Bills list: {len(data['bills'])} bills, total={data['pagination']['total']}")
    
    def test_bill_create_and_delete(self, auth_token):
        """Test bill creation and deletion"""
        # First get inventory to use for bill
        inv_resp = requests.get(f"{BASE_URL}/api/inventory?limit=1", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        inventory = inv_resp.json().get("inventory", [])
        
        if not inventory:
            pytest.skip("No inventory items available for bill test")
        
        inv_item = inventory[0]
        
        # CREATE bill
        create_resp = requests.post(f"{BASE_URL}/api/bills",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "customer_name": "TEST_Bill_Customer",
                "customer_mobile": "9999999999",
                "items": [{
                    "inventory_id": inv_item["id"],
                    "product_name": inv_item["product_name"],
                    "batch_no": inv_item.get("batch_no"),
                    "quantity": 1,
                    "unit_price": inv_item.get("mrp", 10),
                    "purchase_price": inv_item.get("purchase_price", 5)
                }],
                "is_paid": True
            }
        )
        assert create_resp.status_code == 201
        bill = create_resp.json()["bill"]
        bill_id = bill["id"]
        print(f"✓ Bill created: {bill['bill_no']}, total={bill['total_amount']}")
        
        # READ
        read_resp = requests.get(f"{BASE_URL}/api/bills/{bill_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert read_resp.status_code == 200
        print(f"✓ Bill read: {read_resp.json()['bill_no']}")
        
        # DELETE (restore inventory)
        delete_resp = requests.delete(f"{BASE_URL}/api/bills/{bill_id}?restore_inventory=true",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert delete_resp.status_code == 200
        print(f"✓ Bill deleted with inventory restored")


class TestPurchasesEndpoints:
    """Purchases CRUD tests"""
    
    def test_purchases_list(self, auth_token):
        """Test GET /api/purchases"""
        response = requests.get(f"{BASE_URL}/api/purchases", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "purchases" in data
        assert "pagination" in data
        print(f"✓ Purchases list: {len(data['purchases'])} purchases")
    
    def test_purchase_create_and_delete(self, auth_token):
        """Test purchase creation and deletion"""
        # First get a supplier
        sup_resp = requests.get(f"{BASE_URL}/api/suppliers?limit=1", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        suppliers = sup_resp.json().get("suppliers", [])
        
        supplier_id = suppliers[0]["id"] if suppliers else None
        supplier_name = suppliers[0]["name"] if suppliers else "Test Supplier"
        
        # CREATE purchase
        create_resp = requests.post(f"{BASE_URL}/api/purchases",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "supplier_id": supplier_id,
                "supplier_name": supplier_name,
                "invoice_no": f"TEST_INV_{uuid.uuid4().hex[:8]}",
                "items": [{
                    "product_name": "TEST_Product_Migration",
                    "batch_no": f"BATCH_{uuid.uuid4().hex[:6]}",
                    "expiry_date": "2027-12-31",
                    "pack_quantity": 2,
                    "units_per_pack": 10,
                    "pack_price": 100,
                    "mrp_per_unit": 12,
                    "pack_type": "Strip"
                }]
            }
        )
        assert create_resp.status_code == 201
        purchase = create_resp.json()["purchase"]
        purchase_id = purchase["id"]
        print(f"✓ Purchase created: invoice={purchase['invoice_no']}, total={purchase['total_amount']}")
        
        # Verify inventory was created
        inv_resp = requests.get(f"{BASE_URL}/api/inventory/search?q=TEST_Product_Migration", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert inv_resp.status_code == 200
        inv_data = inv_resp.json()
        assert len(inv_data["inventory"]) > 0
        print(f"✓ Inventory created from purchase: {inv_data['inventory'][0]['available_quantity']} units")
        
        # DELETE purchase
        delete_resp = requests.delete(f"{BASE_URL}/api/purchases/{purchase_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert delete_resp.status_code == 200
        print(f"✓ Purchase deleted")


class TestProductsEndpoints:
    """Products endpoint tests"""
    
    def test_products_list(self, auth_token):
        """Test GET /api/products"""
        response = requests.get(f"{BASE_URL}/api/products", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "products" in data
        assert "pagination" in data
        print(f"✓ Products list: {len(data['products'])} products")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
