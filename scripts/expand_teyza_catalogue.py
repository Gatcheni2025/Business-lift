"""Add everyday product templates without replacing existing catalogue IDs or stock."""
from pathlib import Path
import json,re

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'services/teyza-mobile-v39/catalogue.json'
FOOD=[
 ('chocolate',[11,16,238,226]),('stock-cubes',[271,20,231,220]),('fresh-milk',[564,3,157,244]),('energy-drink',[816,8,134,238]),
 ('viennas',[18,266,225,236]),('popcorn',[272,257,230,241]),('jam',[564,257,151,241]),('cheese',[776,273,241,226]),
 ('soup-powder',[10,504,240,238]),('peanuts',[276,501,238,251]),('fruit-juice',[536,500,229,252]),('chewing-gum',[775,537,241,211]),
 ('polony',[6,749,249,252]),('cakes',[267,762,242,200]),('margarine',[516,761,250,207]),('lollipops',[788,733,232,236]),
 ('sausages',[0,1004,256,230]),('aromat',[313,968,148,256]),('mayonnaise',[557,965,167,263]),('vinegar',[812,963,143,270]),
 ('salt',[2,1225,253,299]),('instant-noodles',[257,1223,252,279]),('tomato-paste',[533,1262,211,253]),('condensed-milk',[775,1207,249,309]),
]
CARE=[
 ('baby-lotion',[55,16,143,222]),('plastic-bags',[280,8,216,235]),('matches',[531,35,235,200]),('toothbrush',[775,0,249,253]),
 ('baby-formula',[30,259,224,230]),('sponges',[266,280,247,182]),('baby-wipes',[513,293,254,183]),('candles',[834,260,132,229]),
 ('petroleum-jelly',[31,511,203,196]),('disposable-cups',[302,493,169,224]),('pencils',[514,497,244,222]),('baby-soap',[770,518,250,199]),
 ('wet-wipes',[1,751,260,195]),('baby-powder',[304,713,158,258]),('erasers',[521,768,234,190]),('bleach',[816,704,177,267]),
 ('refuse-bags',[3,999,264,217]),('deodorant',[313,970,143,242]),('baby-shampoo',[563,966,151,246]),('cotton-wool',[777,976,233,236]),
 ('pantyliners',[11,1225,244,276]),('dishcloths',[261,1218,253,266]),('dog-food',[529,1206,222,304]),('cat-food',[774,1258,243,221]),
]

