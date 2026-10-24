import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

const cataloguePhotoKeys=<String>[
  'tomatoes','potatoes','onions','bananas','apples','oranges','cabbage','carrots',
  'spinach','eggs','milk','yogurt','white-bread','brown-bread','rolls','chicken',
  'beef','boerewors','rice','maize','flour','sugar','oats','pasta',
  'beans','peanut-butter','oil','tea','coffee','water','soft-drink','crisps',
  'soap','washing-powder','dishwashing','toilet-paper','biscuits','sweets','pilchards','tomato-sauce',
  'lotion','toothpaste','shampoo','nappies','pads','batteries','notebook','pens'
];
String? cataloguePhotoKey(String image){
  final uri=Uri.tryParse(image);
  final key=uri?.host=='us-central1-business-lift-3c19c.cloudfunctions.net'&&uri?.path=='/teyzaMobile'?
    uri?.queryParameters['cataloguePhoto']:image.startsWith('catalogue:')?image.substring(10):null;
  return cataloguePhotoKeys.contains(key)?key:null;
}
String catalogueImageUrl(String key)=>
  'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile?cataloguePhoto=$key&v=1';
String? cataloguePhotoForDraft(String id){
  if(!id.startsWith('catalog_'))return null;
  final value=id.substring(8);
  for(final key in cataloguePhotoKeys){if(value.startsWith('$key-'))return key;}return null;
}

class CataloguePhoto extends StatelessWidget {
  final String photoKey;
  final double size;
  const CataloguePhoto({super.key,required this.photoKey,this.size=96});
  @override Widget build(BuildContext context){
    final index=cataloguePhotoKeys.indexOf(photoKey);
    if(index<0)return SizedBox.square(dimension:size,child:const Icon(Icons.photo_outlined));
    final local=index%24,column=local%4,row=local~/4;
    final atlas=index<24?'fresh-pantry.png':'pantry-household.png';
    return Semantics(label:'Illustrative product photo',image:true,child:ClipRect(
      child:SizedBox.square(dimension:size,child:OverflowBox(alignment:Alignment.topLeft,
        minWidth:size*4,maxWidth:size*4,minHeight:size*6,maxHeight:size*6,
        child:Transform.translate(offset:Offset(-column*size,-row*size),
          child:Image.asset('assets/catalogue/$atlas',width:size*4,height:size*6,
            fit:BoxFit.fill,excludeFromSemantics:true))))));
  }
}
class CatalogueProduct {
  final String id,name,category,unit,photo,keywords;
  const CatalogueProduct({required this.id,required this.name,required this.category,
    required this.unit,required this.photo,this.keywords=''});
  String get draftId=>'catalog_$id';
  factory CatalogueProduct.fromJson(Map<String,dynamic> data)=>CatalogueProduct(
    id:data['id'] as String,name:data['name'] as String,category:data['category'] as String,
    unit:data['unit'] as String,photo:data['photo'] as String,keywords:data['keywords'] as String? ??'');
  bool matches(String query,String group)=>
    (group=='All'||category==group)&&('$name $category $keywords').toLowerCase().contains(query.toLowerCase().trim());
}
class ProductCatalogue {
  static List<CatalogueProduct>? _cache;
  static Future<List<CatalogueProduct>> load() async {
    if(_cache!=null)return _cache!;
    final text=await rootBundle.loadString('assets/catalogue/product-catalogue.json');
    final data=jsonDecode(text) as Map<String,dynamic>;
    return _cache=List<CatalogueProduct>.unmodifiable((data['products'] as List)
      .map((row)=>CatalogueProduct.fromJson(Map<String,dynamic>.from(row as Map))));
  }
  static CatalogueProduct? findDraft(List<CatalogueProduct> products,String id){
    for(final product in products){if(product.draftId==id)return product;}return null;
  }
}
