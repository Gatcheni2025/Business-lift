import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:teyza_shopper/seller_firestore.dart';
import 'package:teyza_shopper/seller_onboarding.dart';
import 'package:teyza_shopper/seller_registration.dart';
import 'package:teyza_shopper/seller_registration_draft.dart';
import 'package:teyza_shopper/shopper_auth.dart';
import 'seller_experience_test.dart' as fixtures;

class MemoryDraftStore implements SessionStore {
  final values=<String,String>{};
  bool failWrites=false;
  Completer<void>? writeGate;
  @override Future<String?> read(String key) async=>values[key];
  @override Future<void> write(String key,String value) async {
    if(writeGate!=null)await writeGate!.future;
    if(failWrites)throw StateError('Storage unavailable');
    values[key]=value;
  }
  @override Future<void> delete(String key) async {values.remove(key);}
}

class ProgressApi extends fixtures.ExperienceApi {
  ProgressApi(super.session);
  Map<String,dynamic> progress={};
  @override Future<Map<String,dynamic>> call(String action,[Map<String,dynamic> data=const {}]) async {
    if(action=='seller_onboarding'){
      calls.add((action:action,data:data));
      return {...progress};
    }
    return super.call(action,data);
  }
}

void main(){
  const shop=SellerShop('Local Market','spaza','Durban','pending','not_listed',phone:'+27712345678');
  const fullProgress={'legalType':'individual','phone':'+27712345678','phoneVerified':true,
    'identity':{'kind':'id'},'selfie':{'status':'pending_review'},
    'shopFront':{'photoId':'saved-photo'},'locationSaved':true};

  test('Business drafts are owner scoped, expiring, and contain no consent or signed selections',() async {
    var stamp=DateTime.utc(2026,11,25);
    final memory=MemoryDraftStore(),drafts=SellerRegistrationDraftStore(store:MemoryDraftStore());
    final store=SellerRegistrationDraftStore(store:memory,now:()=>stamp);
    await store.save('owner-a',const SellerRegistrationDraft(name:'Local Market',phone:'0712345678',addressText:'Durban'));
    expect((await store.read('owner-a'))?.name,'Local Market');
    expect(await store.read('owner-b'),isNull);
    expect(await drafts.read('owner-a'),isNull);
    final fields=jsonDecode(memory.values.values.single)['fields'] as Map;
    expect(fields.keys.toSet(),{'name','phone','category','businessType','legalType','companyName','companyNumber','unit','addressText'});
    expect(fields.containsKey('whatsappConsent'),false);
    expect(fields.containsKey('addressSelection'),false);
    expect(fields.containsKey('documentNumber'),false);
    stamp=stamp.add(const Duration(days:8));
    expect(await store.read('owner-a'),isNull);
    expect(memory.values,isEmpty);
  });

  test('Drafts preserve the business type without granting another account category',() async {
    final drafts=SellerRegistrationDraftStore(store:MemoryDraftStore());
    await drafts.save('owner',const SellerRegistrationDraft(
      name:'Neighbourhood salon',category:'retail',businessType:'salon'));
    final restored=await drafts.read('owner');
    expect(restored?.category,'retail');
    expect(restored?.businessType,'salon');
    final foreignType=SellerRegistrationDraft.fromJson({
      'name':'Neighbourhood salon','category':'retail','businessType':'wholesale_supplier'});
    expect(foreignType.category,'retail');
    expect(foreignType.businessType,'other_services');
    final legacy=SellerRegistrationDraft.fromJson({'name':'Local Market','category':'spaza'});
    expect(legacy.businessType,'spaza_shop');
  });

  test('A pending autosave cannot recreate a draft after submission clears it',() async {
    final memory=MemoryDraftStore()..writeGate=Completer<void>();
    final first=SellerRegistrationDraftStore(store:memory),second=SellerRegistrationDraftStore(store:memory);
    final save=first.save('owner',const SellerRegistrationDraft(name:'Saved draft'));
    final clear=second.clear('owner');
    memory.writeGate!.complete();await save;await clear;
    expect(await second.read('owner'),isNull);
  });

  test('Malformed and foreign-owner drafts are discarded without returning fields',() async {
    final memory=MemoryDraftStore(),store=SellerRegistrationDraftStore(store:MemoryDraftStore());
    final checked=SellerRegistrationDraftStore(store:memory);
    await checked.save('owner',const SellerRegistrationDraft(name:'Original'));
    final key=memory.values.keys.single;
    memory.values[key]='not json';expect(await checked.read('owner'),isNull);
    await checked.save('owner',const SellerRegistrationDraft(name:'Original'));
    final record=jsonDecode(memory.values[key]!) as Map<String,dynamic>;
    record['ownerUid']='different';memory.values[key]=jsonEncode(record);
    expect(await checked.read('owner'),isNull);expect(memory.values,isEmpty);
    expect(await store.read('owner'),isNull);
  });

  testWidgets('Reopening restores business fields but requires a fresh selected address and consent',(tester) async {
    final session=fixtures.Session(),api=fixtures.ExperienceApi(fixtures.Session());
    final memory=MemoryDraftStore(),store=SellerRegistrationDraftStore(store:MemoryDraftStore());
    final drafts=SellerRegistrationDraftStore(store:memory);
    await drafts.save('owner',SellerRegistrationDraft(name:'Local Market',phone:'0712345678',
      addressText:fixtures.addressFixture['address'] as String));
    await tester.pumpWidget(MaterialApp(home:SellerRegistrationPage(session:session,api:api,draftStore:drafts)));
    await tester.pumpAndSettle();
    expect(find.text('Step 2 of 3 · Shop address'),findsOneWidget);
    expect(find.textContaining('saved business details are restored'),findsOneWidget);
    expect(api.calls,isEmpty,reason:'A saved address must not replay expired signed Google receipts');
    final address=find.byKey(const ValueKey('shop-address-search'));
    expect(tester.widget<TextFormField>(address).controller!.text,fixtures.addressFixture['address']);
    await fixtures.visibleTap(tester,find.byKey(const ValueKey('teyza-registration-next')));
    expect(find.textContaining('Select your complete shop address'),findsOneWidget);
    await fixtures.selectAddress(tester);
    await fixtures.visibleTap(tester,find.text('No — this is a new business listing'));
    await fixtures.visibleTap(tester,find.byKey(const ValueKey('teyza-registration-next')));
    final checks=tester.widgetList<CheckboxListTile>(find.byType(CheckboxListTile)).toList();
    expect(checks.every((check)=>check.value==false),true);
    await fixtures.visibleTap(tester,find.byKey(const ValueKey('teyza-registration-next')));
    expect(api.calls.where((call)=>call.action=='seller_register'),isEmpty);
    await fixtures.visibleTap(tester,find.text('I confirm that these are my shop’s details and shoppers may see this business address and map location.'));
    await fixtures.visibleTap(tester,find.byKey(const ValueKey('teyza-registration-next')));
    expect(api.calls.where((call)=>call.action=='seller_register'),hasLength(1));
    expect(await drafts.read('owner'),isNull,reason:'Successful registration clears the device draft');
    expect(await store.read('owner'),isNull);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });

  testWidgets('Invalid phone explains the problem and failed draft storage can retry',(tester) async {
    final session=fixtures.Session(),api=fixtures.ExperienceApi(fixtures.Session());
    final memory=MemoryDraftStore()..failWrites=true;
    await tester.pumpWidget(MaterialApp(home:SellerRegistrationPage(session:session,api:api,
      draftStore:SellerRegistrationDraftStore(store:memory))));await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField,'Shop name'),'Local Market');
    await tester.enterText(find.widgetWithText(TextFormField,'Contact number'),'letters123');
    tester.testTextInput.hide();await tester.pump(const Duration(milliseconds:600));await tester.pumpAndSettle();
    expect(find.textContaining('could not be saved on this device'),findsOneWidget);
    await fixtures.visibleTap(tester,find.byKey(const ValueKey('teyza-registration-next')));
    expect(find.textContaining('Enter a valid mobile number'),findsOneWidget);
    expect(api.calls.where((call)=>call.action=='seller_register'),isEmpty);
    memory.failWrites=false;
    await fixtures.visibleTap(tester,find.text('Retry saving draft'));
    expect(find.textContaining('Business details saved on this device'),findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });

  testWidgets('Business types and final registration actions fit a small phone with enlarged text',(tester) async {
    await tester.binding.setSurfaceSize(const Size(320,740));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    Future<void> reveal(Finder finder) async {
      if(finder.evaluate().isEmpty){
        await tester.scrollUntilVisible(finder,160,scrollable:find.byType(Scrollable).first);
      }
      await tester.ensureVisible(finder);await tester.pumpAndSettle();
    }
    Future<void> tap(Finder finder) async {
      await reveal(finder);await fixtures.visibleTap(tester,finder);
    }
    for(final category in ['spaza','retail','wholesale']){
      final session=fixtures.Session()..requestedSellerCategory=category;
      final api=fixtures.ExperienceApi(session);
      await tester.pumpWidget(MaterialApp(home:MediaQuery(
        data:const MediaQueryData(textScaler:TextScaler.linear(1.5)),
        child:SellerRegistrationPage(session:session,api:api,
          draftStore:SellerRegistrationDraftStore(store:MemoryDraftStore())))));
      await tester.pumpAndSettle();
      expect(tester.takeException(),isNull);
      if(category=='spaza'){
        await reveal(find.widgetWithText(TextFormField,'Shop name'));
        await tester.enterText(find.widgetWithText(TextFormField,'Shop name'),'Local Market');
        await reveal(find.widgetWithText(TextFormField,'Contact number'));
        await tester.enterText(find.widgetWithText(TextFormField,'Contact number'),'0712345678');
        tester.testTextInput.hide();await tester.pumpAndSettle();
        await tap(find.byKey(const ValueKey('teyza-registration-next')));
        await reveal(find.byKey(const ValueKey('shop-address-search')));
        await fixtures.selectAddress(tester);
        await tap(find.text('No — this is a new business listing'));
        await tap(find.byKey(const ValueKey('teyza-registration-next')));
        await reveal(find.byKey(const ValueKey('teyza-registration-next')));
        await tester.pumpAndSettle();
        expect(find.widgetWithText(FilledButton,'Submit & verify'),findsOneWidget);
        expect(tester.takeException(),isNull);
        expect(api.calls.where((call)=>call.action=='seller_register'),isEmpty);
      }
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();session.dispose();
    }
  });

  testWidgets('Verification reopens at the first missing check and refresh does not move the user',(tester) async {
    final session=fixtures.Session(),api=ProgressApi(fixtures.Session());
    api.progress={...fullProgress,'phoneVerified':false,'shopFront':null,'locationSaved':false};
    await tester.pumpWidget(MaterialApp(home:SellerOnboardingPage(session:session,shop:shop,api:api)));
    await tester.pumpAndSettle();
    final title=find.byKey(const ValueKey('teyza-onboarding-step-title'));
    await tester.scrollUntilVisible(title,180,scrollable:find.byType(Scrollable).first);
    expect(tester.widget<Text>(title).data,'Mobile OTP');
    api.progress={...api.progress,'phoneVerified':true};
    await tester.tap(find.byTooltip('Refresh registration'));await tester.pumpAndSettle();
    expect(tester.widget<Text>(title).data,'Mobile OTP',reason:'Keep the current step during an in-session refresh');
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpWidget(MaterialApp(home:SellerOnboardingPage(session:session,shop:shop,api:api)));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(title,180,scrollable:find.byType(Scrollable).first);
    expect(tester.widget<Text>(title).data,'Shop photo');
    expect(api.calls.where((call)=>call.action=='seller_onboarding_complete'),isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });

  testWidgets('Submitted applications show pending review and never offer duplicate submission',(tester) async {
    final session=fixtures.Session(),api=ProgressApi(fixtures.Session());
    api.progress={...fullProgress,'sellingStatus':'pending_approval',
      'registrationProgress':{'status':'pending_review','submitted':true,'readyToSubmit':false}};
    await tester.pumpWidget(MaterialApp(home:SellerOnboardingPage(session:session,shop:shop,api:api)));
    await tester.pumpAndSettle();
    expect(find.text('Application submitted'),findsOneWidget);
    expect(find.textContaining('awaiting Teyza review'),findsOneWidget);
    expect(find.text('Verification approved'),findsNothing);
    await tester.scrollUntilVisible(find.byKey(const ValueKey('teyza-onboarding-next')),180,scrollable:find.byType(Scrollable).first);
    expect(find.widgetWithText(FilledButton,'Submit for review'),findsNothing);
    expect(find.widgetWithText(FilledButton,'Back to business'),findsOneWidget);
    expect(api.calls.where((call)=>call.action=='seller_onboarding_complete'),isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });

  testWidgets('Server correction resets the selfie step and completion status',(tester) async {
    final session=fixtures.Session(),api=ProgressApi(fixtures.Session());
    api.progress={...fullProgress,'selfie':{'status':'needs_new_photo','reviewNote':'Retake a clear selfie'},
      'sellingStatus':'pending_approval','registrationProgress':{'status':'needs_correction','submitted':false,
        'readyToSubmit':false,'steps':[{'id':'selfie','complete':false}]}};
    await tester.pumpWidget(MaterialApp(home:SellerOnboardingPage(session:session,shop:shop,api:api)));
    await tester.pumpAndSettle();
    expect(find.text('Registration needs attention'),findsOneWidget);
    expect(find.text('Application submitted'),findsNothing);
    await tester.scrollUntilVisible(find.byKey(const ValueKey('teyza-onboarding-step-title')),180,scrollable:find.byType(Scrollable).first);
    expect(tester.widget<Text>(find.byKey(const ValueKey('teyza-onboarding-step-title'))).data,'Owner selfie');
    expect(find.text('Owner selfie saved privately'),findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });

  testWidgets('Legacy approved selfie cannot imply approval after identity replacement',(tester) async {
    final session=fixtures.Session(),api=ProgressApi(fixtures.Session());
    api.progress={...fullProgress,'selfie':{'status':'approved'},'sellingStatus':'not_started'};
    await tester.pumpWidget(MaterialApp(home:SellerOnboardingPage(session:session,shop:shop,api:api)));
    await tester.pumpAndSettle();
    expect(find.text('Verification approved'),findsNothing);
    expect(find.text('Application submitted'),findsNothing);
    await tester.scrollUntilVisible(find.byKey(const ValueKey('teyza-onboarding-next')),180,scrollable:find.byType(Scrollable).first);
    expect(find.widgetWithText(FilledButton,'Submit for review'),findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });

  testWidgets('Approved business may return to work while its map location needs maintenance',(tester) async {
    final session=fixtures.Session(),api=ProgressApi(fixtures.Session());
    api.progress={...fullProgress,'identity':null,'selfie':null,'shopFront':null,'locationSaved':false,
      'registrationProgress':{'status':'approved','submitted':true,'readyToSubmit':false,
        'steps':[{'id':'identity','complete':true},{'id':'selfie','complete':true},{'id':'phone','complete':true},
          {'id':'photo','complete':false},{'id':'location','complete':false}]}};
    await tester.pumpWidget(MaterialApp(home:SellerOnboardingPage(session:session,shop:shop,api:api)));
    await tester.pumpAndSettle();
    expect(find.text('Verification approved'),findsOneWidget);
    await tester.scrollUntilVisible(find.byKey(const ValueKey('teyza-onboarding-step-title')),180,scrollable:find.byType(Scrollable).first);
    expect(tester.widget<Text>(find.byKey(const ValueKey('teyza-onboarding-step-title'))).data,'Shop location');
    await tester.scrollUntilVisible(find.byKey(const ValueKey('teyza-onboarding-next')),180,scrollable:find.byType(Scrollable).first);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton,'Back to business')).onPressed,isNotNull);
    expect(find.widgetWithText(FilledButton,'Submit for review'),findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());session.dispose();api.session.dispose();
  });

  testWidgets('Resumed and submitted registration remain readable on small phones',(tester) async {
    await tester.binding.setSurfaceSize(const Size(390,844));addTearDown(()=>tester.binding.setSurfaceSize(null));
    if(Platform.environment['TEYZA_CAPTURE_UI']=='1'){
      await (FontLoader('PT Sans')..addFont(rootBundle.load('assets/fonts/PTSans-Regular.ttf'))
        ..addFont(rootBundle.load('assets/fonts/PTSans-Bold.ttf'))).load();
      await (FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    }
    final session=fixtures.Session(),api=ProgressApi(fixtures.Session());
    for(final pending in [false,true]){
      api.progress=pending?{...fullProgress,'sellingStatus':'pending_approval'}:
        {...fullProgress,'phoneVerified':false,'shopFront':null,'locationSaved':false};
      final boundary=GlobalKey();
      await tester.pumpWidget(MaterialApp(theme:ThemeData(useMaterial3:true,fontFamily:'PT Sans',
        colorScheme:ColorScheme.fromSeed(seedColor:const Color(0xFF168657))),
        home:RepaintBoundary(key:boundary,child:SellerOnboardingPage(session:session,shop:shop,api:api))));
      await tester.pumpAndSettle();expect(tester.takeException(),isNull);
      if(Platform.environment['TEYZA_CAPTURE_UI']=='1')await tester.runAsync(() async{
        final render=boundary.currentContext!.findRenderObject() as RenderRepaintBoundary;
        final image=await render.toImage(pixelRatio:2),data=await image.toByteData(format:ui.ImageByteFormat.png);
        final file=File('build/ui-preview/${pending?'registration-awaiting-review':'registration-resume'}.png');
        await file.parent.create(recursive:true);await file.writeAsBytes(data!.buffer.asUint8List());image.dispose();
      });
      await tester.binding.setSurfaceSize(const Size(320,740));
      await tester.pumpWidget(MaterialApp(home:MediaQuery(data:const MediaQueryData(textScaler:TextScaler.linear(1.5)),
        child:SellerOnboardingPage(session:session,shop:shop,api:api))));
      await tester.pumpAndSettle();expect(tester.takeException(),isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.binding.setSurfaceSize(const Size(390,844));
    }
    session.dispose();api.session.dispose();
  });
}
