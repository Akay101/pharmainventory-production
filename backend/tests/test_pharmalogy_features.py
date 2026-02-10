"""
Pharmalogy Backend API Tests
Tests for: CSV import, JSON data migration, negative billing, inventory deduplication, 
PDF generation, and medicine search suggestions
"""
import pytest
import requests
import os
import json
import tempfile

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test@pharmalogy.com"
TEST_PASSWORD = "test123456"


class TestAuthentication:
    """Authentication tests"""
    
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
        print(f"✓ Login successful - User: {data['user']['name']}, Role: {data['user']['role']}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials rejected correctly")


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


class TestMedicineSearch:
    """Medicine database search tests (253K medicines)"""
    
    def test_medicine_search_basic(self, auth_headers):
        """Test basic medicine search"""
        response = requests.get(f"{BASE_URL}/api/medicines/search?q=paracetamol&limit=10")
        assert response.status_code == 200
        data = response.json()
        assert "medicines" in data
        print(f"✓ Medicine search returned {len(data['medicines'])} results for 'paracetamol'")
        
        if len(data['medicines']) > 0:
            medicine = data['medicines'][0]
            assert "name" in medicine
            print(f"  Sample: {medicine['name']}")
    
    def test_medicine_search_short_query(self):
        """Test medicine search with short query (should require min 2 chars)"""
        response = requests.get(f"{BASE_URL}/api/medicines/search?q=a&limit=10")
        # Should return 422 validation error for query < 2 chars
        assert response.status_code == 422
        print("✓ Short query validation works correctly")
    
    def test_medicine_search_various_terms(self):
        """Test medicine search with various terms"""
        search_terms = ["amoxicillin", "ibuprofen", "metformin", "aspirin"]
        for term in search_terms:
            response = requests.get(f"{BASE_URL}/api/medicines/search?q={term}&limit=5")
            assert response.status_code == 200
            data = response.json()
            print(f"✓ Search '{term}': {len(data['medicines'])} results")


