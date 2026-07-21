const B2Storage = require('./b2-storage.cjs');
async function test() {
  const b2 = new B2Storage();
  try {
    console.log("Attempting to delete a file that doesn't exist...");
    await b2.permanentlyDeleteFile('nonexistent_thumb2.jpg');
    console.log("Success");
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
