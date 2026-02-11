/**
 * Logging Middleware for Express API
 * Add this to your server.js file
 */

// Add at the top with other requires
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Create write stream for access logs
const accessLogStream = fs.createWriteStream(
  path.join(logsDir, 'access.log'),
  { flags: 'a' }
);

// Custom token for response body
morgan.token('response-body', (req, res) => {
  return res.body ? JSON.stringify(res.body) : '';
});

// Enhanced logging format
const logFormat = ':remote-addr - :method :url :status - :response-time ms - :res[content-length]';

// Add right after your existing middleware (app.use(cors()), etc.)
// But BEFORE your routes

// Console logging (all requests)
app.use(morgan('dev'));

// File logging (detailed)
app.use(morgan(logFormat, { stream: accessLogStream }));

// Request body logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log('\n' + '='.repeat(80));
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  
  if (req.query && Object.keys(req.query).length > 0) {
    console.log('Query:', JSON.stringify(req.query, null, 2));
  }
  
  if (req.params && Object.keys(req.params).length > 0) {
    console.log('Params:', JSON.stringify(req.params, null, 2));
  }
  
  console.log('='.repeat(80) + '\n');
  
  // Capture response
  const originalJson = res.json.bind(res);
  res.json = function(body) {
    res.body = body;
    console.log(`[${timestamp}] RESPONSE:`, JSON.stringify(body, null, 2));
    return originalJson(body);
  };
  
  next();
});

// Error logging middleware (add at the END, after all routes)
app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  console.error('\n' + '!'.repeat(80));
  console.error(`[${timestamp}] ERROR in ${req.method} ${req.url}`);
  console.error('Error:', err);
  console.error('Stack:', err.stack);
  console.error('!'.repeat(80) + '\n');
  
  // Log to file
  fs.appendFileSync(
    path.join(logsDir, 'error.log'),
    `[${timestamp}] ${req.method} ${req.url}\n${err.stack}\n\n`
  );
  
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    timestamp,
  });
});

/**
 * INSTALLATION:
 * 
 * 1. Install morgan:
 *    npm install morgan
 * 
 * 2. Add the code above to server.js:
 *    - Put the requires at the top
 *    - Put the middleware BEFORE your routes
 *    - Put the error handler AFTER your routes
 * 
 * 3. Restart API:
 *    sudo systemctl restart prx-api
 * 
 * 4. View logs:
 *    # Console logs
 *    sudo journalctl -u prx-api -f
 *    
 *    # File logs
 *    tail -f ~/prx-api/logs/access.log
 *    tail -f ~/prx-api/logs/error.log
 */