class TestSuppliers:
    """Supplier management tests"""
    
    def test_get_suppliers(self, auth_headers):
        """Test getting suppliers list"""
        response = requests.get(f"{BASE_URL}/api/suppliers", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "suppliers" in data
        print(f"✓ Got {len(data['suppliers'])} suppliers")
        return data['suppliers']
    
    def test_create_supplier(self, auth_headers):
        """Test creating a new supplier"""
        supplier_data = {
            "name": "TEST_Supplier_CSV_Import",
            "phone": "+919876543210",
            "email": "test_supplier@example.com",
            "address": "Test Address",
            "gst_no": "29ABCDE1234F1Z5"
        }
        response = requests.post(f"{BASE_URL}/api/suppliers", 
                                 headers=auth_headers, 
                                 json=supplier_data)
        assert response.status_code == 200
        data = response.json()
        assert "supplier" in data
        assert data["supplier"]["name"] == supplier_data["name"]
        print(f"✓ Created supplier: {data['supplier']['name']}")
        return data["supplier"]["id"]


class TestCSVImport:
    """CSV import functionality tests"""
    
    def test_csv_columns_endpoint(self, auth_headers):
        """Test CSV columns extraction endpoint"""
        # Create a sample CSV file
        csv_content = """Product Name,Batch No,Expiry Date,Quantity,Purchase Price,MRP,HSN
Paracetamol 500mg,BATCH001,2025-12-31,100,5.50,10.00,30049099
Amoxicillin 250mg,BATCH002,2025-06-30,50,12.00,20.00,30041000
"""
        files = {'file': ('test.csv', csv_content, 'text/csv')}
        
        # Remove Content-Type from headers for multipart
        headers = {"Authorization": auth_headers["Authorization"]}
        
        response = requests.post(f"{BASE_URL}/api/purchases/csv-columns", 
                                 headers=headers, 
                                 files=files)
        assert response.status_code == 200
        data = response.json()
        assert "columns" in data
        assert "sample_data" in data
        
        expected_columns = ["Product Name", "Batch No", "Expiry Date", "Quantity", "Purchase Price", "MRP", "HSN"]
        for col in expected_columns:
            assert col in data["columns"], f"Missing column: {col}"
        
        print(f"✓ CSV columns extracted: {data['columns']}")
        print(f"✓ Sample data rows: {len(data['sample_data'])}")
    
    def test_csv_import_full_flow(self, auth_headers):
        """Test full CSV import flow"""
        # First, get or create a supplier
        suppliers_response = requests.get(f"{BASE_URL}/api/suppliers", headers=auth_headers)
        suppliers = suppliers_response.json().get("suppliers", [])
        
        if not suppliers:
            # Create a supplier
            supplier_data = {
                "name": "TEST_CSV_Import_Supplier",
                "phone": "+919876543210"
            }
            create_response = requests.post(f"{BASE_URL}/api/suppliers", 
                                           headers=auth_headers, 
                                           json=supplier_data)
            supplier_id = create_response.json()["supplier"]["id"]
            supplier_name = supplier_data["name"]
        else:
            supplier_id = suppliers[0]["id"]
            supplier_name = suppliers[0]["name"]
        
        # Create CSV content
        csv_content = """Product Name,Batch No,Expiry Date,Quantity,Purchase Price,MRP,HSN
TEST_Medicine_CSV_1,CSVBATCH001,2026-12-31,50,8.00,15.00,30049099
TEST_Medicine_CSV_2,CSVBATCH002,2026-06-30,30,15.00,25.00,30041000
TEST_Medicine_CSV_3,CSVBATCH003,2026-09-15,75,5.00,10.00,30049099
"""
        
        files = {'file': ('test_import.csv', csv_content, 'text/csv')}
        form_data = {
            'supplier_id': supplier_id,
            'supplier_name': supplier_name,
            'product_name_col': 'Product Name',
            'batch_no_col': 'Batch No',
            'expiry_date_col': 'Expiry Date',
            'quantity_col': 'Quantity',
            'purchase_price_col': 'Purchase Price',
            'mrp_col': 'MRP',
            'hsn_col': 'HSN'
        }
        
        headers = {"Authorization": auth_headers["Authorization"]}
        
        response = requests.post(f"{BASE_URL}/api/purchases/import-csv", 
                                 headers=headers, 
                                 files=files,
                                 data=form_data)
        
        assert response.status_code == 200
        data = response.json()
        assert "items_imported" in data
        assert data["items_imported"] == 3
        print(f"✓ CSV import successful: {data['items_imported']} items imported")
        print(f"  Purchase ID: {data['purchase_id']}")
        print(f"  Total Amount: ₹{data['total_amount']}")
        
        # Verify items in inventory
        inventory_response = requests.get(f"{BASE_URL}/api/inventory?search=TEST_Medicine_CSV", 
                                          headers=auth_headers)
        inventory = inventory_response.json().get("inventory", [])
        print(f"✓ Verified {len(inventory)} items in inventory")


class TestInventoryDeduplication:
    """Test inventory deduplication - same batch/supplier should update quantity"""
    
    def test_inventory_deduplication(self, auth_headers):
        """Test that adding same product with same batch/supplier updates quantity"""
        # Get or create supplier
        suppliers_response = requests.get(f"{BASE_URL}/api/suppliers", headers=auth_headers)
        suppliers = suppliers_response.json().get("suppliers", [])
        
        if not suppliers:
            supplier_data = {"name": "TEST_Dedup_Supplier", "phone": "+919876543210"}
            create_response = requests.post(f"{BASE_URL}/api/suppliers", 
                                           headers=auth_headers, 
                                           json=supplier_data)
            supplier_id = create_response.json()["supplier"]["id"]
            supplier_name = supplier_data["name"]
        else:
            supplier_id = suppliers[0]["id"]
            supplier_name = suppliers[0]["name"]
        
        # First purchase
        purchase1 = {
            "supplier_id": supplier_id,
            "supplier_name": supplier_name,
            "items": [{
                "product_id": "test-dedup-product",
                "product_name": "TEST_Dedup_Medicine",
                "batch_no": "DEDUP_BATCH_001",
                "expiry_date": "2026-12-31",
                "quantity": 100,
                "purchase_price": 10.00,
                "mrp": 15.00
            }]
        }
        
        response1 = requests.post(f"{BASE_URL}/api/purchases", 
                                  headers=auth_headers, 
                                  json=purchase1)
        assert response1.status_code == 200
        print("✓ First purchase created (100 units)")
        
        # Check inventory
        inv_response1 = requests.get(f"{BASE_URL}/api/inventory?search=TEST_Dedup_Medicine", 
                                     headers=auth_headers)
        inventory1 = inv_response1.json().get("inventory", [])
        initial_qty = sum(i["available_quantity"] for i in inventory1 if i["batch_no"] == "DEDUP_BATCH_001")
        print(f"  Initial inventory quantity: {initial_qty}")
        
        # Second purchase with same batch and supplier
        purchase2 = {
            "supplier_id": supplier_id,
            "supplier_name": supplier_name,
            "items": [{
                "product_id": "test-dedup-product",
                "product_name": "TEST_Dedup_Medicine",
                "batch_no": "DEDUP_BATCH_001",
                "expiry_date": "2026-12-31",
                "quantity": 50,
                "purchase_price": 10.00,
                "mrp": 15.00
            }]
        }
        
        response2 = requests.post(f"{BASE_URL}/api/purchases", 
                                  headers=auth_headers, 
                                  json=purchase2)
        assert response2.status_code == 200
        print("✓ Second purchase created (50 units)")
        
        # Check inventory again - should have updated quantity, not created duplicate
        inv_response2 = requests.get(f"{BASE_URL}/api/inventory?search=TEST_Dedup_Medicine", 
                                     headers=auth_headers)
        inventory2 = inv_response2.json().get("inventory", [])
        
        # Count items with same batch
        same_batch_items = [i for i in inventory2 if i["batch_no"] == "DEDUP_BATCH_001"]
        final_qty = sum(i["available_quantity"] for i in same_batch_items)
        
        print(f"  Final inventory quantity: {final_qty}")
        print(f"  Number of inventory entries with same batch: {len(same_batch_items)}")
        
        # Should have only 1 entry (deduplicated) with combined quantity
        assert len(same_batch_items) == 1, f"Expected 1 entry, got {len(same_batch_items)} - deduplication failed"
        assert final_qty == initial_qty + 50, f"Expected {initial_qty + 50}, got {final_qty}"
        print("✓ Deduplication working correctly - quantity updated, no duplicate created")


class TestNegativeBilling:
    """Test negative billing (manual entry for items not in inventory)"""
    
    def test_negative_billing_preview(self, auth_headers):
        """Test bill preview with manual items"""
        bill_data = {
            "customer_name": "TEST_Manual_Customer",
            "customer_mobile": "+919876543210",
            "items": [{
                "inventory_id": None,
                "product_name": "TEST_Manual_Medicine",
                "batch_no": "MANUAL_001",
                "quantity": 5,
                "unit_price": 100.00,
                "purchase_price": 70.00,
                "discount_percent": 0,
                "is_manual": True
            }],
            "discount_percent": 0
        }
        
        response = requests.post(f"{BASE_URL}/api/bills/preview", 
                                 headers=auth_headers, 
                                 json=bill_data)
        assert response.status_code == 200
        data = response.json()
        
        assert "items" in data
        assert "grand_total" in data
        assert "total_profit" in data
        
        # Check manual item is marked correctly
        assert data["items"][0]["is_manual"] == True
        assert data["grand_total"] == 500.00  # 5 * 100
        
        # Profit should be (5 * 100) - (5 * 70) = 150
        expected_profit = 150.00
        assert data["total_profit"] == expected_profit, f"Expected profit {expected_profit}, got {data['total_profit']}"
        
        print(f"✓ Manual billing preview works")
        print(f"  Grand Total: ₹{data['grand_total']}")
        print(f"  Profit: ₹{data['total_profit']}")
    
    def test_negative_billing_create(self, auth_headers):
        """Test creating a bill with manual items"""
        bill_data = {
            "customer_name": "TEST_Negative_Bill_Customer",
            "customer_mobile": "+919876543211",
            "customer_email": "test_negative@example.com",
            "items": [{
                "inventory_id": None,
                "product_name": "TEST_Negative_Medicine_1",
                "batch_no": "NEG_BATCH_001",
                "quantity": 10,
                "unit_price": 50.00,
                "purchase_price": 35.00,
                "discount_percent": 5,
                "is_manual": True
            }, {
                "inventory_id": None,
                "product_name": "TEST_Negative_Medicine_2",
                "batch_no": None,
                "quantity": 3,
                "unit_price": 200.00,
                "purchase_price": 150.00,
                "discount_percent": 0,
                "is_manual": True
            }],
            "discount_percent": 0,
            "is_paid": True
        }
        
        response = requests.post(f"{BASE_URL}/api/bills", 
                                 headers=auth_headers, 
                                 json=bill_data)
        assert response.status_code == 200
        data = response.json()
        
        assert "bill" in data
        bill = data["bill"]
        assert bill["customer_name"] == "TEST_Negative_Bill_Customer"
        assert len(bill["items"]) == 2
        
        # Verify manual items are marked
        for item in bill["items"]:
            assert item["is_manual"] == True
        
        print(f"✓ Negative billing bill created successfully")
        print(f"  Bill No: {bill['bill_no']}")
        print(f"  Grand Total: ₹{bill['grand_total']}")
        print(f"  Profit: ₹{bill['profit']}")
        
        return bill["id"]


class TestPDFGeneration:
    """Test PDF generation with pharmacy logo"""
    
    def test_pdf_generation(self, auth_headers):
        """Test generating PDF for a bill"""
        # First create a bill
        bill_data = {
            "customer_name": "TEST_PDF_Customer",
            "customer_mobile": "+919876543212",
            "items": [{
                "inventory_id": None,
                "product_name": "TEST_PDF_Medicine",
                "batch_no": "PDF_BATCH_001",
                "quantity": 2,
                "unit_price": 100.00,
                "purchase_price": 70.00,
                "discount_percent": 0,
                "is_manual": True
            }],
            "discount_percent": 0,
            "is_paid": True
        }
        
        create_response = requests.post(f"{BASE_URL}/api/bills", 
                                        headers=auth_headers, 
                                        json=bill_data)
        assert create_response.status_code == 200
        bill_id = create_response.json()["bill"]["id"]
        print(f"✓ Created bill for PDF test: {bill_id}")
        
        # Generate PDF
        pdf_response = requests.post(f"{BASE_URL}/api/bills/{bill_id}/generate-pdf", 
                                     headers=auth_headers)
        assert pdf_response.status_code == 200
        data = pdf_response.json()
        
        assert "pdf_url" in data
        assert data["pdf_url"] is not None
        assert len(data["pdf_url"]) > 0
        
        print(f"✓ PDF generated successfully")
        print(f"  PDF URL: {data['pdf_url']}")
        
        # Verify PDF is accessible
        pdf_download = requests.get(data["pdf_url"])
        assert pdf_download.status_code == 200
        assert "application/pdf" in pdf_download.headers.get("Content-Type", "")
        print(f"✓ PDF is accessible and valid")


class TestDataMigration:
    """Test JSON data migration functionality"""
    
    def test_migration_template_download(self, auth_headers):
        """Test downloading migration templates"""
        data_types = ["suppliers", "customers", "products", "inventory"]
        
        for data_type in data_types:
            response = requests.get(f"{BASE_URL}/api/migrate/template/{data_type}", 
                                    headers=auth_headers)
            assert response.status_code == 200
            data = response.json()
            assert "template" in data
            print(f"✓ Template for '{data_type}' available")
    
    def test_migrate_suppliers(self, auth_headers):
        """Test migrating suppliers from JSON"""
        suppliers_json = [
            {
                "name": "TEST_Migrated_Supplier_1",
                "phone": "+919876543213",
                "email": "migrated1@example.com",
                "address": "Migrated Address 1",
                "gst_no": "29MIGR1234F1Z5"
            },
            {
                "name": "TEST_Migrated_Supplier_2",
                "phone": "+919876543214",
                "email": "migrated2@example.com"
            }
        ]
        
        # Create temp JSON file
        json_content = json.dumps(suppliers_json)
        files = {'file': ('suppliers.json', json_content, 'application/json')}
        form_data = {'data_type': 'suppliers'}
        
        headers = {"Authorization": auth_headers["Authorization"]}
        
        response = requests.post(f"{BASE_URL}/api/migrate/data", 
                                 headers=headers, 
                                 files=files,
                                 data=form_data)
        
        assert response.status_code == 200
        data = response.json()
        assert "imported" in data
        assert data["imported"] == 2
        print(f"✓ Migrated {data['imported']} suppliers successfully")
        
        # Verify suppliers exist
        suppliers_response = requests.get(f"{BASE_URL}/api/suppliers?search=TEST_Migrated", 
                                          headers=auth_headers)
        suppliers = suppliers_response.json().get("suppliers", [])
        assert len(suppliers) >= 2
        print(f"✓ Verified migrated suppliers in database")
    
    def test_migrate_customers(self, auth_headers):
        """Test migrating customers from JSON"""
        customers_json = [
            {
                "name": "TEST_Migrated_Customer_1",
                "mobile": "+919876543215",
                "email": "migrated_cust1@example.com",
                "address": "Customer Address 1"
            },
            {
                "name": "TEST_Migrated_Customer_2",
                "mobile": "+919876543216"
            }
        ]
        
        json_content = json.dumps(customers_json)
        files = {'file': ('customers.json', json_content, 'application/json')}
        form_data = {'data_type': 'customers'}
        
        headers = {"Authorization": auth_headers["Authorization"]}
        
        response = requests.post(f"{BASE_URL}/api/migrate/data", 
                                 headers=headers, 
                                 files=files,
                                 data=form_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["imported"] == 2
        print(f"✓ Migrated {data['imported']} customers successfully")
    
    def test_migrate_products(self, auth_headers):
        """Test migrating products from JSON"""
        products_json = [
            {
                "name": "TEST_Migrated_Product_1",
                "category": "medicine",
                "hsn_no": "30049099",
                "description": "Migrated product 1",
                "low_stock_threshold": 20
            },
            {
                "name": "TEST_Migrated_Product_2",
                "category": "medicine"
            }
        ]
        
        json_content = json.dumps(products_json)
        files = {'file': ('products.json', json_content, 'application/json')}
        form_data = {'data_type': 'products'}
        
        headers = {"Authorization": auth_headers["Authorization"]}
        
        response = requests.post(f"{BASE_URL}/api/migrate/data", 
                                 headers=headers, 
                                 files=files,
                                 data=form_data)
        
        assert response.status_code == 200
        data = response.json()
        assert data["imported"] == 2
        print(f"✓ Migrated {data['imported']} products successfully")


class TestDashboard:
    """Test dashboard and analytics endpoints"""
    
    def test_dashboard_stats(self, auth_headers):
        """Test dashboard stats endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "today" in data
        assert "month" in data
        assert "inventory" in data
        assert "pending" in data
        
        print(f"✓ Dashboard stats retrieved")
        print(f"  Today's Revenue: ₹{data['today']['revenue']}")
        print(f"  Monthly Revenue: ₹{data['month']['revenue']}")
        print(f"  Inventory Items: {data['inventory']['total_items']}")
    
    def test_inventory_alerts(self, auth_headers):
        """Test inventory alerts endpoint"""
        response = requests.get(f"{BASE_URL}/api/inventory/alerts", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "low_stock_alerts" in data
        assert "expiry_alerts" in data
        
        print(f"✓ Inventory alerts retrieved")
        print(f"  Low stock alerts: {len(data['low_stock_alerts'])}")
        print(f"  Expiry alerts: {len(data['expiry_alerts'])}")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_data(self, auth_headers):
        """Clean up TEST_ prefixed data"""
        # Get and delete test suppliers
        suppliers_response = requests.get(f"{BASE_URL}/api/suppliers", headers=auth_headers)
        suppliers = suppliers_response.json().get("suppliers", [])
        
        deleted_count = 0
        for supplier in suppliers:
            if supplier["name"].startswith("TEST_"):
                delete_response = requests.delete(
                    f"{BASE_URL}/api/suppliers/{supplier['id']}", 
                    headers=auth_headers
                )
                if delete_response.status_code == 200:
                    deleted_count += 1
        
        print(f"✓ Cleaned up {deleted_count} test suppliers")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
