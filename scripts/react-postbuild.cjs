const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),runtime=fs.existsSync(path.join(root,'index.html'))&&!fs.existsSync(path.join(root,'outputs/index.html'))?root:path.join(root,'outputs'),out=path.join(runtime,'react-ui');
const bundle=fs.readFileSync(path.join(out,'trackside-shape-react.js')),hash=crypto.createHash('sha256').update(bundle).digest('hex').slice(0,12);
const reactDomRoot=path.dirname(require.resolve('react-dom/package.json',{paths:[root]}));
const notices=['react','react-dom','scheduler'].map(name=>{const pkg=require.resolve(name+'/package.json',{paths:[root,reactDomRoot]}),dir=path.dirname(pkg),meta=JSON.parse(fs.readFileSync(pkg,'utf8'));return name+' '+meta.version+'\n'+fs.readFileSync(path.join(dir,'LICENSE'),'utf8');});
fs.writeFileSync(path.join(out,'LICENSES.txt'),notices.join('\n\n---\n\n'));
for(const name of ['trackside-shape-export.js','trackside-editor-react.js']){const bridge=path.join(runtime,name);if(fs.existsSync(bridge)){const text=fs.readFileSync(bridge,'utf8');if(text.includes('react-ui/trackside-shape-react.js?v='))fs.writeFileSync(bridge,text.replace(/react-ui\/trackside-shape-react\.js\?v=[0-9a-f]{12}/g,'react-ui/trackside-shape-react.js?v='+hash));}
}console.log(JSON.stringify({reactBundleBytes:bundle.length,bundleHash:hash,licenses:3}));

