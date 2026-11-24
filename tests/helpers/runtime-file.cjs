const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const outputs = join(root, 'outputs');
const runtime = existsSync(join(outputs, 'index.html')) ? outputs : root;

module.exports = name => join(runtime, name);
