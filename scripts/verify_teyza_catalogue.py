from pathlib import Path
import json,struct,re
root=Path(__file__).resolve().parents[1]
backend=root/'services/teyza-mobile-v39'
app=root/'apps/teyza_shopper/assets/catalogue'
assert (backend/'catalogue.json').read_bytes()==(app/'product-catalogue.json').read_bytes()
catalogue=json.loads((backend/'catalogue.json').read_text())
assert len(catalogue['products'])==184 and len(catalogue['photos'])==48
assert len({p['id'] for p in catalogue['products']})==184
for product in catalogue['products']:
    assert product['photo'] in catalogue['photos']
    assert not any(key in product for key in ['priceCents','stockQty','ownerUid'])
native=(root/'apps/teyza_shopper/lib/product_photo_bounds.dart').read_text()
native_bounds={name:[int(x) for x in values.split(',')] for name,values in re.findall(r"'([^']+)': \[([0-9, ]+)\]",native)}
assert native_bounds=={key:frame['bounds'] for key,frame in catalogue['photos'].items()}
for frame in catalogue['photos'].values():
    left,top,width,height=frame['bounds']
    assert left>=0 and top>=0 and width>0 and height>0 and left+width<=1024 and top+height<=1536
for name in ['fresh-pantry.png','pantry-household.png']:
    image=(app/name).read_bytes()
    assert image==(backend/'catalogue-images'/name).read_bytes()
    assert image[:8]==b'\x89PNG\r\n\x1a\n'
    width,height=struct.unpack('>II',image[16:24])
    assert width%4==0 and height%6==0 and width//4==height//6
print('184 templates, 48 reference photos: shared schema, images and square atlas cells verified')
