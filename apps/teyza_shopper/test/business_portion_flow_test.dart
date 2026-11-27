import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/business_categories.dart';
import 'package:teyza_shopper/registration_options.dart';
import 'package:teyza_shopper/teyza_mode_chooser.dart';
import 'package:teyza_shopper/selling_units.dart';
import 'package:teyza_shopper/product_catalogue.dart';

void main(){
 test('All business types remain mapped to the three canonical permissions',(){
   expect(teyzaBusinessTypes.length,61);
   expect(teyzaBusinessTypes.map((e)=>e.id).toSet().length,61);
   expect(teyzaTypeFor('plumber')?.accountCategory,'retail');
   expect(teyzaTypeFor('bakery')?.accountCategory,'spaza');
   expect(teyzaTypeFor('wholesale_supplier')?.accountCategory,'wholesale');
   expect(teyzaTypeFor('missing'),isNull);
 });
 testWidgets('Registration has only shopper and business owner, then searchable business types',(tester)async{
   String? role,category,type;
   await tester.pumpWidget(MaterialApp(home:Scaffold(body:SingleChildScrollView(
     child:TeyzaRegistrationOptions(onSelected:(r,c){role=r;category=c;},
       onBusinessTypeSelected:(value)=>type=value)))));
   expect(find.byKey(const ValueKey('registration-shopper')),findsOneWidget);
   expect(find.byKey(const ValueKey('registration-seller')),findsOneWidget);
   expect(find.text('Field agent'),findsNothing);
   await tester.tap(find.byKey(const ValueKey('registration-seller')));
   await tester.pumpAndSettle();
   await tester.enterText(find.byKey(const ValueKey('teyza-business-type-search')),'plumber');
   await tester.pumpAndSettle();
   expect(find.byKey(const ValueKey('registration-business-plumber')),findsOneWidget);
   await tester.ensureVisible(find.byKey(const ValueKey('registration-business-plumber')));
   await tester.tap(find.byKey(const ValueKey('registration-business-plumber')));
   expect(role,'seller');
   expect(category,'retail');
   expect(type,'plumber');
 });
 testWidgets('Agent option is hidden without an approved existing agent account',(tester)async{
   await tester.pumpWidget(MaterialApp(home:TeyzaModeChooser(
    agentApproved:false,shopperAvailable:true,sellerAvailable:true,
    onShopper:(){},onSeller:(){},onAgent:(){})));
   expect(find.byKey(const ValueKey('mode-shopper')),findsOneWidget);
   expect(find.byKey(const ValueKey('mode-seller')),findsOneWidget);
   expect(find.byKey(const ValueKey('mode-agent')),findsNothing);
   await tester.pumpWidget(MaterialApp(home:TeyzaModeChooser(
    agentApproved:true,shopperAvailable:true,sellerAvailable:true,
    onShopper:(){},onSeller:(){},onAgent:(){})));
   expect(find.byKey(const ValueKey('mode-agent')),findsOneWidget);
 });
 test('Scale-free portion labels contain no invented gram or kilogram quantities',(){
   const veg=CatalogueProduct(id:'tomatoes',name:'Tomatoes',category:'Fruit & Veg',
     unit:'500 g',photo:'tomatoes');
   const nonLoose=CatalogueProduct(id:'soap',name:'Soap',category:'Household',
     unit:'1 pack',photo:'soap');
   expect(teyzaAllowsPortion(veg),true);
   expect(teyzaAllowsPortion(nonLoose),false);
   expect(teyzaUnitLabel('small_bag'),'Small bag (seller portion)');
   expect(teyzaSellingUnits.any((x)=>x.id=='cup'),true);
   expect(teyzaSellingUnits.any((x)=>x.id=='bunch'),true);
   expect(teyzaSellingUnits.where((e)=>e.id!='original_pack')
     .every((e)=>!RegExp(r'\\b\\d+\\s*(g|kg)\\b').hasMatch(e.label)),true);
 });
}
