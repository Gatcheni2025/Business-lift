import 'package:flutter/material.dart';
import 'product_catalogue.dart';
import 'shopper_auth.dart';
import 'teyza_mobile_api.dart';

class _ProductEntry {
  final CatalogueProduct product;
  final price=TextEditingController(),stock=TextEditingController();
  _ProductEntry(this.product);
  void dispose(){price.dispose();stock.dispose();}
}
class SellerProductPickerPage extends StatefulWidget {
  final ShopperSession session;
  final Set<String> existingIds;
  final TeyzaMobileApi? api;
  const SellerProductPickerPage({super.key,required this.session,required this.existingIds,this.api});
  @override State<SellerProductPickerPage> createState()=>_SellerProductPickerState();
}
class _SellerProductPickerState extends State<SellerProductPickerPage> {
  final selected=<String,_ProductEntry>{};
  late final uid=widget.session.userId;
  late final future=ProductCatalogue.load();
  String query='',category='All';
  String? error;
  bool reviewing=false,saving=false,accountChanged=false;
  @override void initState(){super.initState();widget.session.addListener(accountListener);}
  void accountListener(){if(widget.session.userId!=uid&&mounted)setState(()=>accountChanged=true);}
  @override void dispose(){widget.session.removeListener(accountListener);
    for(final entry in selected.values){entry.dispose();}super.dispose();}
  void toggle(CatalogueProduct product){
    if(widget.existingIds.contains(product.draftId))return;
    if(!selected.containsKey(product.id)&&selected.length>=30){
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Add up to 30 products at a time.')));return;
    }
    setState((){
      final old=selected.remove(product.id);if(old!=null){old.dispose();}else{selected[product.id]=_ProductEntry(product);}
    });
  }
  Future<void> save() async {
    if(saving||accountChanged||selected.isEmpty)return;
    final rows=<Map<String,dynamic>>[];
    for(final entry in selected.values){
      final amount=double.tryParse(entry.price.text.trim().replaceAll(',','.'));
      final quantity=int.tryParse(entry.stock.text.trim());
      if(amount==null||!amount.isFinite||amount<=0||amount>999999||quantity==null||quantity<0||quantity>100000){
        setState(()=>error='Enter a valid price and stock quantity for ${entry.product.name}.');return;
      }
      rows.add({'templateId':entry.product.id,'priceCents':(amount*100).round(),'stockQty':quantity});
    }
    setState((){saving=true;error=null;});
    try{
      final result=await (widget.api??TeyzaMobileApi(widget.session)).call('catalogue_add',{'products':rows});
      if(mounted&&widget.session.userId==uid)Navigator.pop(context,result);
    }catch(e){if(mounted)setState(()=>error=mobileError(e));}
    finally{if(mounted)setState(()=>saving=false);}
  }
  Widget productCard(CatalogueProduct product,bool compact){
    final added=widget.existingIds.contains(product.draftId),checked=selected.containsKey(product.id);
    final tick=Checkbox(value:added||checked,onChanged:added?null:(_)=>toggle(product));
    if(compact)return Card(color:Colors.white,elevation:0,child:ListTile(
      contentPadding:const EdgeInsets.all(12),leading:CataloguePhoto(photoKey:product.photo,size:54),
      title:Text(product.name),subtitle:Text(added?'Already in your shop':product.category),
      trailing:tick,onTap:added?null:()=>toggle(product)));
    return Material(color:Colors.white,borderRadius:BorderRadius.circular(20),child:InkWell(
      borderRadius:BorderRadius.circular(20),onTap:added?null:()=>toggle(product),
      child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Expanded(child:Center(child:CataloguePhoto(photoKey:product.photo,size:106))),
        const SizedBox(height:6),Text(product.name,maxLines:2,overflow:TextOverflow.ellipsis,
          style:const TextStyle(fontWeight:FontWeight.w800,fontSize:14)),
        Row(children:[Expanded(child:Text(added?'Added':product.category,maxLines:1,overflow:TextOverflow.ellipsis,
          style:const TextStyle(fontSize:11,color:Color(0xFF6C7880)))),tick])
      ]))));
  }
  Widget reviewEntry(_ProductEntry entry)=>Card(color:Colors.white,elevation:0,child:Padding(
    padding:const EdgeInsets.all(14),child:Column(children:[
      Row(children:[CataloguePhoto(photoKey:entry.product.photo,size:58),const SizedBox(width:10),
        Expanded(child:Text(entry.product.name,style:const TextStyle(fontWeight:FontWeight.w800))),
        IconButton(tooltip:'Remove ${entry.product.name}',onPressed:saving?null:()=>setState((){
          selected.remove(entry.product.id);entry.dispose();if(selected.isEmpty)reviewing=false;
        }),icon:const Icon(Icons.close))]),
      const SizedBox(height:12),Row(children:[
        Expanded(child:TextField(controller:entry.price,enabled:!saving,
          keyboardType:const TextInputType.numberWithOptions(decimal:true),
          decoration:const InputDecoration(labelText:'Your price (R)',border:OutlineInputBorder()))),
        const SizedBox(width:12),Expanded(child:TextField(controller:entry.stock,enabled:!saving,
          keyboardType:TextInputType.number,decoration:const InputDecoration(labelText:'Stock quantity',border:OutlineInputBorder())))
      ]),const SizedBox(height:5),const Align(alignment:Alignment.centerLeft,child:Text('Stock 0 shows this item as out of stock.',
        style:TextStyle(fontSize:11,color:Color(0xFF6C7880))))
    ])));
  @override Widget build(BuildContext context)=>Scaffold(backgroundColor:const Color(0xFFF7F9F7),
    appBar:AppBar(title:Text(reviewing?'Set your prices & stock':'Choose products'),
      leading:reviewing?BackButton(onPressed:saving?null:()=>setState(()=>reviewing=false)):null),
    bottomNavigationBar:accountChanged?null:SafeArea(top:false,child:Padding(padding:const EdgeInsets.fromLTRB(16,8,16,12),
      child:FilledButton.icon(onPressed:saving||selected.isEmpty?null:reviewing?save:()=>setState(()=>reviewing=true),
        icon:saving?const SizedBox.square(dimension:18,child:CircularProgressIndicator(strokeWidth:2,color:Colors.white)):
          Icon(reviewing?Icons.check:Icons.arrow_forward),
        label:Text(saving?'Saving…':reviewing?'Add ${selected.length} to my shop':'Review ${selected.length} selected')))),
    body:accountChanged?const Center(child:Padding(padding:EdgeInsets.all(24),child:Text('Your account changed. Close this page and sign in again.'))):
      FutureBuilder<List<CatalogueProduct>>(future:future,builder:(context,snapshot){
        if(snapshot.hasError)return const Center(child:Text('Product catalogue could not be opened. Please reopen this page.'));
        if(!snapshot.hasData)return const Center(child:CircularProgressIndicator());
        final all=snapshot.data!;
        final categories=['All',...all.map((p)=>p.category).toSet()];
        final rows=all.where((p)=>p.matches(query,category)).toList();
        final compact=MediaQuery.sizeOf(context).width<340||MediaQuery.textScalerOf(context).scale(14)>18;
        return CustomScrollView(slivers:[
          SliverToBoxAdapter(child:Padding(padding:const EdgeInsets.fromLTRB(16,14,16,8),
            child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text(reviewing?'Make this range yours':'${all.length} everyday products',style:const TextStyle(fontSize:23,fontWeight:FontWeight.w800)),
              const SizedBox(height:5),Text(reviewing?
                'Enter the price per pack and the number of packs your shop has. Active, approved shops publish their selected range.':
                'Choose what your shop sells. Reference photos show the product type; brands and packaging may differ.',
                style:const TextStyle(color:Color(0xFF6C7880),height:1.35)),
              if(error!=null)Padding(padding:const EdgeInsets.only(top:8),child:Text(error!,style:const TextStyle(color:Colors.red))),
              if(!reviewing)...[
                const SizedBox(height:14),TextField(onChanged:(value)=>setState(()=>query=value),
                  decoration:const InputDecoration(hintText:'Search bread, milk, rice, soap…',prefixIcon:Icon(Icons.search),border:OutlineInputBorder())),
                const SizedBox(height:10),SingleChildScrollView(scrollDirection:Axis.horizontal,child:Row(children:[
                  for(final group in categories)Padding(padding:const EdgeInsets.only(right:7),child:ChoiceChip(label:Text(group),
                    selected:category==group,onSelected:(_)=>setState(()=>category=group)))
                ]))
              ]
            ]))),
          if(reviewing)SliverPadding(padding:const EdgeInsets.fromLTRB(12,0,12,12),sliver:SliverList.list(children:[
            for(final entry in selected.values)reviewEntry(entry),
            const Padding(padding:EdgeInsets.all(12),child:Text('Public prices appear on eligible listing plans. Custom products and uploaded photos continue through catalogue review.',
              style:TextStyle(fontSize:12,color:Color(0xFF6C7880))))
          ]))
          else if(rows.isEmpty)const SliverFillRemaining(hasScrollBody:false,child:Center(child:Text('No matching products. Try another search.')))
          else if(compact)SliverPadding(padding:const EdgeInsets.all(12),sliver:SliverList.list(children:rows.map((p)=>productCard(p,true)).toList()))
          else SliverPadding(padding:const EdgeInsets.all(16),sliver:SliverLayoutBuilder(builder:(context,constraints)=>SliverGrid(
            gridDelegate:SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount:constraints.crossAxisExtent>700?4:2,
              mainAxisExtent:225,mainAxisSpacing:12,crossAxisSpacing:12),
            delegate:SliverChildBuilderDelegate((_,index)=>productCard(rows[index],false),childCount:rows.length))))
        ]);
      }));
}
