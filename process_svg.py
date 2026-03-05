import xml.etree.ElementTree as ET

tree = ET.parse('g:/Proyingel/Repos/RSR/public/img/circuits/shanghai_wiki.svg')
root = tree.getroot()
ns = {'svg': 'http://www.w3.org/2000/svg'}

paths_data = []
for path in root.findall('.//svg:path', ns):
    d = path.get('d')
    if d and len(d) > 200: # Only track paths
        paths_data.append(d)

svg_out = f"""<svg width="500" height="500" viewBox="-1100 -200 1600 1600" xmlns="http://www.w3.org/2000/svg">\n"""
for d in paths_data:
    svg_out += f'    <path stroke="#ffffff" fill="none" stroke-width="20" stroke-linejoin="round" d="{d}" />\n'
    svg_out += f'    <path stroke="#000000" fill="none" stroke-width="5" stroke-linejoin="round" d="{d}" />\n'

svg_out += """</svg>"""

with open('g:/Proyingel/Repos/RSR/public/img/circuits/shanghai.svg', 'w') as f:
    f.write(svg_out)
print("Saved clean shanghai.svg")
