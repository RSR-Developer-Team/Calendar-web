import urllib.request
import json

url = "https://en.wikipedia.org/w/api.php?action=query&titles=File:Shanghai_International_Racing_Circuit_track_map.svg&prop=imageinfo&iiprop=url&format=json"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        pages = data['query']['pages']
        page = list(pages.values())[0]
        image_url = page['imageinfo'][0]['url']
        
        svg_req = urllib.request.Request(image_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(svg_req) as svg_resp:
            svg_content = svg_resp.read()
            with open('g:/Proyingel/Repos/RSR/public/img/circuits/shanghai_wiki.svg', 'wb') as f:
                f.write(svg_content)
            print("Successfully downloaded shanghai_wiki.svg from", image_url)
except Exception as e:
    print(f"Error: {e}")
