import 'dart:io';
import 'dart:typed_data';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'shopper_auth.dart';

abstract class SelfieCamera {
  Future<void> initialize();
  Widget preview();
  Future<Uint8List> capture();
  Future<void> dispose();
}

// The selfie stays in the app. Some external Android camera apps ignore the
// image picker's preferred front lens and cannot return a reliable result.
class DeviceSelfieCamera implements SelfieCamera {
  CameraController? _controller;
  @override Future<void> initialize() async {
    final cameras=await availableCameras();
    final front=cameras.where((c)=>c.lensDirection==CameraLensDirection.front);
    if(front.isEmpty)throw StateError('This device has no front camera. Please use a phone with a front camera.');
    final controller=CameraController(front.first,ResolutionPreset.high,enableAudio:false);
    _controller=controller;
    await controller.initialize();
  }
  @override Widget preview()=>CameraPreview(_controller!);
  @override Future<Uint8List> capture() async {
    final controller=_controller;
    if(controller==null||!controller.value.isInitialized)throw StateError('Open the camera again.');
    final file=await controller.takePicture();
    try {
      final bytes=await file.readAsBytes();
      if(bytes.isEmpty||bytes.length>2000000)throw StateError('Please retake a clear selfie smaller than 2 MB.');
      return bytes;
    } finally {
      try{await File(file.path).delete();}catch(_){/* The OS also manages the camera cache. */}
    }
  }
  @override Future<void> dispose() async {
    final controller=_controller;_controller=null;
    await controller?.dispose();
  }
}

String selfieCameraError(Object error){
  if(error is CameraException&&['CameraAccessDenied','CameraAccessDeniedWithoutPrompt','CameraAccessRestricted'].contains(error.code)){
    return 'Allow camera access for Teyza in your phone settings, then try again.';
  }
  if(error is StateError)return error.message.toString();
  return 'The selfie camera could not open. Close other camera apps and try again.';
}

class SellerSelfieCameraPage extends StatefulWidget {
  final ShopperSession session;
  final SelfieCamera Function()? cameraFactory;
  const SellerSelfieCameraPage({super.key,required this.session,this.cameraFactory});
  @override State<SellerSelfieCameraPage> createState()=>_SelfieCameraState();
}

class _SelfieCameraState extends State<SellerSelfieCameraPage> with WidgetsBindingObserver {
  late final String? uid;
  SelfieCamera? _camera;
  Uint8List? _photo;
  Future<void> _work=Future<void>.value();
  int _generation=0;
  bool _active=true,_ready=false,_opening=false,_capturing=false,_changed=false;
  String? _error;

