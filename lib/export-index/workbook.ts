// Elisa Kevin Veragoo + ChatGPT
import ExcelJS from "exceljs";
import layout from "./layout.json";
import { buildIndexRows, type IndexRow, type RecordRow } from "./model";
function summaries(rows: IndexRow[], prep: boolean, today: string): Record<number, number | Date> {
  const count = (col: number, value: string) => rows.filter(row => String(row[col-1]).toLowerCase() === value.toLowerCase()).length;
  const population = (value: string) => rows.filter(row => String(row[5]).split("; ").includes(value)).length;
  const numeric = (col: number, test: (value: number) => boolean) => rows.filter(row => typeof row[col-1] === "number" && test(row[col-1] as number)).length;
  const nation = prep ? 21 : 42, status = prep ? 22 : 43;
  const result: Record<number, number | Date> = {4: rows.length,5:count(nation,"Mauritian"),6:count(nation,"Foreigner"),7:rows.length-count(nation,"Mauritian")-count(nation,"Foreigner"),10:count(7,"M"),11:count(7,"F"),12:count(7,"T")};
  if (prep) {
    ["Active","On demand","Not interested","LTFU","Transfer to NDDCI","Abroad","HIV+","Dead","Deported"].forEach((value,i) => result[14+i]=count(status,value));
    result[24]=count(10,"YES"); result[25]=count(10,"NO");
    ["MSM","TG","GP","PWID","PPVIH","SW","PPID","Bisexual"].forEach((value,i) => result[28+i]=population(value));
    Object.assign(result,{38:count(16,"YES"),39:count(17,"YES"),40:count(17,"Pending"),41:count(18,"Completed"),42:rows.filter(row => row[18] !== "").length});
    ["Completed","Dose 1","Dose 2","Dose 3","Not started","Declined"].forEach((value,i) => result[45+i]=count(18,value));
    for(let i=0;i<5;i++)result[63+i]=rows.filter(row => row[7] instanceof Date && row[7].getUTCFullYear()===2022+i).length;
    result[69]=new Date(`${today}T00:00:00Z`);
  } else {
    ["Active","LTFU","Prison","Transfer to NDDCI","Dead"].forEach((value,i) => result[15+i]=count(status,value));
    Object.assign(result,{22:numeric(29,n=>n<100),23:numeric(29,n=>n>=100),26:numeric(31,n=>n<=40),27:numeric(31,n=>n>40)});
    ["GP","PWID","MSM","TG","SW"].forEach((value,i) => result[30+i]=population(value));
    result[44]=new Date(`${today}T00:00:00Z`);
    ["Bed Ridden","Reduce mobility","No"].forEach((value,i) => result[47+i]=count(18,value));
    [[0,17],[18,30],[31,45],[46,60],[61,Infinity]].forEach(([min,max],i)=>result[53+i]=numeric(16,n=>n>=min&&n<=max));
    result[58]=rows.filter(row=>row[15]==="").length;
  }
  return result;
}
export async function createIndexWorkbook(records: RecordRow[], today: string): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator="PILS"; workbook.created=new Date(`${today}T00:00:00Z`);
  const tables=buildIndexRows(records,today);
  for (const [index, template] of layout.entries()) {
    const sheet=workbook.addWorksheet(template.name);
    for(const {column,width} of template.widths)sheet.getColumn(column).width=width;
    for(const {column,label,style} of template.headers){const cell=sheet.getCell(1,column);cell.value=label;cell.style=structuredClone(style) as unknown as ExcelJS.Style;}
    sheet.getRow(1).height=template.headerHeight || 60;
    const rows=tables[index];
    rows.forEach((values,i)=>{
      for(let col=1;col<=template.columnCount;col++){
        const cell=sheet.getCell(i+2,col);cell.value=values[col-1];
        cell.style=structuredClone(template.body.find(item=>item.column===col)?.style ?? {}) as unknown as ExcelJS.Style;
        // The reference's second row is a particular patient's status colour, not a neutral template.
        cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFFFFFF"}};
        if(cell.value instanceof Date)cell.numFmt="dd.mm.yyyy";
        else if(typeof cell.value==="string")cell.numFmt="@";
        else cell.numFmt="General";
      }
    });
    const totals=summaries(rows,index===0,today);
    for(const item of template.summary){const cell=sheet.getCell(item.ref);cell.style=structuredClone(item.style) as unknown as ExcelJS.Style;cell.value=item.formula ? totals[Number(cell.row)] ?? 0 : item.value;if(cell.value instanceof Date)cell.numFmt="dd.mm.yyyy";}
    if(index===0)sheet.getCell("AA23").value="LTFU STATUS (Column J)";
    for(const merge of template.merges)sheet.mergeCells(merge);
    sheet.views=[{state:"frozen",ySplit:1}];
    sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,rows.length+1),column:template.columnCount}};
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
