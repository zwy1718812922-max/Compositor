const { parentPort } = require('node:worker_threads');
const { readPsdDocument, writePsdDocument } = require('./psd.cjs');
parentPort.on('message', ({ id, action, payload }) => {
  try {
    if (action === 'read') parentPort.postMessage({ id, value: readPsdDocument(Buffer.from(payload)) });
    else if (action === 'write') { const bytes = writePsdDocument(payload.project,payload.composite); parentPort.postMessage({id,value:bytes}); }
    else throw new Error('未知 PSD 操作。');
  } catch (error) { parentPort.postMessage({ id,error:error.message }); }
});
