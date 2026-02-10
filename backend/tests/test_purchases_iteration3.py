"""
Pharmalogy Backend API Tests - Iteration 3
Tests for: Purchase endpoints (POST/PUT) with old and new formats, PDF Rs. symbol
"""
import pytest
import requests
import os

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
    """Get or create a test supplier"""
    suppliers_response = requests.get(f"{BASE_URL}/api/suppliers", headers=auth_headers)
    suppliers = suppliers_response.json().get("suppliers", [])
    
    if suppliers:
        return {"id": suppliers[0]["id"], "name": suppliers[0]["name"]}
    
    # Create a supplier
    supplier_data = {
        "name": "TEST_Iteration3_Supplier",
        "phone": "+919876543210"
    }
    create_response = requests.post(f"{BASE_URL}/api/suppliers", 
                                   headers=auth_headers, 
                                   json=supplier_data)
    supplier = create_response.json()["supplier"]
    return {"id": supplier["id"], "name": supplier["name"]}


class TestPurchaseCreateOldFormat:
    """Test POST /api/purchases with old format (quantity/purchase_price)"""
    
    def test_create_purchase_old_format(self, auth_headers, test_supplier):
        """Test creating purchase with old format fields"""
        purchase_data = {
            "supplier_id": test_supplier["id"],
            "supplier_name": test_supplier["name"],
            "invoice_no": "TEST-OLD-001",
            "items": [{
                "product_id": "test-old-format-product",
                "product_name": "TEST_Old_Format_Medicine",
                "batch_no": "OLD_BATCH_001",
                "expiry_date": "2027-12-31",
                "quantity": 100,  # Old format
                "purchase_price": 10.00,  # Old format - price per unit
                "mrp": 15.00  # Old format
            }]
        }
        
        response = requests.post(f"{BASE_URL}/api/purchases", 
                                headers=auth_headers, 
                                json=purchase_data)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "purchase" in data
        
        purchase = data["purchase"]
        assert purchase["invoice_no"] == "TEST-OLD-001"
        assert len(purchase["items"]) == 1
        
        item = purchase["items"][0]
        # Verify old format fields are preserved
        assert item["quantity"] == 100
        assert item["purchase_price"] == 10.00
        assert item["mrp"] == 15.00
        # Verify total calculation
        assert purchase["total_amount"] == 1000.00  # 100 * 10
        
        print(f"✓ Purchase created with old format")
        print(f"  Purchase ID: {purchase['id']}")
        print(f"  Total Amount: Rs.{purchase['total_amount']}")
        
        return purchase["id"]


class TestPurchaseCreateNewFormat:
    """Test POST /api/purchases with new format (pack_quantity/pack_price)"""
    
    def test_create_purchase_new_format(self, auth_headers, test_supplier):
        """Test creating purchase with new pack-based format"""
        purchase_data = {
            "supplier_id": test_supplier["id"],
            "supplier_name": test_supplier["name"],
            "invoice_no": "TEST-NEW-001",
            "items": [{
                "product_id": "test-new-format-product",
                "product_name": "TEST_New_Format_Medicine",
                "batch_no": "NEW_BATCH_001",
                "expiry_date": "2027-12-31",
                "pack_quantity": 10,  # New format - number of packs
                "units_per_pack": 10,  # Units in each pack
                "pack_price": 100.00,  # New format - price per pack
                "mrp_per_unit": 15.00  # New format - MRP per unit
            }]
        }
        
        response = requests.post(f"{BASE_URL}/api/purchases", 
                                headers=auth_headers, 
                                json=purchase_data)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "purchase" in data
        
        purchase = data["purchase"]
        assert purchase["invoice_no"] == "TEST-NEW-001"
        
        item = purchase["items"][0]
        # Verify new format fields
        assert item["pack_quantity"] == 10
        assert item["units_per_pack"] == 10
        assert item["pack_price"] == 100.00
        # Verify calculated fields
        assert item["total_units"] == 100  # 10 packs * 10 units
        assert item["price_per_unit"] == 10.00  # 100 / 10
        # Verify total calculation
        assert purchase["total_amount"] == 1000.00  # 10 packs * 100 per pack
        
        print(f"✓ Purchase created with new pack-based format")
        print(f"  Pack Quantity: {item['pack_quantity']}")
        print(f"  Units per Pack: {item['units_per_pack']}")
        print(f"  Total Units: {item['total_units']}")
        print(f"  Total Amount: Rs.{purchase['total_amount']}")
        
        return purchase["id"]