  @override void initState(){
    super.initState();uid=widget.session.userId;
    widget.session.addListener(accountChanged);WidgetsBinding.instance.addObserver(this);
    _active=WidgetsBinding.instance.lifecycleState==null||WidgetsBinding.instance.lifecycleState==AppLifecycleState.resumed;
    if(uid!=null&&_active){open();}else if(uid==null){_changed=true;_error='Sign in again before taking your selfie.';}
  }
  bool current(int generation)=>mounted&&_active&&!_changed&&generation==_generation&&uid==widget.session.userId;
  void enqueue(Future<void> Function() action){
    _work=_work.catchError((Object _){}).then((_)=>action());
  }
  Future<void> release() async {
    final camera=_camera;_camera=null;
    try{await camera?.dispose();}catch(_){/* A closed camera must not block navigation. */}
  }
  void accountChanged(){
    if(!mounted||uid==widget.session.userId)return;
    _changed=true;_photo=null;
    close();
    setState(()=>_error='Your account changed. Close this page and sign in again.');
  }
  void close(){
    _generation++;
    if(mounted)setState((){_ready=false;_opening=false;_capturing=false;});
    enqueue(release);
  }
  void open(){
    if(!mounted||!_active||_changed)return;
    final generation=++_generation;
    setState((){_error=null;_ready=false;_opening=true;_capturing=false;});
    enqueue(() async {
      await release();
      if(!current(generation))return;
      final camera=widget.cameraFactory?.call()??DeviceSelfieCamera();
      _camera=camera;var keep=false;
      try{
        await camera.initialize();
        if(current(generation)){keep=true;setState((){_ready=true;_opening=false;});}
      }catch(error){if(current(generation))setState((){_error=selfieCameraError(error);_opening=false;});}
      finally{if(!keep)await release();}
    });
  }
  void takePhoto(){
    final camera=_camera;
    if(!_ready||_capturing||camera==null||_changed)return;
    final generation=_generation;
    setState((){_capturing=true;_error=null;});
    enqueue(() async {
      if(!current(generation))return;
      try{
        final bytes=await camera.capture();
        if(bytes.isEmpty||bytes.length>2000000)throw StateError('Please retake a clear selfie smaller than 2 MB.');
        if(current(generation)){setState((){_photo=bytes;_ready=false;});await release();}
      }catch(error){if(current(generation))setState(()=>_error=selfieCameraError(error));}
      finally{if(current(generation))setState(()=>_capturing=false);}
    });
  }
  @override void didChangeAppLifecycleState(AppLifecycleState state){
    if(state==AppLifecycleState.resumed){
      _active=true;if(_photo==null&&!_changed)open();
    }else if(state==AppLifecycleState.inactive||state==AppLifecycleState.paused||state==AppLifecycleState.detached){
      _active=false;close();
    }
  }
  @override void dispose(){
    _generation++;_photo=null;
    WidgetsBinding.instance.removeObserver(this);widget.session.removeListener(accountChanged);
    enqueue(release);super.dispose();
  }
  @override Widget build(BuildContext context)=>Scaffold(
    backgroundColor:const Color(0xFF010F1C),
    appBar:AppBar(backgroundColor:const Color(0xFF010F1C),foregroundColor:Colors.white,title:const Text('Owner selfie')),
    body:LayoutBuilder(builder:(context,constraints)=>SafeArea(child:ListView(padding:const EdgeInsets.fromLTRB(24,12,24,28),children:[
      const Text('A clear photo of you',style:TextStyle(color:Colors.white,fontSize:28,fontWeight:FontWeight.w800)),
      const SizedBox(height:10),Text(_photo==null?'Face the front camera in good light. Keep your whole face inside the guide.':'Check your photo. Your face should be clear and fully visible.',
        style:const TextStyle(color:Color(0xFFCBD8D2),height:1.5)),
      const SizedBox(height:22),
      ClipRRect(borderRadius:BorderRadius.circular(28),child:SizedBox(height:(constraints.maxHeight*0.52).clamp(220.0,450.0),
        child:ColoredBox(color:const Color(0xFF152B33),child:Stack(fit:StackFit.expand,children:[
          if(_photo!=null)Image.memory(_photo!,fit:BoxFit.contain)
          else if(_ready&&_camera!=null)Center(child:_camera!.preview())
          else Center(child:_opening?const CircularProgressIndicator(color:Color(0xFF3BB77E)):
            const Icon(Icons.face_retouching_natural,size:72,color:Colors.white54)),
          if(_ready&&_photo==null)Padding(padding:const EdgeInsets.symmetric(horizontal:32,vertical:55),child:DecoratedBox(
            decoration:BoxDecoration(borderRadius:BorderRadius.circular(140),border:Border.all(color:Colors.white70,width:2)))),
          Positioned(left:16,top:16,child:Container(padding:const EdgeInsets.symmetric(horizontal:12,vertical:7),
            decoration:BoxDecoration(color:const Color(0xCC010F1C),borderRadius:BorderRadius.circular(20)),
            child:const Text('FRONT CAMERA · PRIVATE',style:TextStyle(color:Colors.white,fontSize:10,letterSpacing:1)))),
        ])))),
      const SizedBox(height:18),if(_error!=null)Padding(padding:const EdgeInsets.only(bottom:16),
        child:Text(_error!,style:const TextStyle(color:Color(0xFFFFD2B8),height:1.4))),
      if(_photo!=null)...[
        FilledButton.icon(onPressed:_changed?null:(){if(uid==widget.session.userId)Navigator.pop(context,_photo);},
          icon:const Icon(Icons.check_rounded),label:const Text('Use this selfie')),
        TextButton(onPressed:_changed?null:(){setState(()=>_photo=null);open();},
          child:const Text('Retake selfie',style:TextStyle(color:Colors.white))),
      ]else if(_ready)FilledButton.icon(onPressed:_capturing||_changed?null:takePhoto,
        icon:const Icon(Icons.camera_alt_outlined),label:Text(_capturing?'Taking photo…':'Take selfie'))
      else if(!_opening&&!_changed)FilledButton.icon(onPressed:open,icon:const Icon(Icons.refresh_rounded),label:const Text('Try camera again')),
      const SizedBox(height:12),const Text('You choose when to submit. Only authorised Teyza reviewers can view your submitted photo.',
        textAlign:TextAlign.center,style:TextStyle(color:Color(0xFFADBCB5),fontSize:12,height:1.5)),
    ]))));
}
