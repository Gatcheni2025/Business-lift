import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'product_photo_bounds.dart';
export 'product_photo_bounds.dart' show cataloguePhotoKeys;
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
  return catalogueTemplatePhotos[id.substring(8)];
}

class CataloguePhoto extends StatelessWidget {
  final String photoKey;
  final double size;
  const CataloguePhoto({super.key,required this.photoKey,this.size=96});
  @override Widget build(BuildContext context){
    final bounds=cataloguePhotoBounds[photoKey],atlas=cataloguePhotoAtlases[photoKey];
    if(bounds==null||atlas==null)return SizedBox.square(dimension:size,child:const Icon(Icons.photo_outlined));
    final scale=size/bounds[2]<size/bounds[3]?size/bounds[2]:size/bounds[3];
    return Semantics(label:'Illustrative product photo',image:true,
      child:SizedBox.square(dimension:size,child:Center(child:ClipRect(
        child:SizedBox(width:bounds[2]*scale,height:bounds[3]*scale,
          child:OverflowBox(alignment:Alignment.topLeft,
            minWidth:1024*scale,maxWidth:1024*scale,minHeight:1536*scale,maxHeight:1536*scale,
            child:Transform.translate(offset:Offset(-bounds[0]*scale,-bounds[1]*scale),
              child:Image.asset('assets/catalogue/$atlas',width:1024*scale,height:1536*scale,
                fit:BoxFit.fill,excludeFromSemantics:true))))))));
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
  bool matches(String query,String group){
    if(group!='All'&&category!=group)return false;
    String normalize(String value)=>value.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'),' ')
      .replaceAllMapped(RegExp(r'(\d)\s*(ml|kg|g|l)\b'),(match)=>'${match[1]} ${match[2]}').trim();
    final text=normalize('$name $category $unit $keywords');
    return normalize(query).split(' ').where((word)=>word.isNotEmpty).every(text.contains);
  }
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
