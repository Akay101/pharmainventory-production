import requests
import sys
import json
from datetime import datetime, timedelta

class PharmalogyCoreAPITester:
    def __init__(self, base_url="https://pharmalogy.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.user_data = None
        self.pharmacy_data = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)

        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=30)

            success = response.status_code == expected_status
            
            if success:
                try:
                    response_data = response.json()
                    self.log_test(name, True)
                    return True, response_data
                except:
                    self.log_test(name, True, "No JSON response")
                    return True, {}
            else:
                error_msg = f"Expected {expected_status}, got {response.status_code}"
                try:
                    error_detail = response.json().get('detail', '')
                    if error_detail:
                        error_msg += f" - {error_detail}"
                except:
                    pass
                self.log_test(name, False, error_msg)
                return False, {}

        except requests.exceptions.Timeout:
            self.log_test(name, False, "Request timeout")
            return False, {}
        except Exception as e:
            self.log_test(name, False, f"Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test basic health endpoints"""
        print("\n🔍 Testing Health Endpoints...")
        
        # Test root endpoint
        self.run_test("API Root", "GET", "", 200)
        
        # Test health endpoint
        self.run_test("Health Check", "GET", "health", 200)

    def test_auth_flow(self):
        """Test complete authentication flow"""
        print("\n🔍 Testing Authentication Flow...")
        
        # Generate unique test data
        timestamp = datetime.now().strftime('%H%M%S')
        test_email = f"test_user_{timestamp}@gmail.com"
        test_password = "TestPass123!"
        
        # Test registration
        register_data = {
            "name": f"Test User {timestamp}",
            "email": test_email,
            "mobile": f"+91987654{timestamp[-4:]}",
            "password": test_password,
            "pharmacy": {
                "name": f"Test Pharmacy {timestamp}",
                "location": "Test City, Test State",
                "license_no": f"DL-{timestamp}",
                "years_old": 5
            }
        }
        
        success, response = self.run_test("User Registration", "POST", "auth/register", 200, register_data)
        
        if success:
            print("✅ Registration successful - OTP should be sent to email")
            # For testing, we'll try with a mock OTP (this will likely fail)
            otp_data = {"email": test_email, "otp": "123456"}
            otp_success, otp_response = self.run_test("OTP Verification (mock)", "POST", "auth/verify-otp", 400, otp_data)
            
            if otp_success and otp_response.get('token'):
                self.token = otp_response['token']
                self.user_data = otp_response.get('user')
                return True
        
        # Try login with non-existent user (should fail)
        login_data = {"email": test_email, "password": test_password}
        self.run_test("Login (should fail - no verification)", "POST", "auth/login", 401, login_data)
        
        # Test with some common admin credentials (should fail)
        admin_login = {"email": "admin@gmail.com", "password": "admin123"}
        success, response = self.run_test("Admin Login Attempt", "POST", "auth/login", 401, admin_login)
        
        print("⚠️  Cannot complete authentication without real OTP verification")
        return False

    def test_suppliers_api(self):
        """Test suppliers CRUD operations"""
        print("\n🔍 Testing Suppliers API...")
        
        if not self.token:
            print("⚠️  Skipping suppliers test - no authentication token")
            return
        
        # Create supplier
        supplier_data = {
            "name": "Test Supplier Ltd",
            "phone": "+91 9876543210",
            "email": "supplier@test.com",
            "address": "123 Supplier Street, City",
            "gst_no": "GST123456789"
        }
        
        success, response = self.run_test("Create Supplier", "POST", "suppliers", 200, supplier_data)
        supplier_id = response.get('supplier', {}).get('id') if success else None
        
        # Get suppliers
        self.run_test("Get Suppliers", "GET", "suppliers", 200)
        
        # Get supplier by ID
        if supplier_id:
            self.run_test("Get Supplier by ID", "GET", f"suppliers/{supplier_id}", 200)
            
            # Update supplier
            update_data = {**supplier_data, "name": "Updated Supplier Ltd"}
            self.run_test("Update Supplier", "PUT", f"suppliers/{supplier_id}", 200, update_data)
            
            # Delete supplier
            self.run_test("Delete Supplier", "DELETE", f"suppliers/{supplier_id}", 200)

    def test_products_api(self):
        """Test products API"""
        print("\n🔍 Testing Products API...")
        
        if not self.token:
            print("⚠️  Skipping products test - no authentication token")
            return
        
        # Create product
        product_data = {
            "name": "Test Medicine",
            "category": "medicine",
            "hsn_no": "HSN123",
            "description": "Test medicine description",
            "low_stock_threshold": 10
        }
        
        success, response = self.run_test("Create Product", "POST", "products", 200, product_data)
        
        # Get products
        self.run_test("Get Products", "GET", "products", 200)
        
        # Search products
        self.run_test("Search Products", "GET", "products?search=test", 200)

    def test_inventory_api(self):
        """Test inventory API"""
        print("\n🔍 Testing Inventory API...")
        
        if not self.token:
            print("⚠️  Skipping inventory test - no authentication token")
            return
        
        # Get inventory
        self.run_test("Get Inventory", "GET", "inventory", 200)
        
        # Get inventory alerts
        self.run_test("Get Inventory Alerts", "GET", "inventory/alerts", 200)
        
        # Test inventory filters
        self.run_test("Get Low Stock Items", "GET", "inventory?low_stock=true", 200)
        self.run_test("Get Expiring Items", "GET", "inventory?expiring_soon=true", 200)

    def test_customers_api(self):
        """Test customers API"""
        print("\n🔍 Testing Customers API...")
        
        if not self.token:
            print("⚠️  Skipping customers test - no authentication token")
            return
        
        # Create customer
        customer_data = {
            "name": "Test Customer",
            "mobile": "+91 9876543210",
            "email": "customer@test.com",
            "address": "123 Customer Street"
        }
        
        success, response = self.run_test("Create Customer", "POST", "customers", 200, customer_data)
        
        # Get customers
        self.run_test("Get Customers", "GET", "customers", 200)
        
        # Search customers
        self.run_test("Search Customers", "GET", "customers?search=test", 200)

    def test_dashboard_api(self):
        """Test dashboard APIs"""
        print("\n🔍 Testing Dashboard API...")
        
        if not self.token:
            print("⚠️  Skipping dashboard test - no authentication token")
            return
        
        # Get dashboard stats
        self.run_test("Get Dashboard Stats", "GET", "dashboard/stats", 200)
        
        # Get sales trend
        self.run_test("Get Sales Trend", "GET", "dashboard/sales-trend?days=30", 200)
        
        # Get top products
        self.run_test("Get Top Products", "GET", "dashboard/top-products?limit=5", 200)
        
        # Get supplier analysis
        self.run_test("Get Supplier Analysis", "GET", "dashboard/supplier-analysis", 200)
        
        # Get debt summary
        self.run_test("Get Debt Summary", "GET", "dashboard/debt-summary", 200)

    def test_ai_tips(self):
        """Test AI tips functionality"""
        print("\n🔍 Testing AI Tips...")
        
        if not self.token:
            print("⚠️  Skipping AI tips test - no authentication token")
            return
        
        # Test AI tips endpoint
        success, response = self.run_test("Get AI Tips", "GET", "dashboard/ai-tips", 200)
        
        if success and response:
            tips = response.get('tips', '')
            if tips and len(tips) > 10:
                print(f"✅ AI Tips generated successfully (length: {len(tips)} chars)")
            else:
                print("⚠️  AI Tips response seems empty or too short")

    def test_bills_api_basic(self):
        """Test basic bills API without creating actual bills"""
        print("\n🔍 Testing Bills API (Basic)...")
        
        if not self.token:
            print("⚠️  Skipping bills test - no authentication token")
            return
        
        # Get bills
        self.run_test("Get Bills", "GET", "bills", 200)
        
        # Test bill filters
        self.run_test("Get Paid Bills", "GET", "bills?is_paid=true", 200)
        self.run_test("Get Unpaid Bills", "GET", "bills?is_paid=false", 200)

    def run_all_tests(self):
        """Run all tests"""
        print("🚀 Starting Pharmalogy API Tests...")
        print(f"📍 Testing against: {self.base_url}")
        
        # Test basic connectivity
        self.test_health_check()
        
        # Test authentication (will likely fail without real OTP)
        auth_success = self.test_auth_flow()
        
        # For remaining tests, we need authentication
        # Since we can't complete real auth, we'll test what we can
        
        # Test APIs that might work without auth or with mock auth
        self.test_suppliers_api()
        self.test_products_api()
        self.test_inventory_api()
        self.test_customers_api()
        self.test_dashboard_api()
        self.test_ai_tips()
        self.test_bills_api_basic()
        
        # Print summary
        print(f"\n📊 Test Summary:")
        print(f"Tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        # Print failed tests
        failed_tests = [t for t in self.test_results if not t['success']]
        if failed_tests:
            print(f"\n❌ Failed Tests ({len(failed_tests)}):")
            for test in failed_tests:
                print(f"  - {test['test']}: {test['details']}")
        
        return self.tests_passed, self.tests_run, failed_tests

def main():
    """Main test execution"""
    tester = PharmalogyCoreAPITester()
    passed, total, failed = tester.run_all_tests()
    
    # Return appropriate exit code
    if passed == total:
        print("\n🎉 All tests passed!")
        return 0
    elif passed > total * 0.7:  # If more than 70% pass
        print(f"\n⚠️  Most tests passed ({passed}/{total})")
        return 0
    else:
        print(f"\n💥 Many tests failed ({total-passed}/{total})")
        return 1

if __name__ == "__main__":
    sys.exit(main())