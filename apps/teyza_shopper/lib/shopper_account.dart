import 'package:flutter/material.dart';
import 'shopper_auth.dart';

class ShopperAccountPanel extends StatefulWidget {
  final ShopperSession session;
  const ShopperAccountPanel({super.key, required this.session});
  @override
  State<ShopperAccountPanel> createState()=>_AccountState();
}
class _AccountState extends State<ShopperAccountPanel> {
  final formKey=GlobalKey<FormState>();
  final email=TextEditingController(), password=TextEditingController(), name=TextEditingController();
  bool registering=false, working=false, hidden=true;
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
      if (mounted) setState(() {status='Welcome to Teyza!';failure=false;});
    } catch (error) {
      if (mounted) setState(() {status=authMessage(error);failure=true;});
    } finally { if (mounted) setState(() => working=false); }
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
  @override
  Widget build(BuildContext context)=>AnimatedBuilder(
    animation:widget.session,
    builder:(context,child){
      final logged=widget.session.idToken!=null;
      return ListView(padding:const EdgeInsets.all(22),children:[
        Container(alignment:Alignment.center,padding:const EdgeInsets.symmetric(vertical:23),
          child:Column(children:[
            const CircleAvatar(radius:32,backgroundColor:Color(0xFFE0F3EA),
              child:Icon(Icons.person_rounded,size:38,color:Color(0xFF078E66))),
            const SizedBox(height:10),
            Text(logged?'My Teyza account':registering?'Join Teyza Shopper':'Welcome back',
              style:const TextStyle(fontSize:26,fontWeight:FontWeight.w900)),
            const SizedBox(height:6),
            Text(logged?(widget.session.name?.isNotEmpty==true?
              widget.session.name!:widget.session.email??'') :
              'Discover spaza shops without signing in. Create an account for your profile.',
              textAlign:TextAlign.center,
              style:const TextStyle(color:Color(0xFF60746B))),
          ])),
        if(!widget.session.isReady)
          const Center(child:CircularProgressIndicator())
        else if(logged) ...[
          Card(color:Colors.white,child:Column(children:[
            ListTile(leading:const Icon(Icons.email_outlined),
              title:const Text('Email'),subtitle:Text(widget.session.email??'')),
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
          OutlinedButton.icon(onPressed:working?null:widget.session.signOut,
            icon:const Icon(Icons.logout),label:const Text('Sign out')),
        ] else ...[
          Form(key:formKey,child:Column(children:[
            if(registering)...[
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
              child:Text(working?'Please wait…':registering?'Create shopper account':'Log in'))),
            const SizedBox(height:7),
            TextButton(onPressed:working?null:()=>setState(() {
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
