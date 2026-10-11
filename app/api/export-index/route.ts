import { getCurrentUser, hasAnyRole } from "@/lib/auth";
import { exportForms, type RecordRow } from "@/lib/export-index/model";
import { createIndexWorkbook } from "@/lib/export-index/workbook";
export const runtime = "nodejs";
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401, headers });
  if (!hasAnyRole(user, ["HEALTHCARE_ASSISTANT", "ADMIN"])) return Response.json({ error: "Healthcare Assistant access is required." }, { status: 403, headers });
  try {
    const url = process.env.REDCAP_API_URL, token = process.env.REDCAP_API_TOKEN;
    if (!url || !token) throw new Error("Missing REDCap configuration");
    const body = new URLSearchParams({token,content:"record",action:"export",format:"json",type:"flat",rawOrLabel:"raw",rawOrLabelHeaders:"raw",exportCheckboxLabel:"false",returnFormat:"json"});
    exportForms.forEach((form,index)=>body.set(`forms[${index}]`,form));
    const response = await fetch(url,{method:"POST",body,cache:"no-store",signal:AbortSignal.timeout(120000)});
    const data: unknown = await response.json();
    if(!response.ok || !Array.isArray(data) || !data.every(row=>row && typeof row==="object" && Object.values(row).every(value=>typeof value==="string"||typeof value==="number")))throw new Error("Invalid REDCap export");
    const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Indian/Mauritius",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const workbook=await createIndexWorkbook(data.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,String(value)]))) as RecordRow[],today);
    return new Response(Buffer.from(workbook),{headers:{...headers,"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="PILS-Index-${today}.xlsx"`}});
  } catch {
    return Response.json({error:"Unable to download the index. Please try again."},{status:502,headers});
  }
}
