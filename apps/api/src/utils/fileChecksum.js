const crypto = require('crypto');
const { Readable } = require('stream');

function sha256HexFromBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function sha256HexFromStream(readable) {
  if (!readable) {
    throw new Error('Readable stream is required');
  }

  // AWS SDK v3 SdkStreamMixin
  if (typeof readable.transformToByteArray === 'function') {
    const bytes = await readable.transformToByteArray();
    return sha256HexFromBuffer(Buffer.from(bytes));
  }

  if (typeof readable.transformToWebStream === 'function') {
    const webStream = readable.transformToWebStream();
    const nodeReadable = Readable.fromWeb(webStream);
    return sha256HexFromNodeReadable(nodeReadable);
  }

  if (typeof readable[Symbol.asyncIterator] === 'function' && typeof readable.on !== 'function') {
    const hash = crypto.createHash('sha256');
    for await (const chunk of readable) {
      hash.update(chunk);
    }
    return hash.digest('hex');
  }

  return sha256HexFromNodeReadable(readable);
}

function sha256HexFromNodeReadable(readable) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    let settled = false;

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(value);
    };

    readable.on('data', (chunk) => {
      hash.update(chunk);
    });
    readable.on('end', () => finish(null, hash.digest('hex')));
    readable.on('error', (err) => finish(err));
  });
}

module.exports = {
  sha256HexFromBuffer,
  sha256HexFromStream,
};
