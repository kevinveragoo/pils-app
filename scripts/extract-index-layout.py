"""Extract only layout/labels from the reference index; never retain patient cells."""
import json, re, sys
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as E
N={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
TAG='{'+N['s']+'}'
def colno(ref):
 n=0
 for c in re.match(r'[A-Z]+',ref)[0]:n=n*26+ord(c)-64
 return n
def color(e):
 if e is None:return None
 return {k:(int(v) if k in ['theme','indexed'] else float(v) if k=='tint' else v) for k,v in e.attrib.items() if k in ['rgb','theme','indexed','tint']} | ({'argb':e.get('rgb')} if e.get('rgb') else {})
with ZipFile(sys.argv[1]) as z:
 ss=[''.join(x.text or '' for x in si.iter(TAG+'t')) for si in E.fromstring(z.read('xl/sharedStrings.xml'))]
 st=E.fromstring(z.read('xl/styles.xml'));fonts=st.find('s:fonts',N);fills=st.find('s:fills',N);borders=st.find('s:borders',N);xfs=st.find('s:cellXfs',N)
 numfmts={int(x.get('numFmtId')):x.get('formatCode') for x in st.findall('s:numFmts/s:numFmt',N)}
 def style(index):
  xf=xfs[int(index or 0)];f=fonts[int(xf.get('fontId','0'))];font={}
  for xml,key,cast in [('name','name',str),('sz','size',float)]:
   e=f.find('s:'+xml,N)
   if e is not None:font[key]=cast(e.get('val'))
  for key in ['b','i','u']:
   if f.find('s:'+key,N) is not None:font[{'b':'bold','i':'italic','u':'underline'}[key]]=True
  if f.find('s:color',N) is not None:font['color']=color(f.find('s:color',N))
  result={'font':font};fill=fills[int(xf.get('fillId','0'))].find('s:patternFill',N)
  if fill is not None and fill.get('patternType') not in [None,'none']:result['fill']={'type':'pattern','pattern':fill.get('patternType'),'fgColor':color(fill.find('s:fgColor',N)) or {'argb':'FFFFFFFF'},'bgColor':color(fill.find('s:bgColor',N)) or {'argb':'FFFFFFFF'}}
  border={}
  for key in ['left','right','top','bottom']:
   e=borders[int(xf.get('borderId','0'))].find('s:'+key,N)
   if e is not None and e.get('style'):border[key]={'style':e.get('style'),'color':color(e.find('s:color',N)) or {'argb':'FF000000'}}
  if border:result['border']=border
  a=xf.find('s:alignment',N)
  if a is not None:result['alignment']={k:(v=='1' if k in ['wrapText','shrinkToFit'] else int(v) if k in ['textRotation','indent'] else v) for k,v in a.attrib.items()}
  fmt=int(xf.get('numFmtId','0'))
  if fmt in numfmts:result['numFmt']=numfmts[fmt]
  return result
 rels={r.get('Id'):r.get('Target') for r in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))};result=[]
 for sheet in E.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet',N):
  name=sheet.get('name')
  if name not in ['Prep Index','Index Arv copy']:continue
  count=22 if name=='Prep Index' else 43;summary=27 if count==22 else 46
  target=rels[sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')];target=target.lstrip('/') if target.startswith('/') else 'xl/'+target
  root=E.fromstring(z.read(target));headers=[];body=[];cells=[]
  for row in root.findall('s:sheetData/s:row',N):
   rn=int(row.get('r'))
   for c in row:
    ref=c.get('r');cn=colno(ref);v=c.find('s:v',N);f=c.find('s:f',N)
    val=ss[int(v.text)] if c.get('t')=='s' and v is not None else v.text if v is not None else ''
    if rn==1 and cn<=count:headers.append({'column':cn,'label':val,'style':style(c.get('s'))})
    elif rn==2 and cn<=count:body.append({'column':cn,'style':style(c.get('s'))})
    elif summary<=cn<=summary+1 and rn<=75 and (val or f is not None):
     cells.append({'ref':ref,'value':val if f is None else '', 'formula':f.text if f is not None else None,'style':style(c.get('s'))})
  widths=[]
  for c in root.findall('s:cols/s:col',N):
   for cn in range(int(c.get('min')),min(int(c.get('max')),summary+1)+1):widths.append({'column':cn,'width':float(c.get('width','9'))})
  result.append({'name':name,'columnCount':count,'headers':headers,'body':body,'summary':cells,'widths':widths,'merges':[e.get('ref') for e in root.findall('s:mergeCells/s:mergeCell',N)],'headerHeight':float(root.find('s:sheetData/s:row',N).get('ht','30'))})
 Path(sys.argv[2]).write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
