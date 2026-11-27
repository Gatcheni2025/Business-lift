Uri? shopDirectionsUri({required String name,String address='',String area='',double? latitude,double? longitude}) {
  final hasPin=latitude!=null&&longitude!=null&&latitude.isFinite&&longitude.isFinite&&latitude.abs()<=90&&longitude.abs()<=180&&!(latitude==0&&longitude==0);
  final destination=hasPin?'$latitude,$longitude':address.trim().isNotEmpty?address.trim():[name.trim(),area.trim()].where((s)=>s.isNotEmpty).join(', ');
  if(destination.isEmpty)return null;
  return Uri.https('www.google.com','/maps/dir/',{'api':'1','destination':destination});
}
