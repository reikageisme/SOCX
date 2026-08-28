from fastapi import APIRouter, Depends, UploadFile, File, BackgroundTasks, HTTPException
from app.api.endpoints import get_current_user
from app.services.discord import discord_service
from typing import Dict, Any
import logging
import uuid
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor
from scapy.all import rdpcap, IP, DNS, TCP, UDP

router = APIRouter()
logger = logging.getLogger("forensics")

_pcap_results: Dict[str, Any] = {}
executor = ThreadPoolExecutor(max_workers=2)

UPLOAD_DIR = "/app/data/pcaps"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def analyze_pcap(job_id: str, file_path: str):
    try:
        logger.info(f"Starting PCAP analysis for {job_id} at {file_path}")
        _pcap_results[job_id] = {"status": "analyzing"}
        
        packets = rdpcap(file_path)
        
        stats = {
            "total_packets": len(packets),
            "iocs": {
                "ips": set(),
                "dns_queries": set(),
                "http_payloads": set()
            }
        }
        
        for pkt in packets:
            if IP in pkt:
                stats["iocs"]["ips"].add(pkt[IP].src)
                stats["iocs"]["ips"].add(pkt[IP].dst)
            
            if DNS in pkt and pkt[DNS].qr == 0:
                if pkt[DNS].qd:
                    try:
                        qname = pkt[DNS].qd.qname.decode('utf-8')
                        stats["iocs"]["dns_queries"].add(qname)
                    except:
                        pass
                    
            if TCP in pkt and (pkt[TCP].dport == 80 or pkt[TCP].sport == 80 or pkt[TCP].dport == 8080):
                payload = bytes(pkt[TCP].payload)
                if b'HTTP' in payload or b'GET ' in payload or b'POST ' in payload:
                    try:
                        first_line = payload.split(b'\r\n')[0].decode('utf-8', errors='ignore')
                        if first_line.strip():
                            stats["iocs"]["http_payloads"].add(first_line)
                    except:
                        pass
                        
        # Limit to top results for JSON
        stats["iocs"]["ips"] = list(stats["iocs"]["ips"])[:50]
        stats["iocs"]["dns_queries"] = list(stats["iocs"]["dns_queries"])[:50]
        stats["iocs"]["http_payloads"] = list(stats["iocs"]["http_payloads"])[:50]
        
        _pcap_results[job_id] = {
            "status": "completed",
            "stats": stats
        }
        
        # Send Discord Alert
        discord_service.send_alert(
            category="forensics-analysis",
            content=f"🕵️ **PCAP Analysis Completed: {job_id}**",
            embeds=[{
                "title": "Forensics PCAP IOCs",
                "description": f"Phân tích PCAP `{job_id}`.\nPhát hiện **{len(stats['iocs']['ips'])}** IPs và **{len(stats['iocs']['dns_queries'])}** DNS Queries.",
                "color": 15105570
            }]
        )
        
        logger.info(f"Completed PCAP analysis {job_id}")
        
        # Clean up the file
        try:
            os.remove(file_path)
        except:
            pass
            
    except Exception as e:
        logger.error(f"Error analyzing pcap {job_id}: {str(e)}")
        _pcap_results[job_id] = {"status": "failed", "error": str(e)}

@router.post("/pcap/upload")
async def upload_pcap(file: UploadFile = File(...), current_user: str = Depends(get_current_user)):
    if not file.filename.endswith(('.pcap', '.pcapng')):
        raise HTTPException(status_code=400, detail="Only .pcap and .pcapng files are allowed")
        
    job_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{job_id}_{file.filename}")
    
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
        
    _pcap_results[job_id] = {"status": "queued"}
    
    loop = asyncio.get_running_loop()
    loop.run_in_executor(executor, analyze_pcap, job_id, file_path)
    
    return {"status": "success", "job_id": job_id, "message": "File uploaded and analysis started"}

@router.get("/pcap/{job_id}")
def get_pcap_result(job_id: str, current_user: str = Depends(get_current_user)):
    if job_id not in _pcap_results:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    return _pcap_results[job_id]

from pydantic import BaseModel

class AIAnalyzeRequest(BaseModel):
    urls: list[str]

@router.post("/analyze-urls")
async def analyze_urls(req: AIAnalyzeRequest, current_user: str = Depends(get_current_user)):
    try:
        from app.services.ai.provider import AIProviderFactory
        from app.config import settings
        provider_type = getattr(settings, "AI_PROVIDER", "ollama")
        if provider_type == "ollama":
            url = getattr(settings, "OLLAMA_URL", "http://localhost:11434")
            provider = AIProviderFactory.get_provider("ollama", url=url)
        else:
            api_key = getattr(settings, "GEMINI_API_KEY", "")
            provider = AIProviderFactory.get_provider("gemini", api_key=api_key)
            
        prompt = f"Analyze these URLs/DNS queries for potential phishing or malicious intent. Provide a short risk score out of 10 and a brief 1-sentence reason for each:\n" + "\n".join(req.urls[:10])
        summary = await provider.generate_summary(prompt)
        return {"status": "success", "analysis": summary}
    except Exception as e:
        logger.error(f"Error in AI URL analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
