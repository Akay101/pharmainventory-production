#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

## user_problem_statement: "Duplicate product entries in inventory when batch details change. Need unique product grouping in search/billing suggestions, inline batch dropdown selection in billing, and an inventory merge feature to safely consolidate existing duplicates without breaking history."
## backend:
##   - task: "Product catalog lookup/creation in Purchases"
##     implemented: true
##     working: true
##     file: "backend-node/routes/purchases.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Synchronizes products table during purchase creation/edit and links batches by product_id."
##   - task: "Purchase discount, scheme integration & PDF layout"
##     implemented: true
##     working: true
##     file: "backend-node/routes/purchases.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Computes unit cost price factoring in discount and free scheme items, stocks total quantity in inventory, and generates PDF containing DISC% and SCHEME columns, with optimized column widths to prevent header wrapping."
##   - task: "Grouped medicine search and suggestions"
##     implemented: true
##     working: true
##     file: "backend-node/routes/medicines.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Groups inventory matching items by product name, sum stock quantities, and return a nested batches array. Passed automated tests successfully."
##   - task: "Inventory Batch Merge API"
##     implemented: true
##     working: true
##     file: "backend-node/routes/inventory.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Handles merging multiple inventory records, consolidating duplicate batches, updating purchases and bills tables nested records, rewriting deleted inventory IDs, and cleaning up unused products. Passed automated integration tests successfully."
## frontend:
##   - task: "Billing page batch selection dropdown"
##     implemented: true
##     working: true
##     file: "frontend/src/pages/BillingPage.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Renders batch dropdown for inventory items, automatically selects earliest expiry in stock (FEFO), updates pricing and totals dynamically on batch change, and handles loading batches during edit bill."
##   - task: "Inventory page merge selection UI"
##     implemented: true
##     working: true
##     file: "frontend/src/pages/InventoryPage.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Added checkboxes for multi-select, a Merge Selected button, and a merge configuration Dialog with warning details."
##   - task: "Revamped Purchases items input table & math sync"
##     implemented: true
##     working: true
##     file: "frontend/src/pages/PurchasesPage.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Redesigned items table to 9 columns, synchronized CGST/SGST, and auto-adjusted Rate per Pack when total is overridden."
##   - task: "Batch Dropdown Pagination UI and Supplier Name info"
##     implemented: true
##     working: true
##     file: "frontend/src/pages/BillingPage.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Displays supplier name in each batch item inside the dropdown and limits displayed items to 10 by default, offering a Show More button to load subsequent batches without closing the dropdown."
##   - task: "Database-Level Skip/Limit Pagination"
##     implemented: true
##     working: true
##     file: "backend-node/routes/inventory.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Replaced in-memory slicing pagination with MongoDB native skip() and limit() cursor operations, adding pagination response fields to both the list and search endpoints."
##   - task: "Product Catalog Details Popup Dialog"
##     implemented: true
##     working: true
##     file: "frontend/src/pages/InventoryPage.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Provides a premium modal to view all associated inventory batches of a product catalog card on click, including batch numbers, expiry dates, quantities, prices, supplier names, and status badges."
##   - task: "Catalog Merge Option inside Details Popup"
##     implemented: true
##     working: true
##     file: "frontend/src/pages/InventoryPage.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Added a sub-merge form toggle inside the details popup letting users select other catalog products, fetches their respective batch IDs, and merges all items in a single transaction under the target product."
## metadata:
##   created_by: "main_agent"
##   version: "1.4"
##   test_sequence: 5
##   run_ui: false
## test_plan:
##   current_focus:
##     - "Product catalog lookup/creation in Purchases"
##     - "Grouped medicine search and suggestions"
##     - "Inventory Batch Merge API"
##     - "Billing page batch selection dropdown"
##     - "Inventory page merge selection UI"
##     - "Batch Dropdown Pagination UI and Supplier Name info"
##     - "Database-Level Skip/Limit Pagination"
##     - "Product Catalog Details Popup Dialog"
##     - "Catalog Merge Option inside Details Popup"
##     - "Purchase discount, scheme integration & PDF layout"
##     - "Revamped Purchases items input table & math sync"
##   stuck_tasks: []
##   test_all: true
##   test_priority: "high_first"
## agent_communication:
##   - agent: "main"
##     message: "Successfully implemented discount percentage and scheme quantity math calculations, revamped the purchases table layout into a clean 9-column format, fixed the missing JSX conditional closing tags syntax error, successfully verified build compile, and passed integration calculations unit test."