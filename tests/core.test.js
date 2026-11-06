const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const C = require('../core');
global.EasyCore = C;
const EasyStore = require('../storage');
const recipes = JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../data/recipes.json'),'utf8').replace(/^\uFEFF/,'')).recipes.map(x=>new C.Recipe(x));
const valid = {title:'Dinner',date:'2026-10-27',slot:'Dinner',servings:2,notes:''};
function memory(){const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};}
test('JSON conversion and complete offline data',()=>{
 const r=C.Recipe.fromAPI({idMeal:'1',strMeal:'Test',strIngredient1:' Rice ',strMeasure1:'1 cup'});
 assert.deepEqual(r.ingredients,[{name:'Rice',measure:'1 cup'}]);assert.throws(()=>C.Recipe.fromAPI({}));
 assert.equal(recipes.length,8);assert.equal(new Set(recipes.map(x=>x.id)).size,8);
 recipes.forEach(x=>assert.ok(x.instructions&&x.ingredients.length&&x.category));
});
test('ingredient normalization and validation',()=>{
 assert.deepEqual(C.parseIngredients(' RICE, eggs, rice, onions, '),['rice','egg','onion']);
 assert.throws(()=>C.parseIngredients('<script>'));assert.throws(()=>C.parseIngredients('a,b,c,d,e,f,g,h,i'));
 assert.ok(C.ingredientMatches('chicken breast','chicken'));assert.ok(!C.ingredientMatches('rice','licorice'));
});
test('suggestions combine categories and pantry conditions',()=>{
 assert.ok(C.suggestRecipes(recipes,'Vegetarian',[]).every(x=>x.recipe.category==='Vegetarian'));
 const all=C.suggestRecipes(recipes,'All',['egg','rice','onion','soy sauce','vegetable oil']);
 assert.equal(all[0].recipe.id,'local-8');assert.equal(all[0].percent,100);
 const both=C.suggestRecipes(recipes,'Chicken',['egg','rice']);
 assert.equal(both.length,1);assert.equal(both[0].recipe.id,'local-1');
 assert.deepEqual(C.suggestRecipes(recipes,'Seafood',['banana']),[]);
 assert.throws(()=>C.suggestRecipes(recipes,'All',[]));
});
test('calculator handles integers, decimals, fractions and mixed fractions',()=>{
 for(const [m,e] of [['200 g','400 g'],['1/2 cup','1 cup'],['1 1/2 tbsp','3 tbsp'],['1½ cups','3 cups'],['0.25 tsp','0.5 tsp'],['2','4']])
 assert.deepEqual(C.scaleMeasure(m,2,4),{text:e,scaled:true});
 assert.equal(C.scaleMeasure('1/3 cup',1,1).text,'0.333 cup');
});
test('ambiguous amounts and serving boundaries',()=>{
 for(const m of ['to taste','1-2 tbsp','1 to 2 cups','1/0 cup','a pinch',''])assert.equal(C.scaleMeasure(m,2,4).scaled,false);
 for(const n of [0,-1,1.2,101,'','abc',Infinity])assert.throws(()=>C.scaleMeasure('1 cup',n,2));
 assert.equal(C.servingCount(1),1);assert.equal(C.servingCount(100),100);
});
test('meal input validation',()=>{
 for(const x of [{title:'  '},{date:'2026-02-30'},{date:''},{slot:'Brunch'},{servings:0},{notes:'x'.repeat(501)}])
 assert.throws(()=>C.validatePlan({...valid,...x}));
 assert.equal(C.validatePlan({...valid,date:'2028-02-29'}).date,'2028-02-29');
});
test('CRUD persists across store instances, including recipe snapshot',()=>{
 const memoryStore=memory();let s=new EasyStore(memoryStore);
 assert.deepEqual(s.plans(),[]);s.savePlan({...valid,recipe:recipes[0]});
 s=new EasyStore(memoryStore);const p=s.plans()[0];assert.equal(p.recipe.ingredients.length,7);
 s.savePlan({...p,servings:4,notes:'Updated'},p.id);
 assert.equal(new EasyStore(memoryStore).plans()[0].servings,4);
 assert.equal(new EasyStore(memoryStore).plans()[0].notes,'Updated');
 s.deletePlan(p.id);assert.deepEqual(new EasyStore(memoryStore).plans(),[]);
 assert.throws(()=>s.deletePlan(p.id));assert.throws(()=>s.savePlan(valid,'missing'));
});
test('recommendation snapshots restore',()=>{
 const m=memory(),s=new EasyStore(m),saved={category:'Chicken',ingredients:'rice',savedAt:new Date().toISOString(),items:C.suggestRecipes(recipes,'Chicken',['rice'])};
 s.write('recommendations',saved);assert.deepEqual(new EasyStore(m).recommendations(),JSON.parse(JSON.stringify(saved)));
});
test('corrupt stored data is caught and preserved',()=>{
 const m=memory();m.setItem('easycook.plans.v1','{broken');let warned=false;
 const s=new EasyStore(m,()=>{warned=true;});assert.deepEqual(s.plans(),[]);assert.ok(warned);
 assert.equal(m.getItem('easycook.plans.v1'),'{broken');
});
test('storage failures do not report success',()=>{
 const s=new EasyStore({getItem:()=>null,setItem:()=>{throw Error('Quota');}});
 assert.throws(()=>s.savePlan(valid),/No changes were saved/);
});


