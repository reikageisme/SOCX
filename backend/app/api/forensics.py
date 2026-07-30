from fastapi import APIRouter, Depends, UploadFile, File, BackgroundTasks, HTTPException
from app.api.endpoints import get_current_user
from typing import Dict, Any
import pyshark
import logging
import uuid
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor

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
        
        # We only read the first 1000 packets to prevent memory issues for the demo
        cap = pyshark.FileCapture(file_path, keep_packets=False)
        
        stats = {
            "total_packets": 0,
            "protocols": {},
            "top_ips": {},
            "connections": []
        }
        
        connections_set = set()
        
        for packet in cap:
            stats["total_packets"] += 1
            if stats["total_packets"] > 1000:
                break
                
            try:
                protocol = packet.highest_layer
                stats["protocols"][protocol] = stats["protocols"].get(protocol, 0) + 1
                
                if hasattr(packet, 'ip'):
                    src = packet.ip.src
                    dst = packet.ip.dst
                    stats["top_ips"][src] = stats["top_ips"].get(src, 0) + 1
                    stats["top_ips"][dst] = stats["top_ips"].get(dst, 0) + 1
                    
                    conn_key = f"{src}-{dst}-{protocol}"
                    if conn_key not in connections_set:
                        connections_set.add(conn_key)
                        stats["connections"].append({
                            "src": src,
                            "dst": dst,
                            "protocol": protocol,
                            "length": packet.length
                        })
            except AttributeError:
                continue
                
        cap.close()
        
        # Sort and limit top IPs and connections
        sorted_ips = sorted(stats["top_ips"].items(), key=lambda x: x[1], reverse=True)[:10]
        stats["top_ips"] = {k: v for k, v in sorted_ips}
        stats["connections"] = stats["connections"][:50]
        
        _pcap_results[job_id] = {
            "status": "completed",
            "stats": stats
        }
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