# Pack sizes are selectable templates. The seller supplies the actual price and number of packs.
# The two named-brand ranges use the manufacturer's published South African pack sizes.
FAMILIES=[
 ('chocolate','Milk chocolate','Snacks',['40 g','80 g','100 g','150 g','200 g'],'chocolate bar slab chocolate'),
 ('stock-cubes','Stock cubes','Pantry',['12 cubes','24 cubes','48 cubes'],'stock cube bouillon'),
 ('chicken-stock-cubes','Chicken stock cubes','Pantry',['12 cubes','24 cubes'],'stock-cubes','chicken stock cube bouillon'),
 ('beef-stock-cubes','Beef stock cubes','Pantry',['12 cubes','24 cubes'],'stock-cubes','beef stock cube bouillon'),
 ('fresh-milk','Fresh full cream milk','Dairy & Eggs',['500 ml','1 L','2 L'],'fresh milk fresh dairy'),
 ('fresh-milk-low-fat','Fresh low fat milk','Dairy & Eggs',['1 L','2 L'],'fresh-milk','fresh milk low fat milk'),
 ('energy-drink','Energy drink','Drinks',['250 ml','300 ml','440 ml','500 ml','6 x 500 ml'],'energy drink'),
 ('viennas','Viennas','Meat',['250 g','500 g','1 kg'],'vienna frankfurters hot dog sausage'),
 ('popcorn','Ready-popped popcorn','Snacks',['25 g','50 g','100 g'],'popcorn popped corn'),
 ('jam','Strawberry jam','Pantry',['225 g','450 g','900 g'],'jam fruit spread'),
 ('apricot-jam','Apricot jam','Pantry',['450 g','900 g'],'jam','jam apricot fruit spread'),
 ('cheese','Cheddar cheese','Dairy & Eggs',['100 g','250 g','500 g','1 kg'],'cheese cheddar'),
 ('sliced-cheese','Sliced cheese','Dairy & Eggs',['200 g','400 g'],'cheese','cheese slices sliced cheese'),
 ('soup-powder','Soup powder','Pantry',['50 g','100 g','200 g','500 g'],'soup powder packet soup'),
 ('peanuts','Roasted peanuts','Snacks',['50 g','100 g','250 g','500 g','1 kg'],'peanuts nuts roasted peanuts'),
 ('fruit-juice','Fruit juice','Drinks',['200 ml','250 ml','500 ml','1 L','2 L','6 x 200 ml'],'fruit juice juice box'),
 ('chewing-gum','Chewing gum','Snacks',['10 pieces','20 pieces','50 pieces'],'chewing gum bubble gum'),
 ('polony','Polony','Meat',['250 g','500 g','1 kg'],'polony bologna kota'),
 ('cakes','Cupcakes','Bakery',['Single','4 pack','6 pack','12 pack'],'cakes cupcakes small cakes'),
 ('cake-slice','Cake slice','Bakery',['Single','2 pack'],'cakes','cakes slice sponge cake'),
 ('margarine','Margarine','Dairy & Eggs',['250 g','500 g','1 kg'],'margarine spread'),
 ('lollipops','Lollipops','Snacks',['Single','10 pack','50 pack','100 pack'],'lollipop sucker sweets'),
 ('sausages','Fresh sausages','Meat',['250 g','500 g','1 kg','2 kg'],'sausage fresh sausage links'),
 ('aromat','Knorr Aromat Original seasoning','Pantry',['75 g','200 g'],'aromat seasoning all purpose seasoning'),
 ('mayonnaise','Mayonnaise','Pantry',['250 g','500 g','750 g'],'mayonnaise mayo'),
 ('vinegar','White vinegar','Pantry',['375 ml','750 ml','2 L'],'vinegar white vinegar'),
 ('salt','Table salt','Pantry',['500 g','1 kg','2 kg'],'salt table salt'),
 ('instant-noodles','Instant noodles','Pantry',['70 g','5 x 70 g','10 x 70 g'],'instant noodles 2 minute noodles two minute noodles'),
 ('tomato-paste','Tomato paste','Pantry',['50 g','115 g','200 g','400 g'],'tomato paste'),
 ('condensed-milk','Condensed milk','Pantry',['385 g','6 x 385 g'],'condensed milk sweetened condensed milk'),
 ('baby-lotion','Baby lotion','Baby Care',['100 ml','200 ml','500 ml'],'baby lotion moisturiser'),
 ('plastic-bags','Plastic carrier bags','Household',['Single','10 pack','50 pack','100 pack'],'plastic bag shopping bag carrier bag'),
 ('matches','Matches','Household',['1 box','10 boxes','100 boxes'],'matches matchbox match box'),
 ('toothbrush','Toothbrush','Personal Care',['Single','2 pack','4 pack'],'toothbrush toothbrushes'),
 ('baby-formula-stage-1','Baby formula powder — Stage 1','Baby Care',['400 g','900 g'],'baby-formula','baby powder milk baby milk powder infant formula stage 1'),
 ('baby-formula-stage-2','Baby formula powder — Stage 2','Baby Care',['400 g','900 g'],'baby-formula','baby powder milk baby milk powder infant formula stage 2'),
 ('baby-formula-stage-3','Baby formula powder — Stage 3','Baby Care',['400 g','900 g'],'baby-formula','baby powder milk baby milk powder toddler formula stage 3'),
 ('sponges','Dishwashing sponges','Household',['2 pack','3 pack','5 pack','10 pack'],'dishwashing sponges sponge scourer scouring pads'),
 ('baby-wipes','Baby wipes','Baby Care',['20 wipes','40 wipes','80 wipes','4 x 80 wipes'],'baby wipes wet baby wipes'),
 ('candles','Household candles','Household',['Single','6 pack','12 pack'],'candles candle'),
 ('vaseline','Vaseline Blue Seal Original petroleum jelly','Personal Care',['50 ml','100 ml','250 ml','450 ml'],'petroleum-jelly','vaseline petroleum jelly blue seal'),
 ('disposable-cups','Disposable cups','Household',['10 pack','25 pack','50 pack','100 pack'],'disposable cups paper cups'),
 ('pencils','HB pencils','Stationery',['Single','2 pack','12 pack'],'pencils pencil graphite hb'),
 ('baby-soap','Baby soap','Baby Care',['75 g','100 g','175 g'],'baby soap baby bath soap'),
 ('wet-wipes','Wet wipes','Personal Care',['10 wipes','20 wipes','40 wipes','80 wipes'],'wet wipes hand wipes cleansing wipes'),
 ('baby-powder','Baby powder','Baby Care',['100 g','200 g','400 g'],'baby powder'),
 ('erasers','Eraser','Stationery',['Single','2 pack','6 pack'],'eraser erasers rubber school rubber'),
 ('bleach','Household bleach','Household',['500 ml','750 ml','1 L','2 L'],'bleach cleaning'),
 ('refuse-bags','Refuse bags','Household',['10 pack','20 pack','50 pack'],'refuse bags bin bags rubbish bags garbage bags'),
 ('deodorant','Roll-on deodorant','Personal Care',['50 ml','75 ml','2 x 50 ml'],'deodorant roll on roll-on'),
 ('baby-shampoo','Baby shampoo','Baby Care',['100 ml','200 ml','500 ml'],'baby shampoo'),
 ('cotton-wool','Cotton wool','Personal Care',['50 g','100 g','200 g'],'cotton wool cotton balls'),
 ('pantyliners','Pantyliners','Personal Care',['20 pack','40 pack','60 pack'],'pantyliners panty liners sanitary liners'),
 ('dishcloths','Dishcloths','Household',['Single','3 pack','5 pack'],'dishcloth dishcloths kitchen cloth cleaning cloth'),
 ('dog-food','Dry dog food','Pet Care',['500 g','1 kg','2 kg','5 kg'],'dog food pet food kibble'),
 ('cat-food','Wet cat food','Pet Care',['85 g','100 g','400 g','6 x 400 g'],'cat food pet food'),
 ('nappies','Disposable nappies','Baby Care',['Size 1 - 20 pack','Size 6 - 20 pack','Size 2 - 40 pack','Size 3 - 40 pack','Size 4 - 40 pack','Size 5 - 40 pack','Size 6 - 40 pack'],'baby nappies diapers baby diapers'),
 ('strawberry-yogurt','Strawberry yogurt','Dairy & Eggs',['175 g','500 g','1 kg'],'yogurt','yogurt yoghurt flavoured yogurt strawberry yoghurt'),
 ('muffins','Muffins','Bakery',['Single','4 pack','6 pack'],'cakes','cakes muffins bakery'),
]