test('a mutation cannot overwrite corrupted meal plans',()=>{
 const m=memory();m.setItem('easycook.plans.v1','{broken');const s=new EasyStore(m);
 assert.throws(()=>s.savePlan(valid),/No changes were saved/);
 assert.equal(m.getItem('easycook.plans.v1'),'{broken');
});
test('Electron boot configures isolated pages and restricts protocol access',async()=>{
 const vm=require('node:vm'),path=require('node:path'),handlers={};let loaded,windowOptions,privileges,protocolHandler;
 const electron={
  app:{whenReady:()=>Promise.resolve(),on:(name,cb)=>{handlers[name]=cb;},quit:()=>{}},
  BrowserWindow:class {
   constructor(options){windowOptions=options;this.webContents={setWindowOpenHandler:cb=>{handlers.open=cb;},on:(name,cb)=>{handlers[name]=cb;}};}
   loadURL(url){loaded=url;}
   static getAllWindows(){return [{}];}
  },
  Menu:{setApplicationMenu:()=>{},buildFromTemplate:x=>x},
  protocol:{registerSchemesAsPrivileged:x=>{privileges=x;},handle:(scheme,cb)=>{assert.equal(scheme,'easycook');protocolHandler=cb;}},
  net:{fetch:url=>Promise.resolve(url)},
  session:{defaultSession:{setPermissionRequestHandler:cb=>{handlers.permission=cb;}}}
 };
 const source=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
 vm.runInNewContext(source,{require:name=>name==='electron'?electron:require(name),__dirname:path.join(__dirname,'..'),process,URL,Response});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(loaded,'easycook://app/index.html');assert.equal(windowOptions.webPreferences.nodeIntegration,false);
 assert.equal(windowOptions.webPreferences.contextIsolation,true);assert.equal(windowOptions.webPreferences.sandbox,true);
 assert.equal(privileges[0].privileges.secure,true);assert.equal(privileges[0].privileges.standard,true);
 assert.equal(handlers.open().action,'deny');
 assert.equal((await protocolHandler({url:'easycook://app/secret.txt'})).status,404);
 assert.equal((await protocolHandler({url:'easycook://other/index.html'})).status,404);
 assert.ok((await protocolHandler({url:'easycook://app/index.html'})).startsWith('file:'));
 let prevented=false;handlers['will-navigate']({preventDefault:()=>{prevented=true;}},'https://example.com');assert.ok(prevented);
 let permission;handlers.permission(null,'camera',value=>{permission=value;});assert.equal(permission,false);
});

