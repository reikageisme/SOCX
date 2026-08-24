import os
import sys
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
sys.path.append(os.getcwd())
from proxmoxer import ProxmoxAPI
from dotenv import load_dotenv

load_dotenv()

try:
    proxmox = ProxmoxAPI(
        os.getenv('PROXMOX_HOST'),
        user=os.getenv('PROXMOX_USER'),
        token_name=os.getenv('PROXMOX_TOKEN_ID'),
        token_value=os.getenv('PROXMOX_TOKEN_SECRET'),
        verify_ssl=False
    )
    nodes = proxmox.nodes.get()
    print('Nodes:', [n['node'] for n in nodes])
    
    for n in nodes:
        node_name = n['node']
        try:
            vms = proxmox.nodes(node_name).qemu.get()
            print(f'VMs in {node_name}:', [v['name'] for v in vms])
        except Exception as e:
            print(f'Error fetching VMs in {node_name}:', e)
        try:
            lxcs = proxmox.nodes(node_name).lxc.get()
            print(f'LXCs in {node_name}:', [l['name'] for l in lxcs])
        except Exception as e:
            print(f'Error fetching LXCs in {node_name}:', e)

except Exception as e:
    print('Connection error:', e)
