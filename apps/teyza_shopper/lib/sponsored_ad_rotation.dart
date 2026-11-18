// Home-screen sponsored placements are fed by the trusted, location-filtered
// teyzaMobile featuredAds API. Never use private drafts or unverified billing.
const Duration teyzaHomeAdRotationInterval=Duration(minutes:3);

bool teyzaHomeAdEligible(Map<String,dynamic> ad,DateTime now){
 final id=ad['id'],shopId=ad['shopId'],endsAt=ad['endsAt'],imageUrl=ad['imageUrl'];
 if(ad['sponsored']!=true||
   id is! String||id.isEmpty||shopId is! String||shopId.isEmpty||
   endsAt is! num||!endsAt.isFinite||endsAt.toDouble()<=now.millisecondsSinceEpoch||
   ad['title'] is! String||(ad['title'] as String).trim().isEmpty||
   imageUrl is! String)return false;
 final uri=Uri.tryParse(imageUrl);
 return uri!=null&&uri.scheme=='https'&&
  uri.host=='us-central1-business-lift-3c19c.cloudfunctions.net'&&
  uri.path=='/teyzaMobile'&&
  uri.queryParameters['shopperAdPhoto']==id;
}

List<Map<String,dynamic>> teyzaHomeEligibleAds(
 List<Map<String,dynamic>> ads,DateTime now
)=>ads.where((ad)=>teyzaHomeAdEligible(ad,now)).take(8).toList(growable:false);

int teyzaNextHomeAdIndex(int current,int count){
 if(count<=1)return 0;
 return (current+1)%count;
}