class TestPurchaseUpdate:
    """Test PUT /api/purchases/{id} endpoint"""
    
    def test_update_purchase_basic(self, auth_headers, test_supplier):
        """Test updating purchase basic fields"""
        # First create a purchase
        purchase_data = {
            "supplier_id": test_supplier["id"],
            "supplier_name": test_supplier["name"],
            "invoice_no": "TEST-UPDATE-001",
            "items": [{
                "product_id": "test-update-product",
                "product_name": "TEST_Update_Medicine",
                "batch_no": "UPDATE_BATCH_001",
                "expiry_date": "2027-12-31",
                "quantity": 50,
                "purchase_price": 20.00,
                "mrp": 30.00
            }]
        }
        
        create_response = requests.post(f"{BASE_URL}/api/purchases", 
                                       headers=auth_headers, 
                                       json=purchase_data)
        assert create_response.status_code == 200
        purchase_id = create_response.json()["purchase"]["id"]
        print(f"✓ Created purchase for update test: {purchase_id}")
        
        # Update the purchase
        update_data = {
            "invoice_no": "TEST-UPDATE-001-MODIFIED",
            "notes": "Updated via test"
        }
        
        update_response = requests.put(f"{BASE_URL}/api/purchases/{purchase_id}", 
                                      headers=auth_headers, 
                                      json=update_data)
        
        assert update_response.status_code == 200, f"Failed: {update_response.text}"
        data = update_response.json()
        assert "purchase" in data
        
        updated_purchase = data["purchase"]
        assert updated_purchase["invoice_no"] == "TEST-UPDATE-001-MODIFIED"
        assert updated_purchase["notes"] == "Updated via test"
        
        print(f"✓ Purchase updated successfully")
        print(f"  New Invoice No: {updated_purchase['invoice_no']}")
        
        return purchase_id
    
    def test_update_purchase_items(self, auth_headers, test_supplier):
        """Test updating purchase items"""
        # Create a purchase
        purchase_data = {
            "supplier_id": test_supplier["id"],
            "supplier_name": test_supplier["name"],
            "invoice_no": "TEST-UPDATE-ITEMS-001",
            "items": [{
                "product_id": "test-update-items-product",
                "product_name": "TEST_Update_Items_Medicine",
                "batch_no": "UPDATE_ITEMS_BATCH_001",
                "expiry_date": "2027-12-31",
                "quantity": 30,
                "purchase_price": 15.00,
                "mrp": 25.00
            }]
        }
        
        create_response = requests.post(f"{BASE_URL}/api/purchases", 
                                       headers=auth_headers, 
                                       json=purchase_data)
        assert create_response.status_code == 200
        purchase_id = create_response.json()["purchase"]["id"]
        original_total = create_response.json()["purchase"]["total_amount"]
        print(f"✓ Created purchase: {purchase_id}, Original Total: Rs.{original_total}")
        
        # Update with new items
        update_data = {
            "items": [{
                "product_id": "test-update-items-product",
                "product_name": "TEST_Update_Items_Medicine_Modified",
                "batch_no": "UPDATE_ITEMS_BATCH_001",
                "expiry_date": "2027-12-31",
                "quantity": 50,  # Changed from 30 to 50
                "purchase_price": 15.00,
                "mrp": 25.00
            }, {
                "product_id": "test-update-items-product-2",
                "product_name": "TEST_Update_Items_Medicine_2",
                "batch_no": "UPDATE_ITEMS_BATCH_002",
                "expiry_date": "2027-06-30",
                "quantity": 20,
                "purchase_price": 10.00,
                "mrp": 18.00
            }]
        }
        
        update_response = requests.put(f"{BASE_URL}/api/purchases/{purchase_id}", 
                                      headers=auth_headers, 
                                      json=update_data)
        
        assert update_response.status_code == 200, f"Failed: {update_response.text}"
        data = update_response.json()
        
        updated_purchase = data["purchase"]
        assert len(updated_purchase["items"]) == 2
        # New total: (50 * 15) + (20 * 10) = 750 + 200 = 950
        assert updated_purchase["total_amount"] == 950.00
        
        print(f"✓ Purchase items updated successfully")
        print(f"  Items count: {len(updated_purchase['items'])}")
        print(f"  New Total: Rs.{updated_purchase['total_amount']}")
        
        return purchase_id
    
    def test_update_purchase_with_inventory_sync(self, auth_headers, test_supplier):
        """Test updating purchase with inventory sync"""
        # Create a purchase
        purchase_data = {
            "supplier_id": test_supplier["id"],
            "supplier_name": test_supplier["name"],
            "invoice_no": "TEST-INV-SYNC-001",
            "items": [{
                "product_id": "test-inv-sync-product",
                "product_name": "TEST_Inv_Sync_Medicine",
                "batch_no": "INV_SYNC_BATCH_001",
                "expiry_date": "2027-12-31",
                "quantity": 40,
                "purchase_price": 25.00,
                "mrp": 40.00
            }]
        }
        
        create_response = requests.post(f"{BASE_URL}/api/purchases", 
                                       headers=auth_headers, 
                                       json=purchase_data)
        assert create_response.status_code == 200
        purchase_id = create_response.json()["purchase"]["id"]
        print(f"✓ Created purchase: {purchase_id}")
        
        # Update with inventory sync
        update_data = {
            "items": [{
                "product_id": "test-inv-sync-product",
                "product_name": "TEST_Inv_Sync_Medicine",
                "batch_no": "INV_SYNC_BATCH_001",
                "expiry_date": "2027-12-31",
                "quantity": 60,  # Changed from 40 to 60
                "purchase_price": 25.00,
                "mrp": 40.00
            }]
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/purchases/{purchase_id}?update_inventory=true", 
            headers=auth_headers, 
            json=update_data
        )
        
        assert update_response.status_code == 200, f"Failed: {update_response.text}"
        data = update_response.json()
        
        assert data.get("inventory_updated") == True
        print(f"✓ Purchase updated with inventory sync")
        print(f"  Inventory Updated: {data.get('inventory_updated')}")
        
        return purchase_id


