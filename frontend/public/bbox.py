import xml.etree.ElementTree as ET
from svg.path import parse_path
import sys

def get_bbox(svg_file):
    tree = ET.parse(svg_file)
    root = tree.getroot()
    
    paths = root.findall('.//{http://www.w3.org/2000/svg}path')
    if not paths:
        paths = root.findall('.//path')
    
    min_x = float('inf')
    min_y = float('inf')
    max_x = float('-inf')
    max_y = float('-inf')
    
    for path in paths:
        d = path.get('d')
        if not d: continue
        parsed = parse_path(d)
        for subpath in parsed:
            for i in range(11):
                pos = subpath.point(i / 10.0)
                min_x = min(min_x, pos.real)
                max_x = max(max_x, pos.real)
                min_y = min(min_y, pos.imag)
                max_y = max(max_y, pos.imag)
                
    return min_x, min_y, max_x, max_y

for f in ['favicon.svg', 'ACS-logo.svg']:
    try:
        bbox = get_bbox(f)
        print(f"{f}: {bbox}")
    except Exception as e:
        print(f"Error on {f}: {e}")
