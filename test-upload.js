const fetch = require('node-fetch');
async function test() {
  const initRes = await fetch('http://localhost:3000/api/media/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: 'test.mp4',
      fileSize: 1000,
      mimeType: 'video/mp4',
      ownerType: 'WORKSPACE',
      ownerId: '449ce002-11d9-47a9-b0d1-3dfd1526151a',
      linkedProjectId: '35b92297-4ef3-4b47-b988-0a8a0908d6d4'
    })
  });
  console.log('INIT:', await initRes.text());
}
test();
