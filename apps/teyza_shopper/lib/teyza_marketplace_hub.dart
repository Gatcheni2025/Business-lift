import 'package:flutter/material.dart';

/// Teyza's own premium marketplace design. The four destinations are
/// deliberately separate: products are not shop records, local businesses
/// are not spaza shops, and wholesalers do not sell to shoppers.
class TeyzaMarketplaceHub extends StatelessWidget {
  final ValueChanged<String> onDestination;
  const TeyzaMarketplaceHub({super.key,required this.onDestination});

  static const navy=Color(0xFF090F21);
  static const panel=Color(0xFF1D2639);
  static const mint=Color(0xFF60D5A5);

  Widget destination(String type,String name,String subtitle,IconData icon,
      {required Color accent}){
    return Semantics(button:true,label:'Explore $name',child:Material(
      color:panel,borderRadius:BorderRadius.circular(20),
      child:InkWell(key:ValueKey('teyza-hub-$type'),
        borderRadius:BorderRadius.circular(20),
        onTap:()=>onDestination(type),
        child:Padding(padding:const EdgeInsets.all(14),
          child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Container(width:44,height:44,
              decoration:BoxDecoration(color:accent.withValues(alpha:.16),
                borderRadius:BorderRadius.circular(14)),
              child:Icon(icon,color:accent,size:25)),
            const SizedBox(height:12),
            Text(name,maxLines:1,overflow:TextOverflow.ellipsis,
              style:const TextStyle(color:Colors.white,fontSize:15,fontWeight:FontWeight.w800)),
            const SizedBox(height:4),
            Text(subtitle,maxLines:2,overflow:TextOverflow.ellipsis,
              style:const TextStyle(color:Color(0xFFC8D2D9),fontSize:11,height:1.25))
          ])))));
  }

  @override
  Widget build(BuildContext context)=>Container(
    key:const ValueKey('teyza-marketplace-hub'),
    padding:const EdgeInsets.all(18),
    decoration:BoxDecoration(
      gradient:const LinearGradient(begin:Alignment.topLeft,end:Alignment.bottomRight,
        colors:[navy,Color(0xFF16394A)]),
      borderRadius:BorderRadius.circular(24)),
    child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      const Row(children:[
        Icon(Icons.location_city_rounded,color:mint,size:19),
        SizedBox(width:8),
        Expanded(child:Text('DISCOVER YOUR COMMUNITY',
          style:TextStyle(color:mint,fontWeight:FontWeight.w900,fontSize:11,letterSpacing:1.3)))
      ]),
      const SizedBox(height:8),
      const Text('Explore what’s near you',
        style:TextStyle(fontWeight:FontWeight.w900,fontSize:24,color:Colors.white)),
      const SizedBox(height:5),
      const Text('Browse by category. Local products, spaza shops and services each have their own space.',
        style:TextStyle(fontSize:12,color:Color(0xFFCDDCE4),height:1.45)),
      const SizedBox(height:16),
      LayoutBuilder(builder:(context,constraints){
        final width=(constraints.maxWidth-10)/2;
        return Wrap(spacing:10,runSpacing:10,children:[
          SizedBox(width:width,child:destination('products','Products','Groceries and essentials',
            Icons.shopping_bag_rounded,accent:const Color(0xFFFFCE79))),
          SizedBox(width:width,child:destination('spaza','Spaza Shops','Local neighbourhood stores',
            Icons.storefront_rounded,accent:mint)),
          SizedBox(width:width,child:destination('businesses','Businesses','Services and specialists',
            Icons.business_center_rounded,accent:const Color(0xFF89B9FF))),
          SizedBox(width:width,child:destination('wholesale','Wholesalers','Stock and supply connections',
            Icons.inventory_2_rounded,accent:const Color(0xFFD9A4FF)))
        ]);
      })
    ]));
}

/// Categories shown on the shopper home route. Every tile navigates to
/// server-published spaza product listings; never to private seller drafts.
class TeyzaHomeProductCategories extends StatelessWidget {
  final ValueChanged<String> onSelect;
  const TeyzaHomeProductCategories({super.key,required this.onSelect});

  static const categories=<(String,IconData)>[
    ('Fruit & Veg',Icons.eco_rounded),
    ('Dairy & Eggs',Icons.egg_rounded),
    ('Pantry',Icons.kitchen_rounded),
    ('Bakery',Icons.bakery_dining_rounded),
    ('Drinks',Icons.local_drink_rounded),
    ('Snacks',Icons.cookie_rounded),
    ('Household',Icons.cleaning_services_rounded),
    ('Personal Care',Icons.spa_rounded)
  ];

  @override
  Widget build(BuildContext context)=>Container(
    key:const ValueKey('teyza-product-category-grid'),
    decoration:BoxDecoration(color:const Color(0xFF161D2F),
      borderRadius:BorderRadius.circular(22)),
    padding:const EdgeInsets.fromLTRB(10,18,10,14),
    child:LayoutBuilder(builder:(context,constraints){
      final width=(constraints.maxWidth-12)/4;
      final scale=MediaQuery.textScalerOf(context);
      return Wrap(spacing:4,runSpacing:12,children:[
        for(final item in categories)
          SizedBox(width:width,child:Semantics(button:true,label:'Shop ${item.$1} products',
            child:InkWell(key:ValueKey('teyza-category-${item.$1}'),
              borderRadius:BorderRadius.circular(15),
              onTap:()=>onSelect(item.$1),
              child:Padding(padding:const EdgeInsets.symmetric(vertical:5,horizontal:2),
                child:Column(mainAxisSize:MainAxisSize.min,children:[
                  Container(width:50,height:50,
                    decoration:BoxDecoration(color:const Color(0xFF28344B),
                      borderRadius:BorderRadius.circular(16)),
                    child:Icon(item.$2,color:const Color(0xFF7AE7BC),size:26)),
                  const SizedBox(height:7),
                  SizedBox(height:scale.scale(34),child:Center(
                    child:Text(item.$1,maxLines:2,textAlign:TextAlign.center,
                      overflow:TextOverflow.ellipsis,style:const TextStyle(
                        color:Colors.white,fontWeight:FontWeight.w700,fontSize:11,height:1.2))))
                ])))))
      ]);
    }));
}