def slug(value):
 return re.sub(r'[^a-z0-9]+','-',value.lower()).strip('-')

def main():
 data=json.loads(SOURCE.read_text())
 existing={p['id']:p for p in data['products']}
 data['version']=2
 for atlas,entries in [('food-drinks-expanded.png',FOOD),('care-household-expanded.png',CARE)]:
  for index,(key,bounds) in enumerate(entries):
   data['photos'][key]={'atlas':atlas,'column':index%4,'row':index//4,'bounds':bounds}
 for row in FAMILIES:
  prefix,name,category,units=row[:4]
  photo,keywords=(prefix,row[4]) if len(row)==5 else row[4:]
  for unit in units:
   product={'id':prefix+'-'+slug(unit),'name':name+' · '+unit,'category':category,'unit':unit,'photo':photo,'keywords':keywords}
   old=existing.get(product['id'])
   if old:
    for field in ['name','category','unit','photo']:
     assert old[field]==product[field],f'Never rename an existing seller template: {product["id"]}'
    old['keywords']=(old.get('keywords','')+' '+keywords).strip()
   else:
    data['products'].append(product);existing[product['id']]=product
 for product in data['products']:
  extras={'milk':'milk dairy','yogurt':'yoghurt yogurt','nappies':'baby nappies diapers baby diapers',
    'sweets':'sweets candy sweeties','boerewors':'sausage sausages boerewors'}.get(product['photo'],'')
  if extras and extras not in product.get('keywords',''):product['keywords']=(product.get('keywords','')+' '+extras).strip()
  product['keywords']=' '.join(dict.fromkeys(product.get('keywords','').split()))
 content=json.dumps(data,ensure_ascii=False,indent=2)+'\n'
 SOURCE.write_text(content)
 (ROOT/'apps/teyza_shopper/assets/catalogue/product-catalogue.json').write_text(content)
 # The exact lookup avoids collisions between family names and photos reused by a different template.
 lines=['// Generated by scripts/expand_teyza_catalogue.py. Keep aligned with product-catalogue.json.',
  'const cataloguePhotoKeys=<String>[',*[f"  '{key}'," for key in data['photos']],'];',
  'const cataloguePhotoBounds=<String,List<int>>{',*[f"  '{k}': {v['bounds']}," for k,v in data['photos'].items()],'};',
  'const cataloguePhotoAtlases=<String,String>{',*[f"  '{k}': '{v['atlas']}'," for k,v in data['photos'].items()],'};',
  'const catalogueTemplatePhotos=<String,String>{',*[f"  '{p['id']}': '{p['photo']}'," for p in data['products']],'};']
 (ROOT/'apps/teyza_shopper/lib/product_photo_bounds.dart').write_text('\n'.join(lines)+'\n')
 print(f'{len(data["products"])} templates, {len(data["photos"])} photos, {len({p["category"] for p in data["products"]})} categories')

if __name__=='__main__':main()
