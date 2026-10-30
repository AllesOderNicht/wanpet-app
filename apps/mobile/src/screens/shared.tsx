import React, {createContext, useContext, useEffect, useRef, useState, type PropsWithChildren, type ReactNode} from 'react';
import {AccessibilityInfo, findNodeHandle, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType, type StyleProp, type TextStyle} from 'react-native';

export const colors = {paper:'#fff7e9', ink:'#594735', muted:'#79654f', accent:'#65734e', green:'#65734e', selected:'#eeefdc', line:'#deceb5', disabled:'#dfdfcd'};
export const titleFont = 'LXGWWenKai-Regular';
const icons = {
  close:require('../../../../assets/ui/morning/icons/close.png'), check:require('../../../../assets/ui/morning/icons/check.png'),
  arrow:require('../../../../assets/ui/morning/icons/arrow.png'), home:require('../../../../assets/ui/morning/icons/home.png'),
  bag:require('../../../../assets/ui/morning/icons/bag.png'), book:require('../../../../assets/ui/morning/icons/book.png'),
  leaf:require('../../../../assets/ui/morning/icons/leaf.png'), tree:require('../../../../assets/ui/morning/icons/tree.png'),
  mail:require('../../../../assets/ui/morning/icons/mail.png'), settings:require('../../../../assets/ui/morning/icons/settings.png'),
  heart:require('../../../../assets/ui/morning/icons/heart.png'), paw:require('../../../../assets/ui/morning/icons/paw.png'),
  person:require('../../../../assets/ui/morning/icons/person.png'), sun:require('../../../../assets/ui/morning/icons/sun.png'),
  cat:require('../../../../assets/ui/morning/icons/cat.png'), refresh:require('../../../../assets/ui/morning/icons/refresh.png'),
};
export type IconName = keyof typeof icons;
export function Icon({name,size=22,color=colors.ink}:{name:IconName;size?:number;color?:string}) {
  return <Image source={icons[name]} accessible={false} style={{width:size,height:size,tintColor:color}}/>;
}
export const art = {room:require('../../../../assets/godot/loft/room-v1.png'), courtyard:require('../../../../assets/godot/morning/courtyard.png'), bundle:require('../../../../assets/godot/morning/bundle.png')};
export const catalog: Record<string,{name:string;short?:string;detail:string;kind:'supply'|'postcard';art:ImageSourcePropType}> = {
  test_food:{name:'旅行食物',short:'食物',detail:'出发时使用 1 份',kind:'supply',art:require('../../../../assets/godot/ui/bento.png')},
  test_supply:{name:'旅行用品',short:'水壶',detail:'出发时使用 1 份',kind:'supply',art:require('../../../../assets/godot/ui/water.png')},
  test_postcard_forest:{name:'林间来信',detail:'穿过树影，风带着草木的气息。把这一小段安静，也带回家。',kind:'postcard',art:require('../../../../assets/godot/ui/forest.png')},
  test_postcard_stream:{name:'溪边的午后',detail:'溪水绕过石头，留下细细的声音。路边的风景，值得慢慢看。',kind:'postcard',art:require('../../../../assets/godot/ui/stream.png')},
  test_postcard_meadow:{name:'草地上的风',detail:'草地上的白色小花，轻轻点着头。今天也有许多小小的美好。',kind:'postcard',art:require('../../../../assets/godot/ui/garden.png')},
};
export const PanelContext = createContext<{close?:()=>void;back?:()=>void;notice?:ReactNode;maxHeight:number;fullScreen?:boolean}>({maxHeight:660});
export function Page({title,subtitle,children,footer,followEnd=false}:{title:string;subtitle?:string;children:ReactNode;footer?:ReactNode;followEnd?:boolean}) {
  const {close,back,notice,maxHeight,fullScreen}=useContext(PanelContext);
  const [body,setBody]=useState(0),[head,setHead]=useState(86),[foot,setFoot]=useState(footer?106:0);
  const titleRef=useRef<Text>(null);
  const scrollRef=useRef<ScrollView>(null),atEnd=useRef(true);
  useEffect(()=>{const timer=setTimeout(()=>{const handle=findNodeHandle(titleRef.current);if(handle)AccessibilityInfo.setAccessibilityFocus(handle);},220);return()=>clearTimeout(timer);},[title]);
  const bodyLimit=Math.max(60,maxHeight-head-foot);
  return <View style={[s.page,fullScreen&&s.screenPage]}>
    <View onLayout={e=>setHead(e.nativeEvent.layout.height)} style={[s.panelHeader,fullScreen&&s.screenHeader]}>
      {fullScreen&&back&&<Pressable accessibilityRole="button" accessibilityLabel="返回上一页" onPress={back} style={s.back}><View style={{transform:[{rotate:'180deg'}]}}><Icon name="arrow" size={21}/></View></Pressable>}
      <View style={{flex:1}}><Text ref={titleRef} accessibilityRole="header" style={s.title}>{title}</Text>{subtitle&&<Copy style={s.subtitle}>{subtitle}</Copy>}</View>
      {!fullScreen&&close&&<Pressable accessibilityRole="button" accessibilityLabel="收起面板" onPress={close} style={s.close}><Icon name="close" color="#9b6d48"/></Pressable>}
    </View>
    <ScrollView ref={scrollRef} style={fullScreen?{flex:1}:{height:Math.min(body||bodyLimit,bodyLimit),flexGrow:0}} contentContainerStyle={s.pageContent} onScroll={e=>{const n=e.nativeEvent;atEnd.current=n.contentOffset.y+n.layoutMeasurement.height>=n.contentSize.height-40;}} scrollEventThrottle={100} onContentSizeChange={(_,h)=>{setBody(h);if(followEnd&&atEnd.current)requestAnimationFrame(()=>scrollRef.current?.scrollToEnd({animated:false}));}} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets={!fullScreen&&Platform.OS==='ios'}>
      {notice}{children}
    </ScrollView>
    {footer&&<View style={s.footer} onLayout={e=>setFoot(e.nativeEvent.layout.height)}>{footer}</View>}
  </View>;
}
export function Copy({children,style}:PropsWithChildren<{style?:StyleProp<TextStyle>}>) {return <Text style={[s.copy,style]}>{children}</Text>;}
export function Action({label,onPress,disabled=false,primary=false,icon}:{label:string;onPress:()=>void;disabled?:boolean;primary?:boolean;icon?:IconName}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[primary?s.primary:s.textAction,disabled&&primary&&s.disabled,pressed&&!disabled&&{opacity:.8}]}>
    {icon&&<Icon name={icon} size={18} color={primary&&!disabled?'#fffdf4':colors.green}/>}<Text style={[s.actionText,primary?s.primaryText:s.textActionText,disabled&&s.disabledText]}>{label}</Text>
  </Pressable>;
}
export function Art({source,height=160}:{source?:ImageSourcePropType;height?:number}) {return source?<Image source={source} resizeMode="contain" accessibilityIgnoresInvertColors style={{width:'100%',height}}/>:null;}
export function Empty({icon,title,children}:{icon:IconName;title:string;children?:ReactNode}) {return <View style={s.empty}><Icon name={icon} size={54} color="#89916b"/><Text style={s.emptyTitle}>{title}</Text>{children}</View>;}
export function Postcard({itemId,date,quantity=1,small=false}:{itemId:string;date?:string;quantity?:number;small?:boolean}) {
 const entry=catalog[itemId];
 return <View style={[s.postcard,small&&s.smallPostcard]}>{entry?<Image source={entry.art} resizeMode="cover" accessibilityLabel={entry.name} style={{width:'100%',height:small?82:165}}/>:<View style={[s.unknownArt,{height:small?82:130}]}><Icon name="book" size={36}/></View>}
 <View style={s.cardCaption}><Text style={[s.cardTitle,small&&{fontSize:14}]}>{entry?.name??itemId}</Text>{(date||quantity>1)&&<Copy style={s.cardDate}>{date?formatDate(date):''}{quantity>1?` · ×${quantity}`:''}</Copy>}</View></View>;
}
export function formatDate(value:string){const date=new Date(value);return Number.isFinite(date.valueOf())?`${date.getMonth()+1}月${date.getDate()}日`:'';}
export const s=StyleSheet.create({
 page:{backgroundColor:colors.paper,borderTopLeftRadius:19,borderTopRightRadius:13,borderBottomRightRadius:14,borderBottomLeftRadius:12,overflow:'hidden'},
 screenPage:{flex:1,borderRadius:0,borderTopLeftRadius:0,borderTopRightRadius:0,borderBottomLeftRadius:0,borderBottomRightRadius:0},screenHeader:{paddingTop:12,paddingBottom:16,paddingLeft:16,paddingRight:22},back:{width:44,height:44,alignItems:'center',justifyContent:'center',marginLeft:-6,marginTop:-4},
 panelHeader:{flexDirection:'row',alignItems:'flex-start',gap:7,paddingTop:21,paddingBottom:10,paddingLeft:22,paddingRight:12},
 title:{fontFamily:titleFont,fontSize:25,lineHeight:35,color:colors.ink},subtitle:{fontSize:12,lineHeight:20,marginTop:5},
 close:{width:48,height:48,alignItems:'center',justifyContent:'center',marginTop:-8,marginRight:-1},pageContent:{paddingHorizontal:22,paddingBottom:12,gap:12},footer:{paddingHorizontal:22,paddingTop:10,paddingBottom:16},
 copy:{fontSize:13,lineHeight:23,color:colors.muted},primary:{minHeight:48,paddingHorizontal:16,paddingVertical:11,borderTopLeftRadius:17,borderTopRightRadius:15,borderBottomRightRadius:18,borderBottomLeftRadius:16,backgroundColor:colors.green,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:9},
 disabled:{backgroundColor:colors.disabled},disabledText:{color:'#655e4d'},actionText:{fontSize:17,lineHeight:24,textAlign:'center'},primaryText:{fontFamily:titleFont,color:'#fffdf4'},textAction:{minHeight:48,alignItems:'center',justifyContent:'center',padding:11,flexDirection:'row',gap:8},textActionText:{fontSize:13,color:colors.green,textDecorationLine:'underline'},
 input:{minHeight:48,padding:12,borderWidth:1,borderColor:'#ccb99e',borderRadius:8,fontSize:16,color:colors.ink,backgroundColor:'#fffbf3'},field:{gap:8,marginVertical:4},label:{fontSize:13,color:colors.ink},row:{flexDirection:'row',gap:15},
 item:{flex:1,minHeight:142,padding:11,borderWidth:1,borderColor:colors.line,borderTopLeftRadius:11,borderTopRightRadius:8,borderBottomLeftRadius:9,borderBottomRightRadius:10,alignItems:'center'},selected:{backgroundColor:colors.selected,borderColor:'#87906b'},itemTitle:{fontFamily:titleFont,fontSize:16,lineHeight:26,color:colors.ink},check:{position:'absolute',top:8,left:8,width:18,height:18,borderWidth:1,borderColor:'#b5ac90',borderRadius:4,alignItems:'center',justifyContent:'center'},checkSelected:{backgroundColor:colors.green,borderColor:colors.green},
 bundle:{height:138,marginHorizontal:-10,marginTop:6,justifyContent:'center',alignItems:'center'},packed:{flexDirection:'row',gap:18,alignItems:'center',marginTop:-6},packedItem:{width:70,alignItems:'center'},packedLabel:{fontFamily:titleFont,fontSize:13,color:colors.ink,backgroundColor:'#fff8e6dd',paddingHorizontal:8,paddingVertical:2},summary:{textAlign:'center',fontSize:13,lineHeight:25,color:'#775336',paddingTop:4},
 postcard:{backgroundColor:'#fffaf0',padding:9,paddingBottom:12,marginHorizontal:3,marginTop:8,marginBottom:10,transform:[{rotate:'-1.5deg'}],shadowColor:'#735d3e',shadowOffset:{width:0,height:3},shadowRadius:8,shadowOpacity:.10,elevation:1},smallPostcard:{margin:0,marginHorizontal:0,marginVertical:0,transform:[{rotate:'1.5deg'}]},cardCaption:{paddingTop:8,paddingHorizontal:4,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:5,flexWrap:'wrap'},cardTitle:{fontFamily:titleFont,fontSize:16,lineHeight:25,color:colors.ink,flexShrink:1},cardDate:{fontSize:11,lineHeight:18},unknownArt:{alignItems:'center',justifyContent:'center',backgroundColor:'#f1e8d6'},
 center:{textAlign:'center'},empty:{paddingVertical:28,paddingHorizontal:8,alignItems:'center',gap:12},emptyTitle:{fontFamily:titleFont,fontSize:23,lineHeight:32,color:colors.ink,textAlign:'center'},switchRow:{minHeight:65,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:16,borderBottomWidth:1,borderColor:'#e5d8c5',paddingVertical:9},switchTitle:{fontSize:14,color:colors.ink},switchHelp:{fontSize:11,lineHeight:19,marginTop:5},alert:{backgroundColor:'#f1e5d4',borderRadius:6,padding:12,gap:4},alertCopy:{color:'#844c31',fontSize:12,lineHeight:20},
 });
