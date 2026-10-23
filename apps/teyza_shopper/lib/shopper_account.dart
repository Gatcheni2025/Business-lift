import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'shopper_auth.dart';

class ShopperAccountPanel extends StatefulWidget {
  final ShopperSession session;
  final VoidCallback? onOpenOwner;
  final VoidCallback? onShopperSignedIn;
  const ShopperAccountPanel({super.key,required this.session,this.onOpenOwner,this.onShopperSignedIn});
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
  @override
  void dispose() { email.dispose(); password.dispose(); name.dispose(); super.dispose(); }
  Future<void> submit() async {
    if (!formKey.currentState!.validate()) return;
    setState(() { working=true; status=null; });
    try {
      if (registering) {
        await widget.session.register(name.text,email.text,password.text);
      } else {
        await widget.session.signIn(email.text,password.text);
      }
      password.clear();
      if (registering) {
        try {
          await widget.session.sendEmailVerification();
          if (mounted) setState(() {
            status='Account created. Check your inbox for the verification link.';
            failure=false;
          });
        } catch (_) {
          if (mounted) setState(() {
            status='Account created. Use the verification button below to request a link.';
            failure=false;
          });
        }
      } else if (mounted) {
        setState(() {status='Welcome to Teyza!';failure=false;});
        if(ownerMode && widget.onOpenOwner!=null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if(mounted)widget.onOpenOwner!();
          });
        }else if(!ownerMode&&widget.onShopperSignedIn!=null){
          WidgetsBinding.instance.addPostFrameCallback((_){
            if(mounted)widget.onShopperSignedIn!();
          });
        }
      }
    } catch (error) {
      if (mounted) setState(() {status=authMessage(error);failure=true;});
    } finally { if (mounted) setState(() => working=false); }
  }
  Future<void> googleLogin() async {
    setState(() {working=true;status=null;failure=false;});
    try {
      await widget.session.signInWithGoogle();
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
    final uri=Uri.parse('https://teyza.co.za/?auth=register');
    await launchUrl(uri,mode:LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context)=>AnimatedBuilder(
    animation:widget.session,
    builder:(context,child){
      final logged=widget.session.idToken!=null;
      return ListView(padding:const EdgeInsets.fromLTRB(20,22,20,36),children:[
        Container(alignment:Alignment.center,padding:const EdgeInsets.symmetric(vertical:17),
          child:Column(children:[
            const CircleAvatar(radius:32,backgroundColor:Color(0xFFE0F3EA),
              child:Icon(Icons.person_rounded,size:38,color:Color(0xFF078E66))),
            const SizedBox(height:10),
            Text(logged?'My Teyza account':audience==null?'Welcome to Teyza':ownerMode?'Shop owner sign in':registering?'Join Teyza':'Shopper sign in',
              style:const TextStyle(fontSize:26,fontWeight:FontWeight.w900)),
            const SizedBox(height:6),
            Text(logged?(widget.session.name?.isNotEmpty==true?
              widget.session.name!:widget.session.email??'') :
              audience==null?'How would you like to continue?':
              ownerMode?'Sign in with the account registered for your shop.' :
              'Sign in to manage your profile and shop enquiries.',
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
            description:'Sign in to your merchant workspace and manage your shop.'),
          const SizedBox(height:18),
          const Text('You can browse nearby shops without an account.',
            textAlign:TextAlign.center,style:TextStyle(
              fontSize:12,color:Color(0xFF737C82))),
        ]
        else if(logged) ...[
          Card(color:Colors.white,child:Column(children:[
            ListTile(leading:const Icon(Icons.email_outlined),
              title:const Text('Email'),subtitle:Text(widget.session.email??'')),
            const Divider(height:1),
            ListTile(
              leading:Icon(widget.session.emailVerified?
                Icons.verified_user:Icons.mark_email_unread_outlined,
                color:widget.session.emailVerified?const Color(0xFF078E66):null),
              title:Text(widget.session.emailVerified?'Email verified':'Verify your email'),
              subtitle:Text(widget.session.emailVerified?
                'Your shopper email has been confirmed.' :
                'Required before sending a real order enquiry.'),
            ),
            if (!widget.session.emailVerified) ...[
              FilledButton.icon(
                onPressed:working?null:() async {
                  setState(() {working=true;status=null;});
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
                  setState(()=>working=true);
                  await widget.session.refreshEmailStatus();
                  if(mounted)setState(() {
                    working=false;
                    status=widget.session.emailVerified?
                      'Your email has been verified.':'Not verified yet. Open the email link first.';
                    failure=!widget.session.emailVerified;
                  });
                },
                icon:const Icon(Icons.refresh),
                label:const Text('Check verification status')),
            ],
            const Divider(height:1),
            const ListTile(leading:Icon(Icons.location_on_outlined),
              title:Text('Your shopping area'),
              subtitle:Text('Use the location selector on the Home tab.')),
            const Divider(height:1),
            const ListTile(leading:Icon(Icons.shopping_bag_outlined),
              title:Text('Orders'),
              subtitle:Text('Shopping enquiries and orders will appear here as this service goes live.'))
          ])),
          const SizedBox(height:16),
          if(widget.onOpenOwner!=null)
            FilledButton.icon(onPressed:widget.onOpenOwner,
              icon:const Icon(Icons.storefront_outlined),
              label:const Text('Open shop owner workspace')),
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
            if(registering && !ownerMode)...[
              TextFormField(controller:name,textCapitalization:TextCapitalization.words,
                decoration:const InputDecoration(labelText:'Full name',prefixIcon:Icon(Icons.badge_outlined),
                  border:OutlineInputBorder()),
                validator:(v)=>v==null||v.trim().isEmpty?'Enter your name':null),
              const SizedBox(height:12)
            ],
            TextFormField(controller:email,keyboardType:TextInputType.emailAddress,
              autofillHints:const [AutofillHints.email],
              decoration:const InputDecoration(labelText:'Email address',
                prefixIcon:Icon(Icons.email_outlined),border:OutlineInputBorder()),
              validator:(v)=>v==null||!v.trim().contains('@')?'Enter a valid email':null),
            const SizedBox(height:12),
            TextFormField(controller:password,obscureText:hidden,
              autofillHints:[registering?AutofillHints.newPassword:AutofillHints.password],
              decoration:InputDecoration(labelText:'Password',
                prefixIcon:const Icon(Icons.lock_outline),border:const OutlineInputBorder(),
                suffixIcon:IconButton(onPressed:()=>setState(()=>hidden=!hidden),
                  icon:Icon(hidden?Icons.visibility_outlined:Icons.visibility_off_outlined))),
              validator:(v)=>v==null||v.length<6?'Use at least 6 characters':null),
            const SizedBox(height:18),
            SizedBox(width:double.infinity,child:FilledButton(
              onPressed:working?null:submit,
              style:FilledButton.styleFrom(padding:const EdgeInsets.all(16)),
              child:Text(working?'Please wait…':registering?'Create shopper account':
                ownerMode?'Sign in as shop owner':'Sign in as shopper'))),
            const SizedBox(height:12),
            SizedBox(width:double.infinity,child:OutlinedButton.icon(
              onPressed:working?null:googleLogin,
              icon:const Icon(Icons.account_circle_outlined),
              label:const Text('Continue with Google'))),
            const SizedBox(height:7),
            if(ownerMode)
              TextButton.icon(onPressed:working?null:registerShopOwner,
                icon:const Icon(Icons.open_in_new_rounded,size:17),
                label:const Text('New shop owner? Register your shop'))
            else TextButton(onPressed:working?null:()=>setState(() {
              registering=!registering;status=null;
            }),child:Text(registering?'Already registered? Sign in':
              'New to Teyza? Create an account')),
            if(!registering)
              TextButton(onPressed:working?null:reset,
                child:const Text('Forgot password?')),
          ])),
        ],
        if(status!=null)Padding(padding:const EdgeInsets.only(top:12),
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
