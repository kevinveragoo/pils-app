//
//  test-organization-access.mjs
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 22/10/2026.
//
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const nativeRequire=createRequire(import.meta.url),cache=new Map();
let user={id:'user',name:'User',organization:'CUT',role:'ADMIN',roles:'["ADMIN","HEALTHCARE_ASSISTANT","HEALTHCARE_NAVIGATOR","FACILITY_STAFF"]',status:'APPROVED',mustChangePassword:false};
let network=[];
let logReads=0;
const db={session:{findUnique:async()=>({expiresAt:new Date(Date.now()+60000),user})}};
const redirect=target=>{throw new Error('REDIRECT:'+target);};
function load(file){
 const filename=path.resolve(file);if(cache.has(filename))return cache.get(filename);
 const loaded={exports:{}};cache.set(filename,loaded.exports);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{module:loaded,exports:loaded.exports,URL,URLSearchParams,Request,Response,AbortSignal,Date,Intl,console,process:{env:{REDCAP_API_URL:'https://redcap.invalid',REDCAP_API_TOKEN:'test'}},
  require:name=>{
   if(name==='server-only')return {};
   if(name==='next/headers')return {cookies:async()=>({get:()=>({value:'test-session'})})};
   if(name==='next/navigation')return {redirect};
   if(name==='next/server')return {NextResponse:Response};
   if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
   if(name==='next/image'||name==='next/link')return {__esModule:true,default:()=>null};
   if(name==='@/lib/db')return {db};
   if(name==='@/app/auth-actions')return {logoutAction:async()=>{}};
   if(name.startsWith('@/components/')&&name!=='@/components/AppHeader')return new Proxy({__esModule:true,default:()=>null},{get:(o,k)=>k in o?o[k]:()=>null});
   if(name==='@/lib/redcap-logs')return {loadActivities:async()=>{logReads++;return {entries:[],truncated:false};}};
   if(name.startsWith('@/')&&name.endsWith('.json'))return JSON.parse(fs.readFileSync(name.slice(2)));
   if(name.startsWith('@/')){const target=name.slice(2);return load(fs.existsSync(target+'.ts')?target+'.ts':target+'.tsx');}
   if(name.endsWith('.json'))return JSON.parse(fs.readFileSync(path.resolve(path.dirname(filename),name)));
   if(name.startsWith('.'))return load(path.resolve(path.dirname(filename),name+'.ts'));
   return nativeRequire(name);
  },
  fetch:async (_url,options)=>{network.push(options.body);assert.notEqual(options.body.get('action'),'import','Access checks must not write patient records');return Response.json([{uic_ori:'TEST',ce_first_name:'Sample',cne_patient_code:'PRIVATE_CODE'}]);}
 });cache.set(filename,loaded.exports);return loaded.exports;
}
const auth=load('lib/auth.ts');
for(const organization of ['CUT','AILES','PILS_VOLUNTEER','UNKNOWN',undefined]){
 user={...user,organization};
 assert.equal(auth.hasRole(user,'ADMIN'),false);assert.equal(auth.hasRole(user,'HEALTHCARE_ASSISTANT'),false);
 assert.equal(auth.hasAnyRole(user,['FACILITY_STAFF','ADMIN']),false);
 assert.equal(auth.hasAnyRole(user,['OUTREACH_WORKER']),true);
 assert.equal(auth.defaultRouteForUser(user),'/outreach');
 await auth.requireAnyRole(['OUTREACH_WORKER','ADMIN']);
 await assert.rejects(auth.requireLogsAccess(),/REDIRECT:\/outreach/);
 for (const file of ['app/logs/page.tsx','app/logs/details/[id]/page.tsx']) {
  const before=logReads;
  await assert.rejects(load(file).default({params:Promise.resolve({id:'test'}),searchParams:Promise.resolve({from:'2026-10-22',to:'2026-10-23'})}),/REDIRECT:\/outreach/);
  assert.equal(logReads,before,'Denied log requests must not read activity data');
 }
 await assert.rejects(auth.requireAdmin(),/REDIRECT:\/outreach/);
 await assert.rejects(auth.requirePilsUser(),/REDIRECT:\/outreach/);
}
user={...user,organization:'CUT'};
function hrefs(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(hrefs);return [...(node.props?.href?[node.props.href]:[]),...hrefs(node.props?.children)];}
const header=load('components/AppHeader.tsx').default;
assert.deepEqual(hrefs(await header({current:'outreach'})),['/outreach','/notifications','/change-password']);
for(const file of ['healthcare-nav','prep','clinic-queue','new-appointment','admin/users','admin/users/[id]','lookup','hiv-care-support-upcoming','dashboard','client-enrollment','clinic','breakfast']){
 const page=load(`app/${file}/page.tsx`).default;
 await assert.rejects(page({params:Promise.resolve({id:'target'}),searchParams:Promise.resolve({})}),/REDIRECT:\/outreach/,file+' must block external users');
}
for(const [file,methods] of [
 ['clinic-queue/route',['GET','POST','DELETE']],['clinic-queue/[id]/route',['PATCH']],
 ['redcap/healthcare-nav/route',['GET','POST']],['redcap/prep/route',['GET','POST']],['redcap/appointments/route',['GET','POST']],
 ['redcap/lookup/route',['GET']],['redcap/dashboard/route',['GET']],['redcap/client-enrollment/route',['GET','POST']],
 ['redcap/clinic/route',['GET','POST']],['redcap/breakfast/route',['POST']],['redcap/breakfast/skeletons/route',['POST']],
]){
 const route=load('app/api/'+file+'.ts');
 for(const method of methods){
  const before=network.length;
  const response=await route[method](new Request('http://app.invalid/api?uic=TEST&date=2026-10-22',{method,...(method==='POST'||method==='PATCH'?{body:'{}'}:{})}),{params:Promise.resolve({id:'queue'})});
  assert.equal(response.status,403,file+' '+method);assert.equal(network.length,before,'Denied requests must not read REDCap');
 }
}
const patients=load('app/api/redcap/patients/route.ts');
const response=await patients.GET();assert.equal(response.status,200);
assert.equal((await response.json())[0].patient_code,'');
assert.ok(!Array.from(network.at(-1).values()).includes('cne_patient_code'),'External outreach client lists must not request clinical codes');
assert.equal((await load('app/api/redcap/outreach/route.ts').GET(new Request('http://app.invalid/api?uic=TEST'))).status,200);
await load('app/outreach/page.tsx').default();
await load('app/notifications/page.tsx').default();

