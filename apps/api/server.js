// Production entry point redirection for hosting environments requiring server.js
const path = require('path');

// Ensure we load the compiled JavaScript file from the dist directory
require('./dist/index.js');
