import 'package:flutter/material.dart';

/// Branded first-paint loading experience. The home screen is shown only after
/// initial discovery and important image caches are ready (or time out).
class ShopperLaunchScreen extends StatefulWidget {
  const ShopperLaunchScreen({super.key});
  @override
  State<ShopperLaunchScreen> createState() => _ShopperLaunchScreenState();
}
class _ShopperLaunchScreenState extends State<ShopperLaunchScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController pulse;
  @override
  void initState() {
    super.initState();
    pulse=AnimationController(vsync:this,
      duration:const Duration(milliseconds:1300))..repeat(reverse:true);
  }
  @override
  void dispose() { pulse.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor:const Color(0xFF073C36),
    body:SafeArea(child:Stack(children:[
      Positioned(top:-105,right:-120,child:Container(width:310,height:310,
        decoration:BoxDecoration(shape:BoxShape.circle,
          color:Colors.white.withValues(alpha:.055)))),
      Positioned(bottom:-115,left:-105,child:Container(width:300,height:300,
        decoration:BoxDecoration(shape:BoxShape.circle,
          color:const Color(0xFF36BD93).withValues(alpha:.12)))),
      Center(child:Column(mainAxisSize:MainAxisSize.min,children:[
        AnimatedBuilder(animation:pulse,builder:(context,_)=>Transform.scale(
          scale:.97+pulse.value*.06,
          child:Container(width:118,height:118,
            decoration:BoxDecoration(
              color:const Color(0xFF12A57A),
              borderRadius:BorderRadius.circular(34),
              border:Border.all(color:Colors.white24,width:2),
              boxShadow:[BoxShadow(color:const Color(0xFF27D5A8)
                .withValues(alpha:.12+pulse.value*.25),
                blurRadius:28+13*pulse.value,spreadRadius:5)]),
            child:const Icon(Icons.storefront_rounded,color:Colors.white,size:63)))),
        const SizedBox(height:26),
        const Text('TEYZA',style:TextStyle(color:Colors.white,fontSize:37,
          fontWeight:FontWeight.w900,letterSpacing:6)),
        const SizedBox(height:5),
        const Text('YOUR NEIGHBOURHOOD, YOUR MARKET',
          textAlign:TextAlign.center,style:TextStyle(color:Color(0xFFD0F6E8),
            fontSize:11,letterSpacing:1.1,fontWeight:FontWeight.w700)),
        const SizedBox(height:40),
        const SizedBox(width:190,child:LinearProgressIndicator(
          minHeight:4,color:Color(0xFF4DDBB1),
          backgroundColor:Color(0xFF2B6257))),
        const SizedBox(height:14),
        const Text('Getting your local shops ready…',
          style:TextStyle(color:Color(0xFFDBF5EC),fontSize:13))
      ])),
      const Positioned(left:0,right:0,bottom:20,child:Text(
        'SPAZA SHOPS  •  OTHER RETAIL  •  DELIVERY',
        textAlign:TextAlign.center,
        style:TextStyle(color:Color(0xFFB8DECE),fontSize:10,letterSpacing:1.1)))
    ]))));
}
