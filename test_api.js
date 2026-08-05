const http = require('http');

http.get('http://localhost:3000/api/library/items?workspaceId=c08487b8-7925-4a82-8561-70287d5c4f14', {
  headers: {
    // How to get auth token? We don't have it.
  }
})
