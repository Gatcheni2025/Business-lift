import 'dart:math';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'shopper_auth.dart';
import 'seller_firestore.dart';

class SellerWorkspacePage extends StatefulWidget{
  final ShopperSession session;
  final VoidCallback openLogin;
  const SellerWorkspacePage({super.key,required this.session,required this.openLogin});
  @override State<SellerWorkspacePage> createState()=>_SellerWorkspaceState();
}
class _SellerWorkspaceState extends State<SellerWorkspacePage>{
  SellerShop? shop;
  List<SellerDraft> drafts=[];
  SellerFirestore? api;
  String? loadedUid,error;
  bool loading=false,busy=false;
  @override void initState(){
    super.initState();
    widget.session.addListener(_sessionChanged);
    WidgetsBinding.instance.addPostFrameCallback((_){if(mounted)_sessionChanged();});
  }
  @override void dispose(){
    widget.session.removeListener(_sessionChanged);
    super.dispose();
  }
  void _sessionChanged(){
    final uid=widget.session.userId;
    if(widget.session.idToken==null||uid==null){
      if(loadedUid!=null && mounted)setState((){
        loadedUid=null;api=null;shop=null;drafts=[];error=null;
      });
      return;
    }
    if(widget.session.emailVerified && loadedUid!=uid && !loading){
      load();
    }
  }
  Future<void> load() async{
    if(loading || !mounted)return;
    setState((){loading=true;error=null;});
    try{
      final token=await widget.session.freshIdToken();
      final uid=widget.session.userId;
      if(uid==null)throw StateError('Sign in again.');
      final nextApi=SellerFirestore(uid:uid,token:token);
      final nextShop=await nextApi.shop();
      final nextDrafts=nextShop!=null?await nextApi.drafts():<SellerDraft>[];
      if(mounted)setState((){
        api=nextApi;shop=nextShop;drafts=nextDrafts;loadedUid=uid;
      });
    }catch(e){
      if(mounted)setState((){error=e.toString().replaceFirst('Bad state: ','');loadedUid=widget.session.userId;});
    }finally{if(mounted)setState(()=>loading=false);}
  }
  Future<void> _verify() async{
    try{
      await widget.session.sendEmailVerification();
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content:Text('Verification email sent. Check your inbox.')));
    }catch(_){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content:Text('Could not send a verification email.')));
    }
  }
  Future<void> _save(SellerDraft p) async{
    if(api==null || busy)return;
    setState(()=>busy=true);
    try{
      final token=await widget.session.freshIdToken();
      await SellerFirestore(uid:widget.session.userId!,token:token).save(p);
      await loadAfterSave();
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content:Text('Product saved as a private draft.')));
    }catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content:Text(e.toString().replaceFirst('Bad state: ',''))));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> loadAfterSave() async{
    final token=await widget.session.freshIdToken();
    final current=SellerFirestore(uid:widget.session.userId!,token:token);
    final items=await current.drafts();
    if(mounted)setState((){drafts=items;api=current;});
  }
  Future<void> _delete(SellerDraft item) async{
    if(busy)return;
    final accept=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
      title:const Text('Delete product draft?'),
      content:Text('Remove '+item.name+' from your private stock list?'),
      actions:[
        TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),
        TextButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Delete'))
      ]));
    if(accept!=true)return;
    setState(()=>busy=true);
    try{
      final token=await widget.session.freshIdToken();
      await SellerFirestore(uid:widget.session.userId!,token:token).delete(item.id);
      await loadAfterSave();
    }catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content:Text(e.toString().replaceFirst('Bad state: ',''))));}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> _edit([SellerDraft? existing]) async{
    if(busy)return;
    final name=TextEditingController(text:existing?.name??'');
    final category=TextEditingController(text:existing?.category??'Groceries');
    final price=TextEditingController(text:existing!=null?(existing.priceCents/100).toStringAsFixed(2):'');
    final stock=TextEditingController(text:existing?.stock.toString()??'');
    final key=GlobalKey<FormState>();
    final result=await showModalBottomSheet<SellerDraft>(context:context,isScrollControlled:true,
      useSafeArea:true,showDragHandle:true,
      builder:(ctx)=>Padding(padding:EdgeInsets.only(left:20,right:20,top:10,
        bottom:MediaQuery.of(ctx).viewInsets.bottom+20),
        child:SingleChildScrollView(child:Form(key:key,child:Column(
          mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.stretch,
          children:[
            Text(existing==null?'Add a product':'Edit product',
              style:Theme.of(ctx).textTheme.headlineSmall),
            const SizedBox(height:10),
            const Text('Products are saved privately. Approval and R99 activation are separate.'),
            const SizedBox(height:16),
            TextFormField(controller:name,maxLength:120,
              decoration:const InputDecoration(labelText:'Product name',border:OutlineInputBorder()),
              validator:(v)=>v==null||v.trim().length<2?'Enter a product name':null),
            const SizedBox(height:8),
            TextFormField(controller:category,maxLength:60,
              decoration:const InputDecoration(labelText:'Category',border:OutlineInputBorder()),
              validator:(v)=>v==null||v.trim().isEmpty?'Enter a category':null),
            const SizedBox(height:8),
            TextFormField(controller:price,keyboardType:const TextInputType.numberWithOptions(decimal:true),
              decoration:const InputDecoration(labelText:'Price (R)',border:OutlineInputBorder()),
              validator:(v){final amount=double.tryParse((v??'').replaceAll(',','.'));
                return amount==null||!amount.isFinite||amount<=0||amount>1000000?'Enter a valid price':null;}),
            const SizedBox(height:8),
            TextFormField(controller:stock,keyboardType:TextInputType.number,
              decoration:const InputDecoration(labelText:'Quantity in stock',border:OutlineInputBorder()),
              validator:(v){final n=int.tryParse((v??'').trim());
                return n==null||n<0||n>1000000?'Enter a valid stock quantity':null;}),
            const SizedBox(height:14),
            FilledButton.icon(icon:const Icon(Icons.save_outlined),label:const Text('Save draft'),
              onPressed:(){
                if(key.currentState!.validate()) {
                  Navigator.of(ctx).pop(SellerDraft(
                    id:existing?.id??'p'+DateTime.now().microsecondsSinceEpoch.toString()+
                      Random.secure().nextInt(100000).toString(),
                    name:name.text.trim(),category:category.text.trim(),
                    priceCents:(double.parse(price.text.replaceAll(',','.'))*100).round(),
                    stock:int.parse(stock.text.trim())));
                }
              }),
          ])))));
    name.dispose();category.dispose();price.dispose();stock.dispose();
    if(result!=null)await _save(result);
  }
  Widget _card(Widget child)=>Card(color:Colors.white,child:Padding(
    padding:const EdgeInsets.all(16),child:child));
  @override Widget build(BuildContext context){
    final session=widget.session;
    return AnimatedBuilder(animation:session,builder:(ctx,child){
      if(session.idToken==null)return ListView(padding:const EdgeInsets.all(18),children:[
        _card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Icon(Icons.storefront_outlined,size:44,color:Color(0xFF008D64)),
          const SizedBox(height:8),
          const Text('Manage your Teyza shop',
            style:TextStyle(fontSize:23,fontWeight:FontWeight.w800)),
          const SizedBox(height:8),
          const Text('Sign in using the same Google or email account you used on teyza.co.za.'),
          const SizedBox(height:14),
          FilledButton(onPressed:widget.openLogin,child:const Text('Shop owner sign in'))
        ]))
      ]);
      if(!session.emailVerified)return ListView(padding:const EdgeInsets.all(18),children:[
        _card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Text('Verify your email to manage your shop',
            style:TextStyle(fontSize:20,fontWeight:FontWeight.w700)),
          const SizedBox(height:10),
          Text(session.email??''),
          const SizedBox(height:15),
          FilledButton(onPressed:_verify,child:const Text('Send verification email')),
          OutlinedButton(onPressed:() async {await session.refreshEmailStatus();
            if(session.emailVerified)load();},child:const Text('I have verified my email')),
        ]))
      ]);
      if(loading)return const Center(child:CircularProgressIndicator());
      return RefreshIndicator(onRefresh:load,child:ListView(padding:const EdgeInsets.all(16),children:[
        Text('My shop',style:Theme.of(context).textTheme.headlineMedium?.copyWith(
          fontWeight:FontWeight.w800,color:const Color(0xFF003F4A))),
        const SizedBox(height:10),
        if(error!=null)_card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text(error!,style:const TextStyle(color:Colors.red)),
          TextButton(onPressed:load,child:const Text('Retry'))
        ])),
        if(shop==null)_card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          const Text('No registered shop found',style:TextStyle(fontSize:21,fontWeight:FontWeight.bold)),
          const SizedBox(height:9),
          const Text('Register your shop on the Teyza website first. Your same account will then work here.'),
          const SizedBox(height:14),
          FilledButton(onPressed:()=>launchUrl(Uri.parse('https://teyza.co.za/register.html'),
            mode:LaunchMode.externalApplication),child:const Text('Register a shop')),
          OutlinedButton(onPressed:load,child:const Text('Refresh my shop')),
        ]))
        else ...[
          _card(Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text(shop!.name.isEmpty?'My Teyza shop':shop!.name,
              style:const TextStyle(fontSize:22,fontWeight:FontWeight.bold)),
            const SizedBox(height:4),
            Text(shop!.address),
            const SizedBox(height:8),
            Chip(label:Text(shop!.isLive?'Shop is live':'Shop is not live yet'),
              avatar:Icon(shop!.isLive?Icons.check_circle_outline:Icons.lock_outline,size:19)),
            Text('Verification: '+shop!.approvalStatus),
            Text('Listing: '+shop!.listingStatus),
            const SizedBox(height:6),
            const Text('You can prepare your products now. Only Teyza administrators can approve and activate a public listing.'),
          ])),
          const SizedBox(height:12),
          _card(Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
            Row(children:[
              const Expanded(child:Text('My products',style:TextStyle(fontSize:20,
                fontWeight:FontWeight.bold))),
              IconButton(onPressed:busy?null:load,icon:const Icon(Icons.refresh))
            ]),
            Text(drafts.isEmpty?'No products saved yet.':'Private drafts: '+drafts.length.toString()),
            const SizedBox(height:10),
            FilledButton.icon(onPressed:busy?null:()=>_edit(),
              icon:const Icon(Icons.add),label:const Text('Add a product')),
            for(final item in drafts)
              Column(children:[
                const Divider(),
                ListTile(contentPadding:EdgeInsets.zero,
                  title:Text(item.name),
                  subtitle:Text(item.category+'  ·  Stock: '+item.stock.toString()+
                    '  ·  Private draft'),
                  trailing:Text('R'+(item.priceCents/100).toStringAsFixed(2)),
                  onTap:busy?null:()=>_edit(item)),
                Row(mainAxisAlignment:MainAxisAlignment.end,children:[
                  TextButton.icon(onPressed:busy?null:()=>_edit(item),
                    icon:const Icon(Icons.edit_outlined),label:const Text('Edit')),
                  TextButton.icon(onPressed:busy?null:()=>_delete(item),
                    icon:const Icon(Icons.delete_outline),label:const Text('Delete'))
                ])
              ])
          ])),
          const SizedBox(height:12),
          _card(const Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text('Orders and selling',style:TextStyle(fontSize:18,fontWeight:FontWeight.bold)),
            SizedBox(height:8),
            Text('Online orders and live selling will be enabled once Teyza merchant approval, subscription activation and order processing are connected. Product drafts are not visible to customers.')
          ])),
        ]
      ]));
    });
  }
}
