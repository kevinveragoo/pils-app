//
//  localization-coverage.mjs
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 21/10/2026.
//
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root=path.resolve(import.meta.dirname,'..');
export function localizationSources() {
  const entries=new Map();
  function add(value,source) {
    const text=value.replace(/&apos;/g,"'").replace(/&amp;/g,'&').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
    if(!text||!/[a-zA-Z]{2}/.test(text)||['integer','number'].includes(text))return;
    if(!entries.has(text))entries.set(text,new Set());
    entries.get(text).add(source);
  }
  function read(file) {
    const relative=path.relative(root,file);
    const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    function visit(node) {
      if(ts.isJsxText(node))add(node.text,relative);
      if(ts.isJsxAttribute(node)&&['label','title','placeholder','aria-label','description'].includes(node.name.text)&&node.initializer&&ts.isStringLiteral(node.initializer))add(node.initializer.text,relative);
      if(ts.isArrayLiteralExpression(node)&&node.elements.length===2&&node.elements.every(ts.isStringLiteral)&&/^(?:\d+|[a-z][a-z0-9_/-]*)$/.test(node.elements[0].text))add(node.elements[1].text,relative);
      if(ts.isPropertyAssignment(node)&&['label','title','description'].includes(node.name.getText(ast).replace(/['"]/g,''))&&ts.isStringLiteral(node.initializer))add(node.initializer.text,relative);
      if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&['setError','setMessage'].includes(node.expression.text)&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))add(node.arguments[0].text,relative);
      // Literal text returned by conditional JSX expressions (button states, badges).
      if(ts.isStringLiteral(node)&&ts.isConditionalExpression(node.parent)&&(node===node.parent.whenTrue||node===node.parent.whenFalse)) {
        let ancestor=node.parent;
        while(ancestor&&!ts.isJsxExpression(ancestor)&&!ts.isJsxAttribute(ancestor)&&!ts.isStatement(ancestor))ancestor=ancestor.parent;
        if(ancestor&&ts.isJsxExpression(ancestor)&&!ts.isJsxAttribute(ancestor.parent))add(node.text,relative);
      }
      ts.forEachChild(node,visit);
    }
    visit(ast);
    if(relative==='lib/role-page-access.ts'||relative==='lib/redcap-options.ts') {
      function labels(node){if(ts.isStringLiteral(node)&&ts.isArrayLiteralExpression(node.parent)&&!/^\d+$/.test(node.text))add(node.text,relative);ts.forEachChild(node,labels);}labels(ast);
    }
  }
  function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else if(file.endsWith('.tsx'))read(file);}}
  scan(path.join(root,'components'));scan(path.join(root,'app'));
  for(const file of ['lib/role-page-access.ts','lib/redcap-options.ts','lib/visit-workflow.ts','lib/treatment-status.ts','lib/clinic-enrollment.ts','lib/clinic-appointments.ts'])read(path.join(root,file));
  const forms=JSON.parse(fs.readFileSync(path.join(root,'lib/instrument-forms.json'),'utf8'));
  for(const [form,fields] of Object.entries(forms))for(const field of fields){
    if(/@HIDDEN/.test(field.annotation))continue;
    if(field.kind==='descriptive'){if(/^cnv_section_/.test(field.name))add(field.label.replace(/<[^>]*>/g,''),form);continue;}
    add(field.label.replace(/<[^>]*>/g,''),form);
    if(field.section)add(field.section,form);
    if(field.note)add(field.note,form);
    for(const [,label] of field.options)add(label,form);
  }
  return entries;
}
