import 'package:flutter/material.dart';
import 'shopper_auth.dart';
import 'account_deletion_page.dart';
import 'seller_review.dart';
import 'chat_moderation_page.dart';
import 'shopper_delivery_profile.dart';
import 'shopper_payment_preference.dart';
import 'package:url_launcher/url_launcher.dart';

class ShopperAccountPanel extends StatefulWidget {
  final ShopperSession session;
  final VoidCallback? onOpenOwner;
  final VoidCallback? onShopperSignedIn;
  final VoidCallback? onMessages,onOrders,onBrowse,onChangeDeliveryAddress;
  final String? savedDeliveryAddress;
  final ShopperDeliveryProfile? savedProfile;
  final ShopperDeliveryProfileStore? deliveryStore;
  final ShopperPaymentPreferenceStore? paymentStore;
  const ShopperAccountPanel({super.key,required this.session,this.onOpenOwner,this.onShopperSignedIn,this.onMessages,this.onOrders,this.onBrowse,
    this.onChangeDeliveryAddress,this.savedDeliveryAddress,this.savedProfile,this.deliveryStore,this.paymentStore});
  @override
  State<ShopperAccountPanel> createState()=>_AccountState();
}
class _AccountState extends State<ShopperAccountPanel> {
  final formKey=GlobalKey<FormState>();
  final email=TextEditingController(), password=TextEditingController(), name=TextEditingController();
  bool registering=false, working=false, hidden=true;
  String? audience; // Choose the account purpose before offering sign-in.
  bool get ownerMode=>audience=='owner';
  String? status;
  bool failure=false;
  ShopperDeliveryProfile? loadedProfile;
  String paymentPreference=ShopperPaymentPreferenceStore.cash;
  String? loadedUid;
  late final ShopperDeliveryProfileStore _profiles=widget.deliveryStore??ShopperDeliveryProfileStore();
  late final ShopperPaymentPreferenceStore _payments=widget.paymentStore??ShopperPaymentPreferenceStore();
  ShopperDeliveryProfile? get shopperProfile=>widget.savedProfile??loadedProfile;
  String get displayName{
    final saved=shopperProfile?.displayName.trim()??'';
    if(saved.isNotEmpty)return saved;
    final firebase=widget.session.name?.trim()??'';
    return firebase.isNotEmpty?firebase:'Teyza shopper';
  }
  String get displayPhone{
    final saved=shopperProfile?.phone.trim()??'';
    return saved.isNotEmpty?saved:(widget.session.phoneNumber??'Not provided');
  }
  String get contactEmail{
    final saved=shopperProfile?.email.trim()??'';
    return saved.isNotEmpty?saved:(widget.session.email??'Not provided');
  }
  bool get contactEmailVerified=>widget.session.emailVerified&&
    widget.session.email?.toLowerCase()==contactEmail.toLowerCase();
  @override void initState(){
    super.initState();
    loadedUid=widget.session.userId;
    widget.session.addListener(_sessionChanged);
    WidgetsBinding.instance.addPostFrameCallback((_){if(mounted)loadProfileAndPayment();});
  }
  void _sessionChanged(){
    final uid=widget.session.userId;
    if(loadedUid==uid)return;
    loadedUid=uid;
    loadedProfile=null;
    paymentPreference=ShopperPaymentPreferenceStore.cash;
    if(mounted)WidgetsBinding.instance.addPostFrameCallback((_){
      if(mounted)loadProfileAndPayment();
    });
  }
  Future<void> loadProfileAndPayment()async{
    final uid=widget.session.userId;
    if(uid==null)return;
    try{
      final profile=await _profiles.load(uid);
      final choice=await _payments.load(uid);
      if(!mounted||uid!=widget.session.userId)return;
      setState((){loadedProfile=profile;paymentPreference=choice;});
    }catch(_){/* Use the parent shopper's saved profile if local vault unavailable. */}
  }
  Future<void> changePaymentMethod()async{
    final uid=widget.session.userId;
    if(uid==null)return;
    final selected=await showModalBottomSheet<String>(context:context,showDragHandle:true,
      builder:(ctx)=>SafeArea(child:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,children:[
        const Padding(padding:EdgeInsets.all(14),
          child:Text('Preferred payment method',style:TextStyle(fontSize:20,fontWeight:FontWeight.w800))),
        ListTile(leading:const Icon(Icons.payments_outlined),
          title:const Text('Cash on delivery / collection'),
          subtitle:const Text('Pay the seller directly when receiving or collecting goods'),
          onTap:()=>Navigator.pop(ctx,ShopperPaymentPreferenceStore.cash)),
        ListTile(leading:const Icon(Icons.credit_card_outlined),
          title:const Text('Card at the shop'),
          subtitle:const Text('Available only for collection where the seller accepts cards'),
          onTap:()=>Navigator.pop(ctx,ShopperPaymentPreferenceStore.cardAtShop)),
        ListTile(leading:const Icon(Icons.credit_card_rounded),
          title:const Text('Pay online by card'),
          subtitle:const Text('Only for sellers who accept card payments. Pay securely via Paystack after the seller confirms.'),
          onTap:()=>Navigator.pop(ctx,ShopperPaymentPreferenceStore.cardOnline)),
        const Padding(padding:EdgeInsets.all(12),
          child:Text('Teyza does not collect or store card numbers. Online card payments use Paystack after an eligible seller confirms your order.',
            textAlign:TextAlign.center,style:TextStyle(fontSize:12))),
      ]))));
    if(selected==null||!mounted||uid!=widget.session.userId)return;
    try{
      await _payments.save(uid,selected);
      if(mounted)setState(()=>paymentPreference=selected);
    }catch(_){
      if(mounted)setState((){status='Could not save your preferred payment method. Try again.';failure=true;});
    }
  }
  Future<void> verifyWithProvider(bool apple)async{
    if(working||widget.session.userId==null)return;
    if(apple){
      final allowed=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
        title:const Text('Verify with Apple'),
        content:const Text('Your Apple ID will be securely linked to this existing Teyza account. Apple may provide a private relay email. Your saved contact email will remain unverified if it differs from that Apple address.'),
        actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),
          FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Continue'))]));
      if(allowed!=true||!mounted)return;
    }
    setState((){working=true;status=null;failure=false;});
    final uid=widget.session.userId;
    try{
      if(apple){await widget.session.verifyShopperWithApple();}
      else{await widget.session.verifyShopperWithGoogle();}
      if(!mounted||uid!=widget.session.userId)return;
      setState((){
        status=contactEmailVerified?'Your saved email is verified.':
          'Your Google/Apple account is linked. The saved contact email is not verified because it differs from the provider email. You can edit it using Saved delivery details.';
        failure=false;
      });
    }catch(e){
      if(mounted)setState((){status=authMessage(e);failure=true;});
    }finally{if(mounted)setState(()=>working=false);}
  }
  Future<void> openTerms()async{
    final url=Uri.parse('https://teyza.co.za/terms.html');
    try{if(!await launchUrl(url,mode:LaunchMode.externalApplication))
      throw StateError('Could not open terms');}
    catch(_){if(mounted)setState((){status='Terms could not be opened. Visit teyza.co.za/terms.html';failure=true;});}
  }
  @override
  void dispose() {
    widget.session.removeListener(_sessionChanged);
    email.dispose(); password.dispose(); name.dispose(); super.dispose();
  }
  // Legacy email/password is supported for SIGN IN only. New shoppers and
  // sellers create Firebase accounts through social identity providers.
  Future<void> submit() async {
    if(registering)return;
    if(status!=null||failure)setState(() {status=null;failure=false;});
    if(!formKey.currentState!.validate())return;
    setState(() {working=true;status=null;failure=false;});
    try {
      await widget.session.signIn(email.text,password.text);
      password.clear();
      if(ownerMode&&widget.session.idToken!=null)widget.session.useSellerWorkspace();
      if(!mounted)return;
      setState((){status='Welcome back to Teyza!';failure=false;});
      if(ownerMode&&widget.onOpenOwner!=null){
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if(mounted)widget.onOpenOwner!();
        });
      }else if(!ownerMode&&widget.onShopperSignedIn!=null){
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if(mounted)widget.onShopperSignedIn!();
        });
      }
    }catch(error){
      if(mounted)setState((){status=authMessage(error);failure=true;});
    }finally{if(mounted)setState(()=>working=false);}
  }
  Future<void> googleLogin() async {
    setState(() {working=true;status=null;failure=false;});
    try {
      await widget.session.signInWithGoogle();
      if(ownerMode&&widget.session.idToken!=null)widget.session.useSellerWorkspace();
      if(mounted)setState(() {
        status=widget.session.idToken!=null?'Welcome to Teyza!':'Google sign-in cancelled.';
        failure=false;
      });
      if(mounted&&ownerMode&&widget.session.idToken!=null&&widget.onOpenOwner!=null){
        WidgetsBinding.instance.addPostFrameCallback((_){
          if(mounted)widget.onOpenOwner!();
        });
      }else if(mounted&&!ownerMode&&widget.session.idToken!=null&&widget.onShopperSignedIn!=null){
        WidgetsBinding.instance.addPostFrameCallback((_){
          if(mounted)widget.onShopperSignedIn!();
        });
      }
    } catch(e) {
      if(mounted)setState(() {
        status=authMessage(e);failure=true;
      });
    } finally {if(mounted)setState(()=>working=false);}
  }

  Future<void> appleLogin() async {
    setState((){working=true;status=null;failure=false;});
    try{
      await widget.session.signInWithApple();
      if(ownerMode&&widget.session.idToken!=null)widget.session.useSellerWorkspace();
      if(!mounted)return;
      if(widget.session.idToken!=null){
        if(ownerMode){widget.onOpenOwner?.call();}else{widget.onShopperSignedIn?.call();}
      }else{setState(()=>status='Apple sign-in cancelled.');}
    }catch(error){if(mounted)setState((){status=authMessage(error);failure=true;});}
    finally{if(mounted)setState(()=>working=false);}
  }

  Future<void> facebookLogin() async {
    setState((){working=true;status=null;failure=false;});
    try {
      await widget.session.signInWithFacebook();
      if(ownerMode&&widget.session.idToken!=null)widget.session.useSellerWorkspace();
      if(!mounted)return;
      if(widget.session.idToken!=null){if(ownerMode){widget.onOpenOwner?.call();}else{widget.onShopperSignedIn?.call();}}
      else{setState(()=>status='Facebook sign-in cancelled.');}
    }catch(error){if(mounted)setState((){status=authMessage(error);failure=true;});}
    finally{if(mounted)setState(()=>working=false);}
  }

  Future<void> reset() async {
    if (!email.text.contains('@')) {
      setState(() {status='Enter your email above first.';failure=true;}); return;
    }
    setState(() {working=true;status=null;});
    try {
      await widget.session.resetPassword(email.text);
      if (mounted) setState(() {
        status='If the email is registered, a password reset message will arrive shortly.';
        failure=false;
      });
    } catch (error) {
      if (mounted) setState(() {status=authMessage(error);failure=true;});
    } finally {if(mounted)setState(()=>working=false);}
  }

  Widget accountRoleTile({required String value,required IconData icon,
    required String title,required String description}) => Material(
      color:Colors.white,
      borderRadius:BorderRadius.circular(22),
      child:InkWell(
        borderRadius:BorderRadius.circular(22),
        onTap:()=>setState(() {audience=value;registering=false;status=null;}),
        child:Padding(padding:const EdgeInsets.all(18),child:Row(children:[
          Container(width:58,height:58,
            decoration:BoxDecoration(
              color:value=='shopper'?const Color(0xFFE1F6EB):const Color(0xFFE8EFF4),
              borderRadius:BorderRadius.circular(17)),
            child:Icon(icon,color:value=='shopper'
              ?const Color(0xFF3BB77E):const Color(0xFF010F1C),size:29)),
          const SizedBox(width:16),
          Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text(title,style:const TextStyle(
              fontSize:17,fontWeight:FontWeight.w800,color:Color(0xFF010F1C))),
            const SizedBox(height:5),
            Text(description,style:const TextStyle(
              fontSize:12,height:1.35,color:Color(0xFF737C82)))
          ])),
          const Icon(Icons.chevron_right_rounded,color:Color(0xFF3BB77E))
        ]))),
    );

  Future<void> registerShopOwner() async {
    setState((){registering=true;status=null;});
  }

  @override
  Widget build(BuildContext context)=>AnimatedBuilder(
    animation:widget.session,
    builder:(context,child){
      final logged=widget.session.idToken!=null&&!widget.session.anonymousShopper;
      return ListView(padding:const EdgeInsets.fromLTRB(20,22,20,36),children:[
        Container(alignment:Alignment.center,padding:const EdgeInsets.symmetric(vertical:17),
          child:Column(children:[
            const CircleAvatar(radius:32,backgroundColor:Color(0xFFE0F3EA),
              child:Icon(Icons.person_rounded,size:38,color:Color(0xFF078E66))),
            const SizedBox(height:10),
            if(logged)const Text('My Teyza account',style:TextStyle(
              fontSize:13,fontWeight:FontWeight.w700,color:Color(0xFF078E66))),
            Text(logged?displayName:audience==null?'Welcome to Teyza':registering?'Join Teyza':ownerMode?'Shop owner sign in':'Shopper sign in',
              style:const TextStyle(fontSize:26,fontWeight:FontWeight.w900)),
            const SizedBox(height:6),
            Text(logged?'Your saved shopping profile' :
              audience==null?'How would you like to continue?':
              registering?
                'Create your account securely with Google, Facebook or Apple. No email password or separate email verification required. Shop owners complete SMS and document verification afterward.':
                ownerMode?'Sign in with the existing account registered for your shop.':'Sign in to manage your profile and shop enquiries.',
              textAlign:TextAlign.center,
              style:const TextStyle(color:Color(0xFF60746B))),
          ])),
        if(!widget.session.isReady)
          const Center(child:CircularProgressIndicator())
        else if(!logged && audience==null) ...[
          const SizedBox(height:16),
          accountRoleTile(value:'shopper',icon:Icons.shopping_basket_rounded,
            title:'Continue as Shopper',
            description:'Find nearby shops, browse products, chat and enquire.'),
          const SizedBox(height:13),
          accountRoleTile(value:'owner',icon:Icons.storefront_rounded,
            title:'Continue as Shop Owner',
            description:'Spaza shops, other retail and wholesale owners. Open your saved shop workspace.'),
          const SizedBox(height:18),
          const Text('You can browse nearby shops without an account.',
            textAlign:TextAlign.center,style:TextStyle(
              fontSize:12,color:Color(0xFF737C82))),
        ]
        else if(logged) ...[
          Container(padding:const EdgeInsets.all(20),decoration:BoxDecoration(color:const Color(0xFF010F1C),borderRadius:BorderRadius.circular(23)),
            child:const Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text('Your local shopping, made easy',style:TextStyle(color:Colors.white,fontSize:23,fontWeight:FontWeight.w800)),
              SizedBox(height:8),Text('Browse shops, message an owner, and choose delivery or collection.',style:TextStyle(color:Color(0xFFCAE9D9),height:1.4))])),
          const SizedBox(height:14),
          Wrap(spacing:8,runSpacing:8,children:[
            if(widget.onBrowse!=null)ActionChip(avatar:const Icon(Icons.storefront_outlined),label:const Text('Browse shops'),onPressed:widget.onBrowse),
            if(widget.onMessages!=null)ActionChip(avatar:const Icon(Icons.chat_bubble_outline),label:const Text('Live chat'),onPressed:widget.onMessages),
            if(widget.onOrders!=null)ActionChip(avatar:const Icon(Icons.receipt_long_outlined),label:const Text('My orders'),onPressed:widget.onOrders),
          ]),
          const SizedBox(height:14),
          Card(color:Colors.white,child:Column(children:[
            ListTile(leading:const Icon(Icons.badge_outlined),
              title:const Text('Display name'),subtitle:Text(displayName),
              trailing:const Icon(Icons.edit_outlined),onTap:widget.onChangeDeliveryAddress),
            const Divider(height:1),
            ListTile(leading:const Icon(Icons.phone_outlined),
              title:const Text('Phone number'),subtitle:Text(displayPhone),
              trailing:const Icon(Icons.edit_outlined),onTap:widget.onChangeDeliveryAddress),
            const Divider(height:1),
            ListTile(leading:const Icon(Icons.email_outlined),
              title:const Text('Email'),subtitle:Text(contactEmail),
              trailing:const Icon(Icons.edit_outlined),onTap:widget.onChangeDeliveryAddress),
            ListTile(
              leading:Icon(contactEmailVerified?
                Icons.verified_user:Icons.mark_email_unread_outlined,
                color:contactEmailVerified?const Color(0xFF078E66):Colors.orange),
              title:Text(contactEmailVerified?'Email verified':'Email not verified'),
              subtitle:Text(contactEmailVerified?'This contact email matches your verified Teyza identity.':
                widget.session.emailVerified?
                  'Your signed-in identity is verified, but its email differs from your saved contact email.':
                  'Link Google or Apple to verify your identity, or confirm your email using a verification link.'),
            ),
            if(widget.session.emailVerified&&!contactEmailVerified&&widget.session.email!=null)
              ListTile(leading:const Icon(Icons.account_circle_outlined),
                title:const Text('Verified sign-in email'),
                subtitle:Text(widget.session.email!)),
            if(widget.session.phoneVerified)
              ListTile(leading:const Icon(Icons.verified_outlined,color:Color(0xFF078E66)),
                title:const Text('Mobile number verified'),subtitle:Text(widget.session.phoneNumber??'')),
            if(!contactEmailVerified)...[
              if(widget.session.googleSignInAvailable&&!widget.session.googleProviderLinked)
                OutlinedButton.icon(onPressed:working?null:()=>verifyWithProvider(false),
                  icon:const Icon(Icons.account_circle_outlined),
                  label:const Text('Verify with Google')),
              if(widget.session.appleSignInAvailable&&!widget.session.appleProviderLinked)
                OutlinedButton.icon(onPressed:working?null:()=>verifyWithProvider(true),
                  icon:const Icon(Icons.apple),
                  label:const Text('Verify with Apple')),
              if(widget.session.email!=null&&!widget.session.emailVerified)
                ...[
              FilledButton.icon(
                onPressed:working?null:() async {
                  setState(() {working=true;status=null;failure=false;});
                  try {
                    await widget.session.sendEmailVerification();
                    if(mounted)setState(() {
                      status='Verification link sent. Check your inbox, then tap Check verification.';
                      failure=false;
                    });
                  } catch(e) {
                    if(mounted)setState(() {status=authMessage(e);failure=true;});
                  } finally { if(mounted)setState(()=>working=false); }
                },
                icon:const Icon(Icons.mark_email_read_outlined),
                label:const Text('Send verification email')),
              TextButton.icon(
                onPressed:working?null:() async {
                  setState(() {working=true;status=null;failure=false;});
                  try{
                    await widget.session.refreshEmailStatus();
                    if(mounted)setState(() {
                      status=widget.session.emailVerified?
                        'Your email has been verified.':'Not verified yet. Open the email link first.';
                      failure=!widget.session.emailVerified;
                    });
                  }catch(error){
                    if(mounted)setState((){status=authMessage(error);failure=true;});
                  }finally{if(mounted)setState(()=>working=false);}
                },
                icon:const Icon(Icons.refresh),
                label:const Text('Check verification status')),
              ],
            ],
            const Divider(height:1),
            ListTile(leading:const Icon(Icons.location_on_outlined),
              title:const Text('Saved delivery address'),
              subtitle:Text(shopperProfile?.address??widget.savedDeliveryAddress??'Add your delivery address'),
              trailing:const Icon(Icons.edit_location_alt_outlined),
              onTap:widget.onChangeDeliveryAddress),
            const Divider(height:1),
            ListTile(leading:const Icon(Icons.shopping_bag_outlined),
              title:const Text('Delivery & collection orders'),onTap:widget.onOrders,
              subtitle:const Text('View shop confirmations and fulfilment status.')),
            const Divider(height:1),
            ListTile(leading:const Icon(Icons.payments_outlined),
              title:const Text('Payment method'),
              subtitle:Text(ShopperPaymentPreferenceStore.label(paymentPreference)),
              trailing:const Icon(Icons.edit_outlined),
              onTap:working?null:changePaymentMethod),
            const Divider(height:1),
            ListTile(leading:const Icon(Icons.description_outlined),
              title:const Text('Terms of Service'),
              subtitle:const Text('Review Teyza shopping and account terms'),
              trailing:const Icon(Icons.open_in_new_outlined),onTap:openTerms)
          ])),
          const SizedBox(height:16),
          if(widget.session.hasAdminClaim&&widget.session.emailVerified)
            OutlinedButton.icon(onPressed:()=>Navigator.push(context,MaterialPageRoute(builder:(_)=>SellerReviewPage(session:widget.session))),
              icon:const Icon(Icons.admin_panel_settings_outlined),label:const Text('Seller review desk')),
          if(widget.session.hasAdminClaim&&widget.session.emailVerified)
            OutlinedButton.icon(onPressed:()=>Navigator.push(context,
              MaterialPageRoute(builder:(_)=>ChatModerationPage(session:widget.session))),
              icon:const Icon(Icons.flag_outlined),label:const Text('Chat moderation reports')),
          OutlinedButton.icon(
            onPressed:working?null:()=>Navigator.push(context,
              MaterialPageRoute(builder:(_)=>TeyzaDeleteAccountPage(session:widget.session))),
            icon:const Icon(Icons.delete_outline,color:Colors.red),
            label:const Text('Privacy & Security · Delete My Account')),
          const SizedBox(height:10),
          OutlinedButton.icon(onPressed:working?null:widget.session.signOut,
            icon:const Icon(Icons.logout),label:const Text('Sign out')),
        ] else ...[
          Align(alignment:Alignment.centerLeft,child:TextButton.icon(
            onPressed:working?null:()=>setState(() {
              audience=null;registering=false;status=null;
            }),icon:const Icon(Icons.arrow_back_rounded,size:18),
            label:const Text('Change account type'))),
          const SizedBox(height:12),
          Form(key:formKey,child:Column(children:[
            if(!registering)...[
            TextFormField(controller:email,keyboardType:TextInputType.emailAddress,
              autofillHints:const [AutofillHints.email],
              decoration:const InputDecoration(labelText:'Email address',
                prefixIcon:Icon(Icons.email_outlined),border:OutlineInputBorder()),
              validator:(v)=>v==null||!v.trim().contains('@')?'Enter a valid email':null),
            const SizedBox(height:12),
            TextFormField(controller:password,obscureText:hidden,
              autofillHints:const [AutofillHints.password],
              decoration:InputDecoration(labelText:'Password',
                prefixIcon:const Icon(Icons.lock_outline),border:const OutlineInputBorder(),
                suffixIcon:IconButton(onPressed:()=>setState(()=>hidden=!hidden),
                  icon:Icon(hidden?Icons.visibility_outlined:Icons.visibility_off_outlined))),
              validator:(v)=>v==null||v.length<6?'Use at least 6 characters':null),
            const SizedBox(height:18),
            SizedBox(width:double.infinity,child:FilledButton(
              onPressed:working?null:submit,
              style:FilledButton.styleFrom(padding:const EdgeInsets.all(16)),
              child:Text(working?'Please wait…':ownerMode?'Sign in as shop owner':'Sign in as shopper'))),
            const SizedBox(height:10),
            const Text('Existing email account? Use your email and password above.',
              style:TextStyle(fontSize:12,color:Color(0xFF60746B))),
            ],
            if(widget.session.googleSignInAvailable)...[
            const SizedBox(height:12),
            SizedBox(width:double.infinity,child:OutlinedButton.icon(
              onPressed:working?null:googleLogin,
              icon:const Icon(Icons.account_circle_outlined),
              label:const Text('Continue with Google'))),
            ],
            if(widget.session.appleSignInAvailable)...[
              const SizedBox(height:12),SizedBox(width:double.infinity,child:FilledButton.icon(
                style:FilledButton.styleFrom(backgroundColor:Colors.black,foregroundColor:Colors.white),
                onPressed:working?null:appleLogin,icon:const Icon(Icons.apple),label:const Text('Continue with Apple'))),
            ],
            if(widget.session.facebookSignInAvailable)...[
              const SizedBox(height:12),SizedBox(width:double.infinity,child:OutlinedButton.icon(
                onPressed:working?null:facebookLogin,icon:const Icon(Icons.facebook),label:const Text('Continue with Facebook'))),
            ],
            const SizedBox(height:7),
            if(registering)const Padding(padding:EdgeInsets.only(top:12),
              child:Text('Choose a provider above. Your name and phone can be saved after sign-in; a separate email confirmation is not required.',
                textAlign:TextAlign.center,style:TextStyle(color:Color(0xFF60746B),fontSize:12))),
            if(ownerMode&&!registering)
              TextButton.icon(onPressed:working?null:registerShopOwner,
                icon:const Icon(Icons.add_business_outlined,size:17),
                label:const Text('New shop owner? Register your shop'))
            else TextButton(onPressed:working?null:()=>setState(() {
              registering=!registering;status=null;
            }),child:Text(registering?'Already registered? Sign in with email':
              'New to Teyza? Register with Google, Facebook or Apple')),
            if(!registering)
              TextButton(onPressed:working?null:reset,
                child:const Text('Forgot password?')),
          ])),
        ],
        // Never display a failed provider login from a previous attempt after
        // another method has successfully authenticated the Firebase user.
        if(status!=null && !(logged && failure))Padding(padding:const EdgeInsets.only(top:12),
          child:Card(color:failure?const Color(0xFFFFEDE8):const Color(0xFFE3F5EC),
            child:Padding(padding:const EdgeInsets.all(13),child:Text(status!,
              style:TextStyle(color:failure?Colors.red.shade900:const Color(0xFF087D5E)))))) ,
        const SizedBox(height:20),
        const Text('Your account is private. Location is optional; '
          'the app only uses it to find shops in your area.',
          textAlign:TextAlign.center,style:TextStyle(color:Color(0xFF657B72),fontSize:12))
      ]);
    });
}
