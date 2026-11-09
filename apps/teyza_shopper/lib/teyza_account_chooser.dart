import 'package:flutter/material.dart';

/// Labels are intentionally derived from the stored seller category.
/// Choosing another Firebase UID NEVER authenticates or approves that UID.
String teyzaAccountLabel(String category)=>switch(category){
  'spaza'=>'Spaza shop owner',
  'wholesale'=>'Wholesaler',
  'retail'=>'Other business',
  _=>'Business account',
};

String teyzaAccountStatus(Map<String,dynamic> account){
  if(account['deletionPending']==true)return 'Deletion pending · unavailable';
  return switch(account['approvalStatus']){
    'approved'=>'Approved',
    'rejected'=>'Not approved · contact Teyza support',
    _=>'Awaiting seller verification',
  };
}

Future<String?> showTeyzaAccountChooser(BuildContext context,{
  required String currentUid,required List<Map<String,dynamic>> accounts,
  bool dismissible=true,
}) => showModalBottomSheet<String>(
  context:context,isScrollControlled:true,isDismissible:dismissible,
  showDragHandle:true,
  backgroundColor:const Color(0xFFF7FAF8),
  shape:const RoundedRectangleBorder(borderRadius:BorderRadius.vertical(top:Radius.circular(26))),
  builder:(sheet)=>SafeArea(child:Padding(
    padding:EdgeInsets.fromLTRB(18,6,18,MediaQuery.viewInsetsOf(sheet).bottom+22),
    child:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.start,children:[
      const Text('Choose your Teyza account',style:TextStyle(fontSize:23,fontWeight:FontWeight.w800)),
      const SizedBox(height:8),
      const Text('Your business type, verification and membership belong to its signed-in account. Choosing a type does not approve or transfer another account.'),
      const SizedBox(height:16),
      Card(child:ListTile(
        key:const ValueKey('teyza-account-shopper'),
        leading:const CircleAvatar(child:Icon(Icons.shopping_bag_outlined)),
        title:const Text('Shopper',style:TextStyle(fontWeight:FontWeight.w700)),
        subtitle:const Text('Browse shops, order and save your delivery address'),
        trailing:const Icon(Icons.chevron_right),
        onTap:()=>Navigator.pop(sheet,'shopper'),
      )),
      for(final account in accounts)
        Card(child:ListTile(
          key:ValueKey('teyza-account-${account['sellerUid']}'),
          leading:CircleAvatar(child:Icon(account['category']=='wholesale'?Icons.inventory_2_outlined:Icons.storefront_outlined)),
          title:Text('${account['shopName']??'Shop'} · ${teyzaAccountLabel(account['category']?.toString()??'')}',
            style:const TextStyle(fontWeight:FontWeight.w700)),
          subtitle:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text(teyzaAccountStatus(account)),
            if(account['sellerUid']!=currentUid)
              const Text('Different login · sign in with its original Google, Apple or email method',
                style:TextStyle(fontSize:12)),
            if(account['sellerUid']==currentUid)
              const Text('This signed-in account',style:TextStyle(fontSize:12)),
          ]),
          isThreeLine:true,
          trailing:account['deletionPending']==true?const Icon(Icons.block_outlined):
            const Icon(Icons.chevron_right),
          enabled:account['deletionPending']!=true,
          onTap:account['deletionPending']==true?null:()=>Navigator.pop(sheet,
            account['sellerUid']==currentUid?'seller':'signin'),
        )),
      const SizedBox(height:10),
      TextButton.icon(onPressed:()=>Navigator.pop(sheet),icon:const Icon(Icons.close),label:const Text('Close')),
    ])),
  )),
);
