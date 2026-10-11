"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export default function ExportIndexDownload() {
  const [loading,setLoading]=useState(false), [error,setError]=useState("");
  async function download() {
    setLoading(true);setError("");
    try {
      const response=await fetch("/api/export-index",{cache:"no-store"});
      if(!response.ok)throw new Error("Unable to download the index. Please try again.");
      const url=URL.createObjectURL(await response.blob());
      const link=document.createElement("a");link.href=url;link.download=response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "PILS-Index.xlsx";
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch { setError("Unable to download the index. Please try again."); }
    finally {setLoading(false);}
  }
  return <div className="mt-6"><Button size="lg" onClick={download} disabled={loading}>{loading ? "Downloading…" : "Download"}</Button>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}</div>;
}
