const swaggerAutogen = require('swagger-autogen')();

const doc = {
  info: {
    title: 'Pharmalogy API',
    description: 'Complete API documentation for the Pharmalogy Pharmacy Management System backend.',
    version: '2.0.0',
  },
  host: 'localhost:8001',
  schemes: ['http', 'https'],
  securityDefinitions: {
    BearerAuth: {
      type: 'apiKey',
      in: 'header',
      name: 'Authorization',
      description: 'Please enter your JWT token provided by login endpoint. Example: "Bearer eyJhbG..."'
    }
  },
  security: [
    { BearerAuth: [] }
  ],
  tags: [
    { name: 'Auth', description: 'Authentication and Login' },
    { name: 'Users', description: 'User Management (Admin only)' },
    { name: 'Suppliers', description: 'Supplier Information and Debt Management' },
    { name: 'Products', description: 'Inventory Core Objects' },
    { name: 'Purchases', description: 'Procurement and Wholesale' },
    { name: 'Inventory', description: 'Stock tracking and Batches' },
    { name: 'Customers', description: 'Customer Information and Retail Debt' },
    { name: 'Bills', description: 'Retail POS checkout and Receipts' },
    { name: 'Dashboard', description: 'High level business aggregation and analytics' },
    { name: 'Medicines', description: 'AI driven universal medicines dictionary' },
    { name: 'Payments', description: 'Payment gateway integrations' },
    { name: 'Chat', description: 'AI Assistant conversations' },
  ],
};

const outputFile = './swagger-output.json';
// Point directly to where Express routes are mounted
const endpointsFiles = ['./server.js'];

// Generate the swagger file
swaggerAutogen(outputFile, endpointsFiles, doc).then(() => {
    console.log("Swagger documentation generated successfully in swagger-output.json!");
});
