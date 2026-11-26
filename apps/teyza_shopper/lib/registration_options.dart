import 'package:flutter/material.dart';
import 'business_categories.dart';

/// Registration preferences only. Existing account records decide access.
class TeyzaRegistrationOptions extends StatefulWidget {
  final void Function(String role, String? category) onSelected;
  final ValueChanged<String>? onBusinessTypeSelected;
  const TeyzaRegistrationOptions({super.key, required this.onSelected,
    this.onBusinessTypeSelected});
  @override
  State<TeyzaRegistrationOptions> createState() => _RegistrationOptionsState();
}

class _RegistrationOptionsState extends State<TeyzaRegistrationOptions> {
  bool seller = false;
  String search = '',filter='all',group='all';
  void selectBusiness(TeyzaBusinessType type){
    widget.onBusinessTypeSelected?.call(type.id);
    widget.onSelected('seller',type.accountCategory);
  }
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(seller ? 'Choose your business type' : 'Join Teyza as',
        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
      const SizedBox(height: 16),
      if (!seller) ...[
        option('shopper', Icons.shopping_basket_outlined, 'Shopper',
          'Find nearby shops, browse products and place orders.',
          () => widget.onSelected('shopper', null)),
        option('seller', Icons.storefront_outlined, 'Business owner',
          'Spaza shops, manufacturers, product sellers, food outlets and service businesses.',
          () => setState(() => seller = true)),
      ] else ...[
        const Text('Choose Shops or Businesses, then the category that best describes what you offer.',
          style:TextStyle(color:Color(0xFF547363),height:1.4)),
        const SizedBox(height:12),
        TextField(key:const ValueKey('teyza-business-type-search'),
          onChanged:(value)=>setState(()=>search=value.trim().toLowerCase()),
          decoration:const InputDecoration(
            prefixIcon:Icon(Icons.search),hintText:'Search manufacturers, spaza, salon, products…',
            border:OutlineInputBorder())),
        const SizedBox(height:10),
        Wrap(spacing:7,runSpacing:7,children:[
          for(final item in [('all','All'),('shops','Shops'),('businesses','Businesses')])
            ChoiceChip(label:Text(item.$2),selected:filter==item.$1,
              onSelected:(_)=>setState(() {filter=item.$1;group='all';})),
        ]),
        if(filter!='shops') Wrap(spacing:7,runSpacing:7,children:[
          for(final item in teyzaDiscoveryCategories.where((c)=>c.id!='spaza'))
            ChoiceChip(label:Text(item.label),selected:group==item.id,
              onSelected:(_)=>setState(() {group=item.id;if(group!='all')filter='businesses';})),
        ]),
        const SizedBox(height:13),
        for(final type in teyzaBusinessTypes.where((type)=>
          (filter=='all'||(filter=='shops'?type.discoveryGroup=='spaza':type.discoveryGroup!='spaza'))&&
          (group=='all'||type.discoveryGroup==group)&&
          (search.isEmpty||[type.label,teyzaDiscoveryCategoryLabel(type.discoveryGroup),
            teyzaDiscoveryCategoryLabel(type.discoverySubcategory)].join(' ').toLowerCase().contains(search))))
          option('business-'+type.id,
            type.accountCategory=='wholesale'?Icons.inventory_2_outlined:
            type.accountCategory=='retail'?Icons.handyman_outlined:
            Icons.storefront_outlined,
            type.label,
            teyzaDiscoveryCategoryLabel(type.discoveryGroup)+' · '+
              teyzaDiscoveryCategoryLabel(type.discoverySubcategory),
            ()=>selectBusiness(type)),
        TextButton.icon(onPressed:()=>setState(() {seller=false;search='';filter='all';group='all';}),
          icon:const Icon(Icons.arrow_back),label:const Text('Back to Shopper / Business owner')),
      ],
    ]);

  Widget option(String id, IconData icon, String title, String description,
    VoidCallback onTap) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        child: ListTile(key: ValueKey('registration-$id'),
          contentPadding: const EdgeInsets.all(16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          leading: CircleAvatar(backgroundColor: id == 'wholesale'
            ? const Color(0xFFFFEBD2) : const Color(0xFFE1F6EB),
            child: Icon(icon, color: const Color(0xFF078E66))),
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
          subtitle: Text(description),
          trailing: const Icon(Icons.chevron_right, color: Color(0xFF3BB77E)),
          onTap: onTap)));
}