await load('app/change-password/page.tsx').default();
user={...user,organization:'PILS'};
assert.equal(auth.hasRole(user,'ADMIN'),true);assert.equal(auth.defaultRouteForUser(user),'/outreach');await auth.requireAdmin();
assert.ok(hrefs(await header({current:'clinic'})).includes('/clinic'));
user={...user,role:'HEALTHCARE_NAVIGATOR',roles:'[]'};
assert.equal(auth.defaultRouteForUser(user),'/healthcare-nav');assert.equal(auth.hasAnyRole(user,['FACILITY_STAFF','ADMIN']),false);
const {pagesForRole}=load('lib/role-page-access.ts');
assert.deepEqual(Array.from(pagesForRole('ADMIN','CUT')),['Outreach Workflow','Notifications','Change Password']);
assert.ok(pagesForRole('ADMIN','PILS').includes('Clinic Queue'));
for (const role of ['OUTREACH_WORKER','HEALTHCARE_ASSISTANT','HEALTHCARE_NAVIGATOR','FACILITY_STAFF','ADMIN']) {
 user={...user,organization:'PILS',role,roles:'[]'};
 await auth.requireLogsAccess();
 assert.ok(hrefs(await header({current:'logs'})).includes('/logs'));
}
await load('app/logs/page.tsx').default({searchParams:Promise.resolve({})});
console.log('Organisation access checks passed: external organisations (including volunteer/admin/multi-role users), navigation, all restricted pages/APIs, PILS-only Logs list/details, allowed external Outreach/Notifications/password access, patient-list privacy and unchanged PILS roles. No network requests made.');
