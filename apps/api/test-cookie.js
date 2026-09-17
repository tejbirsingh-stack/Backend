const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/refresh',
  method: 'POST',
  headers: {
    'Cookie': 'refreshToken=dummy-token-123; other=test'
  }
};

const req = http.request(options, (res) => {
  console.log('STATUS:', res.statusCode);
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => console.log('BODY:', body));
});

req.on('error', (e) => {
  console.error('ERROR:', e.message);
});
req.end();