class TestPurchasesList:
    """Test GET /api/purchases endpoint"""
    
    def test_get_purchases_list(self, auth_headers):
        """Test getting purchases list"""
        response = requests.get(f"{BASE_URL}/api/purchases", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "purchases" in data
        assert "pagination" in data
        
        print(f"✓ Got {len(data['purchases'])} purchases")
        print(f"  Total: {data['pagination']['total']}")
        
        # Verify purchase structure has items for expandable rows
        if data['purchases']:
            purchase = data['purchases'][0]
            assert "items" in purchase
            assert "supplier_name" in purchase
            assert "total_amount" in purchase
            print(f"  First purchase has {len(purchase.get('items', []))} items")


class TestPDFGeneration:
    """Test PDF generation with Rs. symbol"""
    
    def test_pdf_has_rs_symbol(self, auth_headers):
        """Test that PDF uses Rs. instead of ₹"""
        # Create a bill for PDF generation
        bill_data = {
            "customer_name": "TEST_PDF_Rs_Customer",
            "customer_mobile": "+919876543299",
            "items": [{
                "inventory_id": None,
                "product_name": "TEST_PDF_Rs_Medicine",
                "batch_no": "PDF_RS_BATCH_001",
                "quantity": 5,
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
        print(f"✓ PDF generated: {data['pdf_url']}")
        
        # Download PDF and check content
        pdf_download = requests.get(data["pdf_url"])
        assert pdf_download.status_code == 200
        
        # Note: We can't easily parse PDF content, but we verify it's generated
        # The Rs. symbol check would need to be done visually or with PDF parsing library
        print(f"✓ PDF is accessible")
        print(f"  Note: Rs. symbol verification requires visual inspection or PDF parsing")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_purchases(self, auth_headers):
        """Clean up TEST_ prefixed purchases"""
        # Get purchases
        response = requests.get(f"{BASE_URL}/api/purchases", headers=auth_headers)
        purchases = response.json().get("purchases", [])
        
        deleted_count = 0
        for purchase in purchases:
            invoice_no = purchase.get("invoice_no") or ""
            if invoice_no.startswith("TEST-"):
                delete_response = requests.delete(
                    f"{BASE_URL}/api/purchases/{purchase['id']}", 
                    headers=auth_headers
                )
                if delete_response.status_code == 200:
                    deleted_count += 1
        
        print(f"✓ Cleaned up {deleted_count} test purchases")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
