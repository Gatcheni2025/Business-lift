from pathlib import Path
import json,struct,re
root=Path(__file__).resolve().parents[1]
backend=root/'services/teyza-mobile-v39'
app=root/'apps/teyza_shopper/assets/catalogue'
assert (backend/'catalogue.json').read_bytes()==(app/'product-catalogue.json').read_bytes()
catalogue=json.loads((backend/'catalogue.json').read_text())
products,photos=catalogue['products'],catalogue['photos']
assert catalogue['version']==2 and len(products)==378 and len(photos)==96
assert len({p['id'] for p in products})==len(products)
assert len({p['name'] for p in products})==len(products)
for product in products:
    assert product['photo'] in photos
    assert product['unit'] and product['category'] and re.fullmatch(r'[a-z0-9-]+',product['id'])
    assert not any(key in product for key in ['priceCents','stockQty','ownerUid'])
native=(root/'apps/teyza_shopper/lib/product_photo_bounds.dart').read_text()
native_bounds={name:[int(x) for x in values.split(',')] for name,values in re.findall(r"'([^']+)': \[([0-9, ]+)\]",native)}
assert native_bounds=={key:frame['bounds'] for key,frame in photos.items()}
def native_map(name):
    section=native.split('const '+name+'=')[1].split('};')[0]
    return dict(re.findall(r"'([^']+)': '([^']+)'",section))
assert native_map('cataloguePhotoAtlases')=={key:frame['atlas'] for key,frame in photos.items()}
assert native_map('catalogueTemplatePhotos')=={p['id']:p['photo'] for p in products}
for name in {frame['atlas'] for frame in photos.values()}:
    assert re.fullmatch(r'[a-z-]+\.png',name)
    image=(app/name).read_bytes()
    assert image==(backend/'catalogue-images'/name).read_bytes()
    assert image[:8]==b'\x89PNG\r\n\x1a\n'
    width,height=struct.unpack('>II',image[16:24])
    assert (width,height)==(1024,1536)
    for frame in photos.values():
        if frame['atlas']!=name:continue
        left,top,w,h=frame['bounds']
        assert left>=0 and top>=0 and w>0 and h>0 and left+w<=width and top+h<=height
print(f"{len(products)} templates, {len(photos)} reference photos: shared data, exact template lookup and all four image atlases verified")
