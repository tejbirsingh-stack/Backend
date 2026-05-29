const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

async function testUpload() {
    console.log('Creating test file...');
    
    // Create a test file
    const testFilePath = path.join(__dirname, 'test-image.png');
    
    // Create a simple PNG file (1x1 pixel red dot)
    const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
        0x54, 0x08, 0x99, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
        0x00, 0x00, 0x03, 0x00, 0x01, 0x5e, 0xb3, 0x48,
        0x4e, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND chunk
        0x44, 0xae, 0x42, 0x60, 0x82
    ]);
    
    fs.writeFileSync(testFilePath, pngBuffer);
    console.log('Test file created:', testFilePath);
    
    // Create form data
    const form = new FormData();
    form.append('file', fs.createReadStream(testFilePath), {
        filename: 'test-image.png',
        contentType: 'image/png'
    });
    
    try {
        console.log('Uploading to server...');
        const response = await axios.post('http://localhost:3000/api/media/upload', form, {
            headers: {
                ...form.getHeaders()
            }
        });
        
        console.log('✅ Upload successful!');
        console.log('Response:', JSON.stringify(response.data, null, 2));
        
        // Clean up
        fs.unlinkSync(testFilePath);
        
        // Check if file exists in uploads
        if (response.data.asset && response.data.asset.id) {
            const uploadedFilePath = path.join(__dirname, 'uploads', response.data.asset.id);
            if (fs.existsSync(uploadedFilePath)) {
                console.log('✅ File exists in uploads directory!');
            } else {
                console.log('❌ File not found in uploads directory');
            }
        }
        
    } catch (error) {
        console.error('❌ Upload failed:', error.response ? error.response.data : error.message);
        // Clean up
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
    }
}

// First check if server is running
axios.get('http://localhost:3000/api/health')
    .then(() => {
        console.log('✅ Server is running');
        testUpload();
    })
    .catch(() => {
        console.log('❌ Server is not running. Please start the enhanced media server first.');
    });