const fs = require('node:fs');
const ts = require('typescript');
const { pathToFileURL } = require('node:url');
require.extensions['.ts'] = (module, filename) => {
 const source = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.url', JSON.stringify(pathToFileURL(filename).href)).replaceAll('import.meta.env.DEV', 'false');
 module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
